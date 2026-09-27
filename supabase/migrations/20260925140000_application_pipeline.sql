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

-- Staff-authored notes on a candidate. Append-only in this slice: there is no
-- edit or delete path yet, so no archived/deleted state exists.
create table app.candidate_notes (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid not null,
    author_membership_id uuid not null,
    body text not null check (btrim(body) <> '' and octet_length(body) <= 16384),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, candidate_id, id),
    foreign key (organization_id, candidate_id)
        references app.candidates (organization_id, id),
    foreign key (organization_id, author_membership_id)
        references app.organization_memberships (organization_id, id)
);

create index candidate_notes_candidate_idx
    on app.candidate_notes (organization_id, candidate_id, created_at desc, id desc);

alter table app.candidate_notes enable row level security;
alter table app.candidate_notes force row level security;

-- Extend the audit action allowlist with pipeline actions.
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
            and (
                (action = 'application.stage.changed'
                    and details - array[
                        'previous_version', 'new_version',
                        'from_stage_id', 'to_stage_id', 'reason'
                    ] = '{}'::jsonb)
                or (action = 'application.imported'
                    and details - array[
                        'candidate_id', 'job_id', 'source_id', 'document_id'
                    ] = '{}'::jsonb)
            )
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
        )
    );

-- Executor grants for the pipeline surface. Select policies gate reads per
-- permission; insert/update policies gate writes the same way.
grant select on app.candidate_sources to app_executor;
grant select on app.candidate_identifiers to app_executor;
grant select on app.applications to app_executor;
grant select on app.application_stage_history to app_executor;
grant select on app.pipeline_stages to app_executor;
grant select on app.blob_locations to app_executor;
grant select on app.application_documents to app_executor;
grant select, insert on app.candidate_notes to app_executor;

grant insert on app.candidates to app_executor;
grant insert on app.candidate_sources to app_executor;
grant insert on app.candidate_identifiers to app_executor;
grant insert on app.applications to app_executor;
grant insert on app.application_stage_history to app_executor;
grant insert on app.file_blobs to app_executor;
grant insert on app.blob_locations to app_executor;
grant insert on app.documents to app_executor;
grant insert on app.application_documents to app_executor;

grant update (stage_id, updated_at, version) on app.applications to app_executor;
grant update (current_document_id, updated_at, version) on app.candidates to app_executor;

-- Read policies.
create policy executor_applications_select on app.applications
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('applications.read'));

create policy executor_pipeline_applications_insert on app.applications
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.write'));

create policy executor_applications_update on app.applications
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('applications.stage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('applications.stage'));

create policy executor_stage_history_select on app.application_stage_history
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('applications.read'));

create policy executor_stage_history_insert on app.application_stage_history
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('applications.stage'));

create policy executor_pipeline_stages_select on app.pipeline_stages
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('applications.read'));

create policy executor_pipeline_candidates_select on app.candidates
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.read'));

create policy executor_pipeline_candidates_insert on app.candidates
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.write'));

create policy executor_pipeline_candidates_update on app.candidates
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.write'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.write'));

create policy executor_candidate_sources_select on app.candidate_sources
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.read'));

create policy executor_candidate_sources_insert on app.candidate_sources
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.write'));

create policy executor_candidate_identifiers_select on app.candidate_identifiers
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.read'));

create policy executor_candidate_identifiers_insert on app.candidate_identifiers
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.write'));

create policy executor_candidate_notes_select on app.candidate_notes
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('collaboration.read'));

create policy executor_candidate_notes_insert on app.candidate_notes
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('collaboration.write'));

create policy executor_pipeline_documents_select on app.documents
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.read'));

create policy executor_documents_insert on app.documents
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('documents.write'));

create policy executor_pipeline_file_blobs_select on app.file_blobs
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.read'));

create policy executor_file_blobs_insert on app.file_blobs
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('documents.write'));

create policy executor_application_documents_select on app.application_documents
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('candidates.read'));

create policy executor_application_documents_insert on app.application_documents
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('documents.write'));

-- Blob locations carry storage coordinates; only the download permission may
-- read them, and only the import path writes them.
create policy executor_blob_locations_select on app.blob_locations
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('documents.download'));

create policy executor_blob_locations_insert on app.blob_locations
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('documents.write'));

