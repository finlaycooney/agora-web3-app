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

-- Bounded staff listing reads for the workspace overview pages. Both are
-- SECURITY DEFINER reads under the existing executor table policies — no new
-- grants. Results are capped at 500 rows; ordering is newest-first keyset
-- compatible so a cursor can be added without changing the contract.
create function app.list_clients_v1(p_limit integer default 200)
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
    v_member := app.recruitment_actor_v1(array['clients.read'], null, null, false);
    v_limit := coalesce(p_limit, 200);
    if v_limit < 1 or v_limit > 500 then
        raise exception 'Invalid list limit' using errcode = '22023';
    end if;
    return (
        select coalesce(jsonb_agg(t.row_data order by t.created_at desc, t.id desc), '[]'::jsonb)
        from (
            select c.created_at, c.id,
                jsonb_build_object(
                    'id', c.id,
                    'name', c.name,
                    'status', c.status,
                    'isStealth', c.is_stealth,
                    'version', c.version::text,
                    'publicProfileVersion', c.public_profile_version::text,
                    'jobCount', (select count(*) from app.jobs j
                        where j.organization_id = c.organization_id
                            and j.client_id = c.id),
                    'createdAt', c.created_at
                ) as row_data
            from app.clients c
            where c.organization_id = v_org
            order by c.created_at desc, c.id desc
            limit v_limit
        ) t
    );
end
$$;

create function app.list_jobs_v1(
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

revoke all on function app.list_clients_v1(integer) from public;
revoke all on function app.list_jobs_v1(integer, text, uuid) from public;

grant execute on function app.list_clients_v1(integer) to app_staff;
grant execute on function app.list_jobs_v1(integer, text, uuid) to app_staff;

grant create on schema app to app_executor;

reset role;

alter function app.list_clients_v1(integer) owner to app_executor;
alter function app.list_jobs_v1(integer, text, uuid) owner to app_executor;

set local role app_owner;

revoke create on schema app from app_executor;

commit;
