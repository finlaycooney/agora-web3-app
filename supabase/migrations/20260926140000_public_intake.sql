-- Public intake: the public jobs board reads published jobs through
-- app.list_public_jobs_v1, and submissions land directly in the pipeline via
-- app.submit_public_application_v1. Both procedures run without a staff actor
-- (anonymous context) and are granted to the reserved app_intake role only.
-- Staff additionally get set_job_public_listing_v1 to hide a published job
-- from the public board without withdrawing it.

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

alter table app.jobs
    add column publicly_listed boolean not null default true;

alter table app.recruitment_operation_receipts
    drop constraint recruitment_operation_receipts_kind_check;

alter table app.recruitment_operation_receipts
    add constraint recruitment_operation_receipts_kind_check check (kind in (
        'client.saved',
        'client.draft.saved',
        'job.draft.created',
        'job.draft.saved',
        'job.revision.started',
        'job.duplicated',
        'job.published',
        'job.listing.changed'
    ));

-- Extend the audit action allowlist: staff listing toggles and intake
-- application receipts.
do $$
declare
    v_count integer;
    v_name text;
begin
    select count(*), min(con.conname) into v_count, v_name
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = 'audit_events' and con.contype = 'c'
        and con.conname = 'audit_events_action_check';
    if v_count <> 1 then
        raise exception 'Expected exactly one audit action check constraint, found %', v_count;
    end if;
    execute format('alter table app.audit_events drop constraint %I', v_name);
end
$$;

alter table app.audit_events
    add constraint audit_events_action_check check (
        (
            action = 'staff.membership.changed'
            and target_type = 'organization_membership'
            and actor_kind = 'staff'
            and details - array[
                'previous_role_id', 'new_role_id', 'previous_status',
                'new_status', 'previous_version', 'new_version'
            ] = '{}'::jsonb
        ) or (
            action = 'staff.role_grants.changed'
            and target_type = 'role'
            and actor_kind = 'staff'
            and details - array[
                'before_keys', 'after_keys', 'previous_version', 'new_version'
            ] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'privacy_request'
            and target_id is not null
            and action in (
                'privacy.request.created',
                'privacy.request.verified',
                'privacy.subject.reviewed',
                'privacy.candidate.corrected',
                'privacy.subject.restricted'
            )
            and details - array[
                'subject_id', 'target_id', 'target_kind', 'previous_version',
                'new_version', 'target_previous_version', 'target_new_version',
                'changed_fields', 'lifecycle_generation', 'enforcement_scope'
            ] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_id is not null
            and (
                (action in ('client.saved', 'client.draft.saved')
                    and target_type = 'client')
                or (action in (
                        'job.draft.created',
                        'job.draft.saved',
                        'job.revision.started',
                        'job.duplicated',
                        'job.published'
                    ) and target_type = 'job')
            )
            and details - array[
                'previous_version', 'new_version', 'revision_id', 'client_id',
                'public_profile_changed', 'source_job_id', 'source_revision_id',
                'field_names'
            ] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'job'
            and target_id is not null
            and action = 'job.listing.changed'
            and details - array[
                'previous_version', 'new_version', 'publicly_listed'
            ] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'totp_credential'
            and target_id is not null
            and action in (
                'staff.totp.enrolled',
                'staff.totp.activated',
                'staff.totp.verified'
            )
            and details - array['credential_id', 'last_used_counter'] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'organization_membership'
            and target_id is not null
            and (
                (action = 'staff.member.invited'
                    and details - array['user_id', 'role_id'] = '{}'::jsonb)
                or (action = 'staff.invite.claimed'
                    and details - array['identity_id'] = '{}'::jsonb)
            )
        ) or (
            action = 'staff.invite_domains.changed'
            and target_type = 'organization'
            and actor_kind = 'staff'
            and target_id is not null
            and details - array['domains'] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'application'
            and target_id is not null
            and action = 'application.stage.changed'
            and details - array[
                'previous_version', 'new_version',
                'from_stage_id', 'to_stage_id', 'reason'
            ] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'candidate_note'
            and target_id is not null
            and action = 'candidate.note.added'
            and details - array['candidate_id'] = '{}'::jsonb
        ) or (
            actor_kind = 'staff'
            and target_type = 'document'
            and target_id is not null
            and action = 'document.downloaded'
            and details - array['candidate_id'] = '{}'::jsonb
        ) or (
            actor_kind = 'intake'
            and actor_user_id is null
            and actor_membership_id is null
            and target_type = 'application'
            and target_id is not null
            and action = 'application.received'
            and details - array[
                'candidate_id', 'job_id', 'public_reference', 'document_id'
            ] = '{}'::jsonb
        )
    );