-- blob_location_verify_v1 locks the blob row FOR KEY SHARE before checking the
-- location metadata. Row locks additionally require UPDATE-policy visibility,
-- but the only file_blobs update policy is privacy.manage-scoped, so the
-- import path (documents.write) could never register a location. The lock
-- protects nothing anyway: file_blob_identity_guard_v1 already makes the
-- compared fields immutable, and there is no executor delete path. Replaced
-- here with a plain select so verification holds without the lock.
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

-- Applications directory for the workspace list. Restricted/deleted/merged
-- candidates are excluded: privacy restriction means no routine processing.
create function app.list_applications_v1(
    p_job_id uuid default null,
    p_query text default null,
    p_limit integer default 500
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_limit integer;
    v_query text;
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    if not app.has_permission_v1('applications.read') then
        raise exception 'applications.read permission is required' using errcode = '42501';
    end if;
    v_limit := coalesce(p_limit, 500);
    if v_limit < 1 or v_limit > 1000 then
        raise exception 'Invalid list limit' using errcode = '22023';
    end if;
    v_query := nullif(lower(btrim(coalesce(p_query, ''))), '');
    if v_query is not null and char_length(v_query) > 200 then
        raise exception 'Invalid search query' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
        'applications', (
            select coalesce(jsonb_agg(t.row_data order by t.received_at desc, t.id desc), '[]'::jsonb)
            from (
                select a.id, a.received_at,
                    jsonb_build_object(
                        'applicationId', a.id,
                        'candidateId', a.candidate_id,
                        'candidateName', coalesce(c.full_name, a.submitted_name),
                        'jobId', a.job_id,
                        'jobTitle', j.title,
                        'clientId', j.client_id,
                        'clientName', cl.name,
                        'stageId', a.stage_id,
                        'stageKey', s.key,
                        'stageLabel', s.label,
                        'stageKind', s.kind,
                        'publicReference', a.public_reference,
                        'receivedAt', a.received_at,
                        'version', a.version::text
                    ) as row_data
                from app.applications a
                join app.candidates c
                    on c.organization_id = a.organization_id and c.id = a.candidate_id
                join app.jobs j
                    on j.organization_id = a.organization_id and j.id = a.job_id
                join app.clients cl
                    on cl.organization_id = j.organization_id and cl.id = j.client_id
                join app.pipeline_stages s
                    on s.organization_id = a.organization_id
                    and s.pipeline_id = a.pipeline_id
                    and s.id = a.stage_id
                where a.organization_id = v_org
                    and c.lifecycle = 'active'
                    and (p_job_id is null or a.job_id = p_job_id)
                    and (v_query is null or position(v_query in lower(
                        coalesce(c.full_name, '') || ' ' || coalesce(a.submitted_name, '')
                        || ' ' || j.title || ' ' || cl.name
                        || ' ' || a.public_reference)) > 0)
                order by a.received_at desc, a.id desc
                limit v_limit
            ) t
        )
    );
end
$$;

-- Candidate directory.
create function app.list_candidates_v1(
    p_query text default null,
    p_limit integer default 500
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_limit integer;
    v_query text;
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    if not app.has_permission_v1('candidates.read') then
        raise exception 'candidates.read permission is required' using errcode = '42501';
    end if;
    v_limit := coalesce(p_limit, 500);
    if v_limit < 1 or v_limit > 1000 then
        raise exception 'Invalid list limit' using errcode = '22023';
    end if;
    v_query := nullif(lower(btrim(coalesce(p_query, ''))), '');
    if v_query is not null and char_length(v_query) > 200 then
        raise exception 'Invalid search query' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
        'candidates', (
            select coalesce(jsonb_agg(t.row_data order by t.created_at desc, t.id desc), '[]'::jsonb)
            from (
                select c.created_at, c.id,
                    jsonb_build_object(
                        'candidateId', c.id,
                        'fullName', c.full_name,
                        'lifecycle', c.lifecycle,
                        'email', (
                            select i.raw_value from app.candidate_identifiers i
                            where i.organization_id = c.organization_id
                                and i.candidate_id = c.id and i.kind = 'email'
                            order by i.received_at desc, i.id desc limit 1
                        ),
                        'ownerName', ou.display_name,
                        'applicationCount', (
                            select count(*) from app.applications a
                            where a.organization_id = c.organization_id
                                and a.candidate_id = c.id
                        ),
                        'hasCv', c.current_document_id is not null,
                        'createdAt', c.created_at
                    ) as row_data
                from app.candidates c
                left join app.organization_memberships om
                    on om.organization_id = c.organization_id
                    and om.id = c.owner_membership_id
                left join app.users ou on ou.id = om.user_id
                where c.organization_id = v_org
                    and c.lifecycle = 'active'
                    and (v_query is null or position(v_query in lower(
                        coalesce(c.full_name, ''))) > 0
                        or exists (
                            select 1 from app.candidate_identifiers i
                            where i.organization_id = c.organization_id
                                and i.candidate_id = c.id
                                and i.kind = 'email'
                                and position(v_query in lower(i.raw_value)) > 0
                        ))
                order by c.created_at desc, c.id desc
                limit v_limit
            ) t
        )
    );
