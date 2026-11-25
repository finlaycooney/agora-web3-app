begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
    if current_setting('server_version_num')::integer / 10000 <> 17 then
        raise exception 'Foundation requires PostgreSQL 17';
    end if;
    if not (select rolsuper from pg_catalog.pg_roles where rolname = session_user) then
        execute format('grant app_owner to %I with inherit true, set true', session_user);
        execute format('grant app_executor to %I with set true, inherit false', session_user);
    end if;
end
$$;

set local role app_owner;

create function app.create_job_draft_v2(
    p_job_id uuid,
    p_revision_id uuid,
    p_client_id uuid,
    p_fields jsonb,
    p_publicly_listed boolean,
    p_operation_id uuid,
    p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_digest bytea;
    v_replay jsonb;
    v_client app.clients;
    v_pipeline uuid;
    v_doc jsonb;
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'jobs.write', 'clients.read'],
        p_operation_id, p_correlation_id, true);
    if p_job_id is null or p_revision_id is null or p_client_id is null
        or p_publicly_listed is null then
        raise exception 'Job, revision, client ids and public visibility are required'
            using errcode = '22023';
    end if;
    if not app.job_fields_valid_v1(p_fields, false) then
        raise exception 'Job fields are invalid' using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'job.draft.created',
            'jobId', p_job_id,
            'revisionId', p_revision_id,
            'clientId', p_client_id,
            'fields', p_fields,
            'publiclyListed', p_publicly_listed
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(p_operation_id, 'job.draft.created', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = p_client_id
    for update of c;
    if not found then
        raise exception 'Client not found' using errcode = 'P0002';
    end if;
    if not app.client_configured_v1(v_client) then
        raise exception 'Client is not active and configured' using errcode = '23514';
    end if;

    select p.id into v_pipeline
    from app.pipelines p
    where p.organization_id = v_org and p.key = 'default' and p.status = 'active';
    if v_pipeline is null then
        raise exception 'A default active pipeline is required' using errcode = '23514';
    end if;

    insert into app.jobs (
        id, organization_id, client_id, pipeline_id, slug, title, description,
        location_display, employment_type, publication_state, application_state,
        publicly_listed, version
    ) values (
        p_job_id, v_org, p_client_id, v_pipeline, 'job-' || p_job_id::text,
        btrim(p_fields ->> 'title'), '', '', '', 'draft', 'open', p_publicly_listed, 1
    );

    v_doc := p_fields -> 'descriptionDocument';
    insert into app.job_revisions (
        id, organization_id, job_id, revision_number, title,
        employment_type, workplace_mode, locations, remote_regions,
        compensation_min, compensation_max, currency, pay_period, bonuses,
        description_document, description_text, status, version
    ) values (
        p_revision_id, v_org, p_job_id, 1, btrim(p_fields ->> 'title'),
        p_fields ->> 'employmentType', p_fields ->> 'workplaceMode',
        coalesce((
            select array_agg(btrim(e.value) order by e.ord)
            from jsonb_array_elements_text(p_fields -> 'locations')
                with ordinality as e(value, ord)
        ), '{}'::text[]),
        coalesce((
            select array_agg(btrim(e.value) order by e.ord)
            from jsonb_array_elements_text(p_fields -> 'remoteRegions')
                with ordinality as e(value, ord)
        ), '{}'::text[]),
        (p_fields ->> 'compensationMin')::numeric,
        (p_fields ->> 'compensationMax')::numeric,
        p_fields ->> 'currency', p_fields ->> 'payPeriod',
        p_fields -> 'bonuses',
        v_doc, app.job_document_text_v1(v_doc), 'draft', 1
    );

    v_result := jsonb_build_object(
        'jobId', p_job_id,
        'revisionId', p_revision_id,
        'jobVersion', '1',
        'revisionVersion', '1',
        'publiclyListed', p_publicly_listed,
        'status', 'draft'
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'job.draft.created', p_job_id,
        v_digest, v_result,
        jsonb_build_object(
            'revision_id', p_revision_id,
            'client_id', p_client_id,
            'new_version', 1
        )
    );
    return v_result;
end
$$;

revoke all on function app.create_job_draft_v2(uuid, uuid, uuid, jsonb, boolean, uuid, uuid) from public;
grant execute on function app.create_job_draft_v2(uuid, uuid, uuid, jsonb, boolean, uuid, uuid) to app_staff;
grant insert (publicly_listed) on app.jobs to app_executor;
grant create on schema app to app_executor;
reset role;
alter function app.create_job_draft_v2(uuid, uuid, uuid, jsonb, boolean, uuid, uuid) owner to app_executor;
set local role app_executor;

create or replace function app.list_jobs_v1(
    p_limit integer default 200,
    p_publication_state text default null,
    p_owner_membership_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_limit integer;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'clients.read'], null, null, false);
    v_limit := coalesce(p_limit, 200);
    if v_limit < 1 or v_limit > 500 then
        raise exception 'Invalid list limit' using errcode = '22023';
    end if;
    if p_publication_state is not null
        and p_publication_state not in ('draft', 'published', 'withdrawn', 'archived') then
        raise exception 'Invalid publication state filter' using errcode = '22023';
    end if;
    return (
        select coalesce(jsonb_agg(t.row_data order by t.created_at desc, t.id desc), '[]'::jsonb)
        from (
            select j.created_at, j.id,
                jsonb_build_object(
                    'id', j.id,
                    'clientId', j.client_id,
                    'clientName', c.name,
                    'clientIsStealth', c.is_stealth,
                    'title', j.title,
                    'slug', j.slug,
                    'publicationState', j.publication_state,
                    'applicationState', j.application_state,
                    'publiclyListed', j.publicly_listed,
                    'ownerMembershipId', j.owner_membership_id,
                    'publishedRevisionId', j.published_revision_id,
                    'draftRevisionId', (select r.id from app.job_revisions r
                        where r.organization_id = j.organization_id
                            and r.job_id = j.id and r.status = 'draft'
                        limit 1),
                    'version', j.version::text,
                    'createdAt', j.created_at
                ) as row_data
            from app.jobs j
            join app.clients c
                on c.organization_id = j.organization_id and c.id = j.client_id
            where j.organization_id = v_org
                and (p_publication_state is null
                    or j.publication_state = p_publication_state)
                and (p_owner_membership_id is null
                    or j.owner_membership_id = p_owner_membership_id)
            order by j.created_at desc, j.id desc
            limit v_limit
        ) t
    );
end
$$;

create or replace function app.list_public_jobs_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
begin
    if v_org is null or app.context_uuid_v1('app.actor_id') is not null then
        raise exception 'Public intake context is required' using errcode = '42501';
    end if;
    return pg_catalog.jsonb_build_object(
        'jobs', coalesce((
            select jsonb_agg(t.row_data order by t.published_at desc, t.id)
            from (
                select j.id, j.published_at,
                    app.job_public_projection_v1(j.published_revision_id)
                        || pg_catalog.jsonb_build_object(
                            'slug', j.slug,
                            'descriptionText', r.description_text,
                            'publishedAt', r.published_at,
                            'applicationOpen', j.application_state = 'open'
                        ) as row_data
                from app.jobs j
                join app.job_revisions r
                    on r.organization_id = j.organization_id
                    and r.id = j.published_revision_id
                where j.organization_id = v_org
                    and j.publication_state = 'published'
                    and j.publicly_listed
                    and j.published_revision_id is not null
            ) t
            where t.row_data is not null
        ), '[]'::jsonb)
    );
end
$$;

reset role;
set local role app_owner;
revoke create on schema app from app_executor;
commit;