-- Executor grants for the intake write path (staff reads keep their existing
-- permission-gated policies; these tables get additional actor-less policies
-- below).
grant insert on app.candidates to app_executor;
grant insert on app.candidate_sources to app_executor;
grant insert on app.candidate_identifiers to app_executor;
grant insert on app.applications to app_executor;
grant insert on app.file_blobs to app_executor;
grant insert on app.blob_locations to app_executor;
grant insert on app.documents to app_executor;
grant insert on app.application_documents to app_executor;

grant update (publicly_listed) on app.jobs to app_executor;
grant update (current_document_id, updated_at, version) on app.candidates to app_executor;

-- Intake policies: reachable only from actor-less contexts (the app_intake
-- role can execute just the two intake procedures, and those set the
-- organization context themselves). All predicates require both an empty
-- actor context and the row's organization to match.
create policy executor_intake_jobs_select on app.jobs
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_job_revisions_select on app.job_revisions
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_clients_select on app.clients
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_pipeline_stages_select on app.pipeline_stages
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_candidates_select on app.candidates
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_candidates_insert on app.candidates
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_candidates_update on app.candidates
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null)
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_candidate_sources_insert on app.candidate_sources
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_candidate_identifiers_select on app.candidate_identifiers
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_candidate_identifiers_insert on app.candidate_identifiers
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_applications_select on app.applications
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_applications_insert on app.applications
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_stage_history_insert on app.application_stage_history
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

-- The location-verify trigger reads the blob row back under the invoker's
-- policies, so intake needs a plain read path too.
create policy executor_intake_file_blobs_select on app.file_blobs
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_file_blobs_insert on app.file_blobs
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_blob_locations_insert on app.blob_locations
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_documents_insert on app.documents
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_application_documents_insert on app.application_documents
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null);

create policy executor_intake_audit_insert on app.audit_events
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.context_uuid_v1('app.actor_id') is null
        and actor_kind = 'intake'
        and actor_user_id is null
        and actor_membership_id is null);

-- blob_location_verify_v1 locks the blob row FOR KEY SHARE before checking the
-- location metadata. Row locks additionally require UPDATE-policy visibility,
-- but the only file_blobs update policy is privacy.manage-scoped, and intake
-- has no staff actor at all — so the intake path could never register a
-- location. The lock protects nothing anyway: file_blob_identity_guard_v1
-- already makes the compared fields immutable, and there is no executor delete
-- path. Replaced here with a plain select so verification holds without it.
create or replace function app.blob_location_verify_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_blob app.file_blobs%rowtype;
begin
    if new.state = 'available' then
        select b.* into v_blob
        from app.file_blobs b
        where b.organization_id = new.organization_id
            and b.id = new.blob_id;
        if v_blob.id is null
            or v_blob.sha256 is distinct from new.verified_sha256
            or v_blob.size_bytes is distinct from new.verified_size_bytes then
            raise exception 'blob location verification does not match blob metadata'
                using errcode = 'check_violation';
        end if;
    end if;
    return new;
end
$$;