end
$$;

-- Candidate workspace detail. The candidate, identifiers and documents are
-- gated on candidates.read; applications and notes are included only when the
-- caller holds the matching permissions — capabilities tell the UI which.
create function app.get_candidate_workspace_v1(p_candidate_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_candidate app.candidates%rowtype;
    v_can_read_applications boolean;
    v_can_read_notes boolean;
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    if p_candidate_id is null then
        raise exception 'get_candidate_workspace_v1 requires a candidate id'
            using errcode = '22023';
    end if;
    if not app.has_permission_v1('candidates.read') then
        raise exception 'candidates.read permission is required' using errcode = '42501';
    end if;
    select c.* into v_candidate
    from app.candidates c
    where c.organization_id = v_org and c.id = p_candidate_id;
    if not found or v_candidate.lifecycle <> 'active' then
        raise exception 'Candidate not found' using errcode = 'P0002';
    end if;
    v_can_read_applications := app.has_permission_v1('applications.read');
    v_can_read_notes := app.has_permission_v1('collaboration.read');
    return pg_catalog.jsonb_build_object(
        'candidate', pg_catalog.jsonb_build_object(
            'candidateId', v_candidate.id,
            'fullName', v_candidate.full_name,
            'professionalSummary', v_candidate.professional_summary,
            'identityState', v_candidate.identity_state,
            'lifecycle', v_candidate.lifecycle,
            'ownerName', (
                select ou.display_name
                from app.organization_memberships om
                join app.users ou on ou.id = om.user_id
                where om.organization_id = v_org
                    and om.id = v_candidate.owner_membership_id
            ),
            'createdAt', v_candidate.created_at,
            'version', v_candidate.version::text
        ),
        'identifiers', (
            select coalesce(jsonb_agg(t.row_data order by t.received_at, t.id), '[]'::jsonb)
            from (
                select i.received_at, i.id,
                    jsonb_build_object(
                        'kind', i.kind,
                        'value', i.raw_value,
                        'verification', i.verification
                    ) as row_data
                from app.candidate_identifiers i
                where i.organization_id = v_org and i.candidate_id = v_candidate.id
            ) t
        ),
        'applications', case when v_can_read_applications then (
            select coalesce(jsonb_agg(t.row_data order by t.received_at desc, t.id desc), '[]'::jsonb)
            from (
                select a.received_at, a.id,
                    jsonb_build_object(
                        'applicationId', a.id,
                        'jobId', a.job_id,
                        'jobTitle', j.title,
                        'clientName', cl.name,
                        'pipelineId', a.pipeline_id,
                        'stageId', a.stage_id,
                        'stageLabel', s.label,
                        'stageKind', s.kind,
                        'publicReference', a.public_reference,
                        'submittedName', a.submitted_name,
                        'submittedEmail', a.submitted_email,
                        'submittedProfessionalUrl', a.submitted_professional_url,
                        'submittedAchievement', a.submitted_achievement,
                        'receivedAt', a.received_at,
                        'version', a.version::text,
                        'history', (
                            select coalesce(jsonb_agg(h.row_data order by h.sequence), '[]'::jsonb)
                            from (
                                select sh.sequence,
                                    jsonb_build_object(
                                        'sequence', sh.sequence,
                                        'fromStageLabel', sf.label,
                                        'toStageLabel', st.label,
                                        'actorName', au.display_name,
                                        'reason', sh.reason,
                                        'occurredAt', sh.occurred_at
                                    ) as row_data
                                from app.application_stage_history sh
                                left join app.pipeline_stages sf
                                    on sf.organization_id = sh.organization_id
                                    and sf.pipeline_id = sh.from_pipeline_id
                                    and sf.id = sh.from_stage_id
                                join app.pipeline_stages st
                                    on st.organization_id = sh.organization_id
                                    and st.pipeline_id = sh.to_pipeline_id
                                    and st.id = sh.to_stage_id
                                left join app.organization_memberships am
                                    on am.organization_id = sh.organization_id
                                    and am.id = sh.actor_membership_id
                                left join app.users au on au.id = am.user_id
                                where sh.organization_id = v_org
                                    and sh.application_id = a.id
                            ) h
                        )
                    ) as row_data
                from app.applications a
                join app.jobs j
                    on j.organization_id = a.organization_id and j.id = a.job_id
                join app.clients cl
                    on cl.organization_id = j.organization_id and cl.id = j.client_id
                join app.pipeline_stages s
                    on s.organization_id = a.organization_id
                    and s.pipeline_id = a.pipeline_id
                    and s.id = a.stage_id
                where a.organization_id = v_org and a.candidate_id = v_candidate.id
            ) t
        ) else '[]'::jsonb end,
        'stages', case when v_can_read_applications then (
            select coalesce(jsonb_agg(t.row_data order by t.pipeline_id, t.position, t.id), '[]'::jsonb)
            from (
                select ps.pipeline_id, ps.position, ps.id,
                    jsonb_build_object(
                        'stageId', ps.id,
                        'pipelineId', ps.pipeline_id,
                        'key', ps.key,
                        'label', ps.label,
                        'kind', ps.kind,
                        'position', ps.position
                    ) as row_data
                from app.pipeline_stages ps
                where ps.organization_id = v_org
                    and ps.archived_at is null
                    and exists (
                        select 1 from app.applications a
                        where a.organization_id = v_org
                            and a.candidate_id = v_candidate.id
                            and a.pipeline_id = ps.pipeline_id
                    )
            ) t
        ) else '[]'::jsonb end,
        'documents', (
            select coalesce(jsonb_agg(t.row_data order by t.received_at desc, t.id desc), '[]'::jsonb)
            from (
                select d.received_at, d.id,
                    jsonb_build_object(
                        'documentId', d.id,
                        'filename', d.original_filename,
                        'purpose', d.purpose,
                        'lifecycle', d.lifecycle,
                        'scanState', b.scan_state,
                        'sizeBytes', b.size_bytes,
                        'receivedAt', d.received_at
                    ) as row_data
                from app.documents d
                join app.file_blobs b
                    on b.organization_id = d.organization_id
                    and b.candidate_id = d.candidate_id
                    and b.id = d.blob_id
                where d.organization_id = v_org and d.candidate_id = v_candidate.id
            ) t
        ),
        'notes', case when v_can_read_notes then (
            select coalesce(jsonb_agg(t.row_data order by t.created_at, t.id), '[]'::jsonb)
            from (
                select n.created_at, n.id,
                    jsonb_build_object(
                        'noteId', n.id,
                        'body', n.body,
                        'authorName', au.display_name,
                        'createdAt', n.created_at
                    ) as row_data
                from app.candidate_notes n
                left join app.organization_memberships am
                    on am.organization_id = n.organization_id
                    and am.id = n.author_membership_id
                left join app.users au on au.id = am.user_id
                where n.organization_id = v_org and n.candidate_id = v_candidate.id
            ) t
        ) else '[]'::jsonb end,
        'capabilities', pg_catalog.jsonb_build_object(
            'readApplications', v_can_read_applications,
            'readNotes', v_can_read_notes,
            'writeNotes', app.has_permission_v1('collaboration.write'),
            'changeStage', app.has_permission_v1('applications.stage'),
            'downloadDocuments', app.has_permission_v1('documents.download')
        )
    );
end
$$;

-- Moves an application to another stage in the same pipeline. Optimistic
-- concurrency via expected version; every move lands in stage history.
create function app.transition_application_stage_v1(
    p_application_id uuid,
    p_to_stage_id uuid,
    p_expected_version bigint,
    p_reason text,
    p_audit_id uuid,
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
    v_application app.applications%rowtype;
    v_stage app.pipeline_stages%rowtype;
    v_reason text;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    -- applications.read is required for the row lock under the executor
    -- select policy; candidates.read for the active-candidate guard.
    v_member := app.recruitment_actor_v1(
        array['applications.read', 'applications.stage', 'candidates.read'],
        p_audit_id, p_correlation_id, true);
    if p_application_id is null or p_to_stage_id is null
        or p_expected_version is null or p_expected_version < 1 then
        raise exception 'transition_application_stage_v1 requires identifiers and version'
            using errcode = '22023';
    end if;
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
    if v_reason is not null and char_length(v_reason) > 500 then
        raise exception 'Stage reason is too long' using errcode = '22023';
    end if;
    select a.* into v_application
    from app.applications a
    where a.organization_id = v_org and a.id = p_application_id
    for update of a;
    if not found then
        raise exception 'Application not found' using errcode = 'P0002';
    end if;
    if v_application.version <> p_expected_version then
        raise exception 'Application version is stale' using errcode = '40001';
    end if;
    perform 1 from app.candidates c
    where c.organization_id = v_org
        and c.id = v_application.candidate_id
        and c.lifecycle = 'active';
    if not found then
        raise exception 'Application is not on an active candidate' using errcode = '42501';
    end if;
    select s.* into v_stage
    from app.pipeline_stages s
    where s.organization_id = v_org
        and s.pipeline_id = v_application.pipeline_id
        and s.id = p_to_stage_id
        and s.archived_at is null;
    if not found then
        raise exception 'Stage not found in this pipeline' using errcode = 'P0002';
    end if;
    if v_stage.id = v_application.stage_id then
        raise exception 'Application is already in that stage' using errcode = '22023';
    end if;
    update app.applications
        set stage_id = v_stage.id, version = version + 1, updated_at = v_now
        where organization_id = v_org and id = v_application.id;
    -- sequence 1 must carry null from_* fields, so an application with no
    -- recorded history (seeded or pre-pipeline data) first gets a placement
    -- row for its current stage; the transition then lands at sequence 2.
    if not exists (
        select 1 from app.application_stage_history h
        where h.organization_id = v_org and h.application_id = v_application.id
    ) then
        insert into app.application_stage_history (
            id, organization_id, application_id, sequence,
            to_pipeline_id, to_stage_id,
            actor_kind, reason, occurred_at
        ) values (
            pg_catalog.gen_random_uuid(), v_org, v_application.id, 1,
            v_application.pipeline_id, v_application.stage_id,
            'migration', 'Stage position recorded before first tracked transition',
            v_now
        );
    end if;
    insert into app.application_stage_history (
        id, organization_id, application_id, sequence,
        from_pipeline_id, from_stage_id, to_pipeline_id, to_stage_id,
        actor_membership_id, actor_kind, reason, occurred_at
    ) values (
        pg_catalog.gen_random_uuid(), v_org, v_application.id,
        (select coalesce(max(h.sequence), 0) + 1
            from app.application_stage_history h
            where h.organization_id = v_org and h.application_id = v_application.id),
        v_application.pipeline_id, v_application.stage_id,
        v_application.pipeline_id, v_stage.id,
        v_member, 'staff', v_reason, v_now
    );
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', app.context_uuid_v1('app.actor_id'),
        v_member, 'application.stage.changed', 'application', v_application.id,
        p_correlation_id, v_now,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'previous_version', v_application.version,
            'new_version', v_application.version + 1,
            'from_stage_id', v_application.stage_id,
            'to_stage_id', v_stage.id,
            'reason', v_reason
        ))
    );
    return pg_catalog.jsonb_build_object(
        'applicationId', v_application.id,
        'stageId', v_stage.id,
        'version', (v_application.version + 1)::text
    );
end
$$;

-- Adds a staff note to an active candidate.
create function app.add_candidate_note_v1(
    p_note_id uuid,
    p_candidate_id uuid,
    p_body text,
    p_audit_id uuid,
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
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    v_member := app.recruitment_actor_v1(
        array['collaboration.write'], p_audit_id, p_correlation_id, true);
    if p_note_id is null or p_candidate_id is null then
        raise exception 'add_candidate_note_v1 requires identifiers' using errcode = '22023';
    end if;
    if p_body is null or btrim(p_body) = '' or octet_length(p_body) > 16384 then
        raise exception 'Note body must be nonempty and at most 16 KB' using errcode = '22023';
    end if;
    perform 1 from app.candidates c
    where c.organization_id = v_org
        and c.id = p_candidate_id
        and c.lifecycle = 'active';
    if not found then
        raise exception 'Candidate not found' using errcode = 'P0002';
    end if;
    insert into app.candidate_notes (
        id, organization_id, candidate_id, author_membership_id, body
    ) values (p_note_id, v_org, p_candidate_id, v_member, btrim(p_body));
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', app.context_uuid_v1('app.actor_id'), v_member,
        'candidate.note.added', 'candidate_note', p_note_id,
        p_correlation_id, v_now,
        pg_catalog.jsonb_build_object('candidate_id', p_candidate_id)
    );
    return pg_catalog.jsonb_build_object('noteId', p_note_id, 'createdAt', v_now);