-- Staff toggle: show or hide a published job on the public board. Versioned
-- and audited like the other job mutations.
create function app.set_job_public_listing_v1(
    p_job_id uuid,
    p_listed boolean,
    p_expected_version bigint,
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
    v_job app.jobs;
    v_result jsonb;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'jobs.write'],
        p_operation_id, p_correlation_id, true);
    if p_job_id is null or p_listed is null
        or p_expected_version is null or p_expected_version <= 0 then
        raise exception 'set_job_public_listing_v1 requires a job id, a listed flag and a positive expected version'
            using errcode = '22023';
    end if;
    v_digest := pg_catalog.sha256(pg_catalog.convert_to(
        jsonb_build_object(
            'kind', 'job.listing.changed',
            'jobId', p_job_id,
            'listed', p_listed,
            'expectedVersion', p_expected_version
        )::text, 'UTF8'));
    v_replay := app.recruitment_receipt_v1(
        p_operation_id, 'job.listing.changed', v_digest);
    if v_replay is not null then
        return v_replay;
    end if;

    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = p_job_id
    for update of j;
    if not found then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    if v_job.version <> p_expected_version then
        raise exception 'Job version does not match expected version'
            using errcode = '40001';
    end if;

    update app.jobs set
        publicly_listed = p_listed,
        version = v_job.version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and id = p_job_id;

    v_result := jsonb_build_object(
        'jobId', p_job_id,
        'publiclyListed', p_listed,
        'version', (v_job.version + 1)::text
    );
    perform app.recruitment_record_v1(
        p_operation_id, p_correlation_id, v_member, 'job.listing.changed',
        p_job_id, v_digest, v_result,
        jsonb_build_object(
            'previous_version', v_job.version,
            'new_version', v_job.version + 1,
            'publicly_listed', p_listed
        )
    );
    return v_result;
end
$$;

-- Public board listing. Returns only published, listed jobs whose published
-- revision survives the stealth leak projection; closed jobs are flagged so
-- the UI can render them without an apply action.
create function app.list_public_jobs_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
begin
    if v_org is null
        or app.context_uuid_v1('app.actor_id') is not null then
        raise exception 'Public intake context is required'
            using errcode = '42501';
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