end
$$;

-- Resolves a document to its storage coordinates for a signed download.
-- Refuses infected blobs, non-live blobs, retired documents and unverified
-- locations.
create function app.get_document_download_v1(p_document_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_row record;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    if p_document_id is null then
        raise exception 'get_document_download_v1 requires a document id' using errcode = '22023';
    end if;
    if not app.has_permission_v1('documents.download') then
        raise exception 'documents.download permission is required' using errcode = '42501';
    end if;
    select m.id into v_member
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';
    if v_member is null then
        raise exception 'Active membership required' using errcode = '42501';
    end if;
    select d.id as document_id, d.candidate_id, d.original_filename,
        b.scan_state, b.lifecycle as blob_lifecycle, b.mime_type,
        l.bucket, l.object_key
    into v_row
    from app.documents d
    join app.file_blobs b
        on b.organization_id = d.organization_id
        and b.candidate_id = d.candidate_id and b.id = d.blob_id
    join app.blob_locations l
        on l.organization_id = d.organization_id and l.blob_id = b.id
    where d.organization_id = v_org and d.id = p_document_id
        and l.is_primary and l.state = 'available';
    if not found then
        raise exception 'Document not found' using errcode = 'P0002';
    end if;
    if v_row.blob_lifecycle <> 'live' or v_row.scan_state = 'infected' then
        raise exception 'Document is not downloadable' using errcode = '42501';
    end if;
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        pg_catalog.gen_random_uuid(), v_org, 'staff', v_actor, v_member,
        'document.downloaded', 'document', v_row.document_id,
        pg_catalog.gen_random_uuid(), v_now,
        pg_catalog.jsonb_build_object('candidate_id', v_row.candidate_id)
    );
    return pg_catalog.jsonb_build_object(
        'bucket', v_row.bucket,
        'objectKey', v_row.object_key,
        'filename', v_row.original_filename,
        'mimeType', v_row.mime_type
    );
end
$$;

-- Imports one public-intake submission (public.applicants row, relayed by the
-- app layer) into the pipeline: candidate (deduped on normalized email),
-- source, identifiers, application on the job's initial stage, and the CV
-- registered through the document chain. Idempotent on public_reference.
create function app.import_public_application_v1(
    p_candidate_id uuid,
    p_source_id uuid,
    p_email_identifier_id uuid,
    p_url_identifier_id uuid,
    p_application_id uuid,
    p_history_id uuid,
    p_blob_id uuid,
    p_location_id uuid,
    p_document_id uuid,
    p_job_slug text,
    p_reference text,
    p_full_name text,
    p_email text,
    p_professional_url text,
    p_achievement text,
    p_received_at timestamptz,
    p_sha256 bytea,
    p_size_bytes bigint,
    p_mime_type text,
    p_extension text,
    p_bucket text,
    p_object_key text,
    p_filename text,
    p_audit_id uuid,
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
    v_job app.jobs%rowtype;
    v_stage app.pipeline_stages%rowtype;
    v_candidate_id uuid;
    v_existing uuid;
    v_email text;
    v_url text;
    v_name text;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    v_member := app.recruitment_actor_v1(
        array['candidates.write', 'documents.write', 'applications.stage', 'jobs.read'],
        p_audit_id, p_correlation_id, true);
    if p_candidate_id is null or p_source_id is null or p_application_id is null
        or p_history_id is null or p_audit_id is null then
        raise exception 'import_public_application_v1 requires nonnull identifiers'
            using errcode = '22023';
    end if;
    v_name := nullif(btrim(coalesce(p_full_name, '')), '');
    if v_name is null or char_length(v_name) > 256 then
        raise exception 'Invalid candidate name' using errcode = '22023';
    end if;
    v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
    if v_email is null or char_length(v_email) > 320
        or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Invalid candidate email' using errcode = '22023';
    end if;
    v_url := nullif(btrim(coalesce(p_professional_url, '')), '');
    if v_url is not null and char_length(v_url) > 2048 then
        raise exception 'Invalid professional URL' using errcode = '22023';
    end if;
    if p_reference is null or p_reference !~ '^AG-[0-9A-F]{12}$' then
        raise exception 'Invalid public reference' using errcode = '22023';
    end if;
    if p_received_at is null then
        raise exception 'Received timestamp required' using errcode = '22023';
    end if;
    select a.id into v_existing
    from app.applications a
    where a.organization_id = v_org and a.public_reference = p_reference;
    if v_existing is not null then
        return pg_catalog.jsonb_build_object(
            'imported', false, 'reason', 'already_imported',
            'applicationId', v_existing
        );
    end if;
    select j.* into v_job
    from app.jobs j
    where j.organization_id = v_org and j.slug = p_job_slug;
    if not found then
        raise exception 'No job matches the submission slug' using errcode = 'P0002';
    end if;
    select s.* into v_stage
    from app.pipeline_stages s
    where s.organization_id = v_org and s.pipeline_id = v_job.pipeline_id
        and s.is_initial and s.archived_at is null;
    if not found then
        raise exception 'Job pipeline has no initial stage' using errcode = 'P0002';
    end if;
    -- Email-dedupe: a normalized email identifier already on an active
    -- candidate attaches this submission to that candidate instead of
    -- creating a duplicate.
    select i.candidate_id into v_candidate_id
    from app.candidate_identifiers i
    join app.candidates c
        on c.organization_id = i.organization_id and c.id = i.candidate_id
    where i.organization_id = v_org and i.kind = 'email'
        and i.normalized_value = v_email and c.lifecycle = 'active'
    order by i.received_at, i.id
    limit 1;
    if v_candidate_id is null then
        v_candidate_id := p_candidate_id;
        insert into app.candidates (
            id, organization_id, full_name, identity_state, lifecycle
        ) values (v_candidate_id, v_org, v_name, 'provisional', 'active');
    end if;
    insert into app.candidate_sources (
        id, organization_id, candidate_id, kind, received_at,
        created_by_membership_id, context_summary
    ) values (
        p_source_id, v_org, v_candidate_id, 'public_application', p_received_at,
        v_member, 'Imported from the public application intake'
    );
    if p_email_identifier_id is null then
        raise exception 'Email identifier id required' using errcode = '22023';
    end if;
    if not exists (
        select 1 from app.candidate_identifiers i
        where i.organization_id = v_org and i.candidate_id = v_candidate_id
            and i.kind = 'email' and i.normalized_value = v_email
    ) then
        insert into app.candidate_identifiers (
            id, organization_id, candidate_id, kind, raw_value,
            normalized_value, normalization_version, verification,
            source_id, received_at
        ) values (
            p_email_identifier_id, v_org, v_candidate_id, 'email', v_email,
            v_email, 1, 'unverified', p_source_id, p_received_at
        );
    end if;
    if v_url is not null
        and not exists (
            select 1 from app.candidate_identifiers i
            where i.organization_id = v_org and i.candidate_id = v_candidate_id
                and i.kind = 'professional_url' and i.raw_value = v_url
        ) then
        if p_url_identifier_id is null then
            raise exception 'URL identifier id required' using errcode = '22023';
        end if;
        insert into app.candidate_identifiers (
            id, organization_id, candidate_id, kind, raw_value,
            normalized_value, normalization_version, verification,
            source_id, received_at
        ) values (
            p_url_identifier_id, v_org, v_candidate_id, 'professional_url', v_url,
            lower(v_url), 1, 'unverified', p_source_id, p_received_at
        );
    end if;
    insert into app.applications (
        id, organization_id, candidate_id, job_id, pipeline_id, stage_id,
        public_reference, reference_version,
        submitted_name, submitted_email, submitted_professional_url,
        submitted_achievement, submitted_job_title,
        source_id, received_at
    ) values (
        p_application_id, v_org, v_candidate_id, v_job.id, v_job.pipeline_id,
        v_stage.id, p_reference, 1,
        v_name, v_email, v_url, nullif(btrim(coalesce(p_achievement, '')), ''),
        v_job.title, p_source_id, p_received_at
    );
    insert into app.application_stage_history (
        id, organization_id, application_id, sequence,
        to_pipeline_id, to_stage_id,
        actor_membership_id, actor_kind, reason, occurred_at
    ) values (
        p_history_id, v_org, p_application_id, 1,
        v_job.pipeline_id, v_stage.id,
        v_member, 'staff', 'Imported from the public application intake', v_now
    );
    if p_blob_id is not null then
        if p_location_id is null or p_document_id is null
            or p_sha256 is null or octet_length(p_sha256) <> 32
            or p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 4194304
            or p_bucket is null or p_object_key is null
            or p_filename is null or btrim(p_filename) = ''
            or not (
                (p_mime_type = 'application/pdf' and p_extension = 'pdf')
                or (p_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    and p_extension = 'docx')
            ) then
            raise exception 'Invalid document registration payload' using errcode = '22023';
        end if;
        insert into app.file_blobs (
            id, organization_id, candidate_id, sha256, size_bytes,
            mime_type, extension, lifecycle, scan_state
        ) values (
            p_blob_id, v_org, v_candidate_id, p_sha256, p_size_bytes,
            p_mime_type, p_extension, 'live', 'unscanned'
        );
        insert into app.blob_locations (
            id, organization_id, blob_id, backend_key, bucket, object_key,
            state, is_primary, verified_sha256, verified_size_bytes, verified_at
        ) values (
            p_location_id, v_org, p_blob_id, 'supabase_storage', p_bucket,
            p_object_key, 'available', true, p_sha256, p_size_bytes, v_now
        );
        insert into app.documents (
            id, organization_id, candidate_id, blob_id, purpose,
            original_filename, source_id, received_at, lifecycle
        ) values (
            p_document_id, v_org, v_candidate_id, p_blob_id, 'cv',
            btrim(p_filename), p_source_id, p_received_at, 'active'
        );
        insert into app.application_documents (
            organization_id, candidate_id, application_id, document_id,
            submitted_filename, attached_at
        ) values (
            v_org, v_candidate_id, p_application_id, p_document_id,
            btrim(p_filename), p_received_at
        );
        -- Latest submission becomes the current CV only when the candidate has
        -- none — a staff-managed document is never silently replaced.
        update app.candidates
            set current_document_id = p_document_id, updated_at = v_now,
                version = version + 1
            where organization_id = v_org and id = v_candidate_id
                and current_document_id is null;
    end if;
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', app.context_uuid_v1('app.actor_id'), v_member,
        'application.imported', 'application', p_application_id,
        p_correlation_id, v_now,
        pg_catalog.jsonb_build_object(
            'candidate_id', v_candidate_id,
            'job_id', v_job.id,
            'source_id', p_source_id,
            'document_id', p_document_id
        )
    );
    return pg_catalog.jsonb_build_object(
        'imported', true,
        'applicationId', p_application_id,
        'candidateId', v_candidate_id,
        'reusedCandidate', v_candidate_id is distinct from p_candidate_id,
        'documentId', p_document_id
    );