-- Public application submission. Finds the published, listed, open job by
-- slug; dedupes the candidate on normalized email; records the application on
-- the pipeline's initial stage with an intake history row; registers the CV
-- through the verified blob chain; and audits the receipt. Idempotent on
-- public_reference so retried submissions are safe. A per-address daily cap
-- blunts scripted abuse even if the route-level IP limiter is bypassed.
create function app.submit_public_application_v1(
    p_candidate_id uuid,
    p_source_id uuid,
    p_email_identifier_id uuid,
    p_url_identifier_id uuid,
    p_application_id uuid,
    p_history_id uuid,
    p_audit_id uuid,
    p_correlation_id uuid,
    p_blob_id uuid,
    p_location_id uuid,
    p_document_id uuid,
    p_job_slug text,
    p_public_reference text,
    p_full_name text,
    p_email text,
    p_professional_url text,
    p_achievement text,
    p_blob_sha256 bytea,
    p_blob_size_bytes bigint,
    p_mime_type text,
    p_extension text,
    p_bucket text,
    p_object_key text,
    p_filename text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_job app.jobs;
    v_stage app.pipeline_stages;
    v_candidate_id uuid;
    v_existing app.applications;
    v_email_norm text;
    v_daily integer;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if v_org is null
        or app.context_uuid_v1('app.actor_id') is not null then
        raise exception 'Public intake context is required'
            using errcode = '42501';
    end if;
    if p_candidate_id is null or p_source_id is null
        or p_email_identifier_id is null or p_application_id is null
        or p_history_id is null or p_audit_id is null
        or p_correlation_id is null then
        raise exception 'submit_public_application_v1 requires nonnull identifiers'
            using errcode = '22023';
    end if;
    if p_job_slug is null or btrim(p_job_slug) = ''
        or length(p_job_slug) > 200 then
        raise exception 'Invalid job slug' using errcode = '22023';
    end if;
    if p_public_reference is null
        or p_public_reference !~ '^AG-[0-9A-F]{12}$' then
        raise exception 'Invalid public reference' using errcode = '22023';
    end if;
    if p_full_name is null or btrim(p_full_name) = ''
        or octet_length(p_full_name) > 512 then
        raise exception 'Invalid applicant name' using errcode = '22023';
    end if;
    if p_email is null or btrim(p_email) = '' or octet_length(p_email) > 640
        or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Invalid applicant email' using errcode = '22023';
    end if;
    if p_professional_url is not null
        and (octet_length(p_professional_url) > 4096
            or p_professional_url !~ '^https?://') then
        raise exception 'Invalid professional URL' using errcode = '22023';
    end if;
    if p_achievement is not null and octet_length(p_achievement) > 8000 then
        raise exception 'Invalid achievement text' using errcode = '22023';
    end if;
    if (p_blob_id is null) <> (p_location_id is null and p_document_id is null
        and p_blob_sha256 is null and p_blob_size_bytes is null
        and p_mime_type is null and p_extension is null
        and p_bucket is null and p_object_key is null and p_filename is null) then
        raise exception 'Document metadata must be complete or absent'
            using errcode = '22023';
    end if;
    if p_blob_id is not null then
        if p_blob_size_bytes < 1 or p_blob_size_bytes > 4194304
            or pg_catalog.octet_length(p_blob_sha256) <> 32 then
            raise exception 'Invalid blob metadata' using errcode = '22023';
        end if;
        if not (
            (p_mime_type = 'application/pdf' and p_extension = 'pdf')
            or (p_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                and p_extension = 'docx')
        ) then
            raise exception 'Invalid document type' using errcode = '22023';
        end if;
    end if;

    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.slug = btrim(p_job_slug);
    if not found
        or v_job.publication_state <> 'published'
        or not v_job.publicly_listed
        or v_job.application_state <> 'open' then
        raise exception 'Job is not accepting applications'
            using errcode = 'P0002';
    end if;

    -- Idempotency: a retried submission returns the original application.
    select a.* into v_existing
    from app.applications a
    where a.organization_id = v_org and a.public_reference = p_public_reference;
    if found then
        return pg_catalog.jsonb_build_object(
            'accepted', true,
            'duplicate', true,
            'applicationId', v_existing.id,
            'publicReference', v_existing.public_reference
        );
    end if;

    v_email_norm := lower(btrim(p_email));

    -- Reuse an existing active candidate on matching email identifier.
    select i.candidate_id into v_candidate_id
    from app.candidate_identifiers i
    join app.candidates c
        on c.organization_id = i.organization_id
        and c.id = i.candidate_id
    where i.organization_id = v_org
        and i.kind = 'email'
        and i.normalized_value = v_email_norm
        and c.lifecycle = 'active'
    order by i.received_at desc, i.id desc
    limit 1;

    -- A repeat application to the same job is a no-op returning the original.
    if v_candidate_id is not null then
        select a.* into v_existing
        from app.applications a
        where a.organization_id = v_org
            and a.candidate_id = v_candidate_id
            and a.job_id = v_job.id
        order by a.received_at desc, a.id desc
        limit 1;
        if found then
            return pg_catalog.jsonb_build_object(
                'accepted', true,
                'duplicate', true,
                'applicationId', v_existing.id,
                'candidateId', v_candidate_id,
                'publicReference', v_existing.public_reference,
                'reusedCandidate', true
            );
        end if;
    end if;

    -- Per-address daily cap across the organization, so an IP-rotating
    -- submitter cannot flood one mailbox's pipeline entries either.
    select count(*) into v_daily
    from app.applications a
    where a.organization_id = v_org
        and lower(coalesce(a.submitted_email, '')) = v_email_norm
        and a.received_at > v_now - interval '24 hours';
    if v_daily >= 10 then
        raise exception 'Too many submissions for this address'
            using errcode = '54000';
    end if;

    if v_candidate_id is null then
        v_candidate_id := p_candidate_id;
        insert into app.candidates (
            id, organization_id, full_name, identity_state, lifecycle
        ) values (
            p_candidate_id, v_org, btrim(p_full_name), 'provisional', 'active'
        );
    end if;

    insert into app.candidate_sources (
        id, organization_id, candidate_id, kind, received_at, context_summary
    ) values (
        p_source_id, v_org, v_candidate_id, 'public_application', v_now,
        'Applied via the public jobs board'
    );

    insert into app.candidate_identifiers (
        id, organization_id, candidate_id, kind, raw_value, normalized_value,
        normalization_version, verification, source_id, received_at
    ) values (
        p_email_identifier_id, v_org, v_candidate_id, 'email',
        btrim(p_email), v_email_norm, 1, 'unverified', p_source_id, v_now
    );

    if p_professional_url is not null and btrim(p_professional_url) <> '' then
        insert into app.candidate_identifiers (
            id, organization_id, candidate_id, kind, raw_value, normalized_value,
            normalization_version, verification, source_id, received_at
        ) values (
            p_url_identifier_id, v_org, v_candidate_id, 'professional_url',
            btrim(p_professional_url), lower(btrim(p_professional_url)), 1,
            'unverified', p_source_id, v_now
        );
    end if;

    select s.* into v_stage
    from app.pipeline_stages s
    where s.organization_id = v_org
        and s.pipeline_id = v_job.pipeline_id
        and s.is_initial
        and s.archived_at is null;
    if not found then
        raise exception 'Job pipeline has no initial stage'
            using errcode = 'P0002';
    end if;

    insert into app.applications (
        id, organization_id, candidate_id, job_id, pipeline_id, stage_id,
        public_reference, reference_version, submitted_name, submitted_email,
        submitted_professional_url, submitted_achievement, submitted_job_title,
        source_id, received_at
    ) values (
        p_application_id, v_org, v_candidate_id, v_job.id, v_job.pipeline_id,
        v_stage.id, p_public_reference, 1, btrim(p_full_name), btrim(p_email),
        nullif(btrim(coalesce(p_professional_url, '')), ''),
        nullif(btrim(coalesce(p_achievement, '')), ''),
        v_job.title, p_source_id, v_now
    );

    insert into app.application_stage_history (
        id, organization_id, application_id, sequence,
        from_pipeline_id, from_stage_id, to_pipeline_id, to_stage_id,
        actor_membership_id, actor_kind, reason, occurred_at
    ) values (
        p_history_id, v_org, p_application_id, 1, null, null,
        v_job.pipeline_id, v_stage.id, null, 'intake',
        'Application received', v_now
    );

    if p_blob_id is not null then
        insert into app.file_blobs (
            id, organization_id, candidate_id, sha256, size_bytes,
            mime_type, extension, lifecycle, scan_state
        ) values (
            p_blob_id, v_org, v_candidate_id, p_blob_sha256,
            p_blob_size_bytes, p_mime_type, p_extension, 'live', 'unscanned'
        );
        insert into app.blob_locations (
            id, organization_id, blob_id, backend_key, bucket, object_key,
            state, is_primary, verified_sha256, verified_size_bytes, verified_at
        ) values (
            p_location_id, v_org, p_blob_id, 'supabase_storage', p_bucket,
            p_object_key, 'available', true, p_blob_sha256, p_blob_size_bytes,
            v_now
        );
        insert into app.documents (
            id, organization_id, candidate_id, blob_id, purpose,
            original_filename, source_id, received_at, lifecycle
        ) values (
            p_document_id, v_org, v_candidate_id, p_blob_id, 'cv',
            left(p_filename, 512), p_source_id, v_now, 'active'
        );
        update app.candidates set
            current_document_id = p_document_id,
            updated_at = v_now,
            version = version + 1
        where organization_id = v_org and id = v_candidate_id;
        insert into app.application_documents (
            organization_id, candidate_id, application_id, document_id,
            submitted_filename, attached_at
        ) values (
            v_org, v_candidate_id, p_application_id, p_document_id,
            left(p_filename, 512), v_now
        );
    end if;

    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'intake', null, null, 'application.received',
        'application', p_application_id, p_correlation_id, v_now,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'candidate_id', v_candidate_id,
            'job_id', v_job.id,
            'public_reference', p_public_reference,
            'document_id', p_document_id
        ))
    );

    return pg_catalog.jsonb_build_object(
        'accepted', true,
        'duplicate', false,
        'applicationId', p_application_id,
        'candidateId', v_candidate_id,
        'publicReference', p_public_reference,
        'reusedCandidate', v_candidate_id is distinct from p_candidate_id,
        'documentId', p_document_id
    );