end
$$;

revoke all on function app.list_applications_v1(uuid, text, integer) from public;
revoke all on function app.list_candidates_v1(text, integer) from public;
revoke all on function app.get_candidate_workspace_v1(uuid) from public;
revoke all on function app.transition_application_stage_v1(uuid, uuid, bigint, text, uuid, uuid) from public;
revoke all on function app.add_candidate_note_v1(uuid, uuid, text, uuid, uuid) from public;
revoke all on function app.get_document_download_v1(uuid) from public;
revoke all on function app.import_public_application_v1(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text, text, text, text, timestamptz,
    bytea, bigint, text, text, text, text, text, uuid, uuid) from public;

grant execute on function app.list_applications_v1(uuid, text, integer) to app_staff;
grant execute on function app.list_candidates_v1(text, integer) to app_staff;
grant execute on function app.get_candidate_workspace_v1(uuid) to app_staff;
grant execute on function app.transition_application_stage_v1(uuid, uuid, bigint, text, uuid, uuid) to app_staff;
grant execute on function app.add_candidate_note_v1(uuid, uuid, text, uuid, uuid) to app_staff;
grant execute on function app.get_document_download_v1(uuid) to app_staff;
grant execute on function app.import_public_application_v1(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text, text, text, text, timestamptz,
    bytea, bigint, text, text, text, text, text, uuid, uuid) to app_staff;

-- Procedures run as app_executor: the ALTER OWNER requires schema CREATE on
-- the target role, so grant it (as app_owner, the schema owner), transfer
-- ownership as the migration operator, then revoke it again.
grant create on schema app to app_executor;

reset role;

alter function app.list_applications_v1(uuid, text, integer) owner to app_executor;
alter function app.list_candidates_v1(text, integer) owner to app_executor;
alter function app.get_candidate_workspace_v1(uuid) owner to app_executor;
alter function app.transition_application_stage_v1(uuid, uuid, bigint, text, uuid, uuid) owner to app_executor;
alter function app.add_candidate_note_v1(uuid, uuid, text, uuid, uuid) owner to app_executor;
alter function app.get_document_download_v1(uuid) owner to app_executor;
alter function app.import_public_application_v1(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text, text, text, text, timestamptz,
    bytea, bigint, text, text, text, text, text, uuid, uuid) owner to app_executor;

set local role app_owner;

revoke create on schema app from app_executor;

commit;