end
$$;

revoke all on function app.set_job_public_listing_v1(uuid, boolean, bigint, uuid, uuid) from public;
revoke all on function app.list_public_jobs_v1() from public;
revoke all on function app.submit_public_application_v1(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text, text, text, text,
    bytea, bigint, text, text, text, text, text) from public;

grant usage on schema app to app_intake;
grant execute on function app.set_job_public_listing_v1(uuid, boolean, bigint, uuid, uuid) to app_staff;
grant execute on function app.list_public_jobs_v1() to app_intake;
grant execute on function app.submit_public_application_v1(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text, text, text, text,
    bytea, bigint, text, text, text, text, text) to app_intake;

-- Procedures run as app_executor: the ALTER OWNER requires schema CREATE on
-- the target role, so grant it (as app_owner, the schema owner), transfer
-- ownership as the migration operator, then revoke it again.
grant create on schema app to app_executor;

reset role;

-- get_job_workspace_v1 gains the listing flag. It is already owned by
-- app_executor, so the replacement runs under that role and keeps ownership.
set local role app_executor;

create or replace function app.get_job_workspace_v1(p_job_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_job app.jobs;
    v_client app.clients;
    v_draft app.job_revisions;
    v_published app.job_revisions;
    v_needs_review boolean := false;
begin
    v_member := app.recruitment_actor_v1(
        array['jobs.read', 'clients.read'], null, null, false);
    if p_job_id is null then
        raise exception 'get_job_workspace_v1 requires a job id' using errcode = '22023';
    end if;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.id = p_job_id;
    if not found then
        raise exception 'Job not found' using errcode = 'P0002';
    end if;
    select c.* into v_client
    from app.clients c
    where c.organization_id = v_org and c.id = v_job.client_id;
    select r.* into v_draft
    from app.job_revisions r
    where r.organization_id = v_org and r.job_id = p_job_id and r.status = 'draft';
    if v_job.published_revision_id is not null then
        select r.* into v_published
        from app.job_revisions r
        where r.organization_id = v_org and r.job_id = p_job_id
            and r.id = v_job.published_revision_id;
        if found and v_client.id is not null
            and v_client.public_profile_version
                is distinct from v_published.published_client_profile_version then
            v_needs_review := true;
        end if;
    end if;
    return jsonb_build_object(
        'job', jsonb_build_object(
            'id', v_job.id,
            'clientId', v_job.client_id,
            'pipelineId', v_job.pipeline_id,
            'slug', v_job.slug,
            'title', v_job.title,
            'publicationState', v_job.publication_state,
            'applicationState', v_job.application_state,
            'publiclyListed', v_job.publicly_listed,
            'publishedRevisionId', v_job.published_revision_id,
            'version', v_job.version::text
        ),
        'draft', case when v_draft.id is null then null
            else app.job_revision_dto_v1(v_draft) end,
        'published', case when v_published.id is null then null
            else app.job_revision_dto_v1(v_published) end,
        'publicationNeedsReview', v_needs_review
    );
end
$$;

reset role;

alter function app.set_job_public_listing_v1(uuid, boolean, bigint, uuid, uuid) owner to app_executor;
alter function app.list_public_jobs_v1() owner to app_executor;
alter function app.submit_public_application_v1(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text, text, text, text,
    bytea, bigint, text, text, text, text, text) owner to app_executor;

set local role app_owner;

revoke create on schema app from app_executor;

commit;
