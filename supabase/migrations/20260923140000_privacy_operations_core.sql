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

alter table app.legacy_records
    add column processing_restricted boolean not null default false,
    add column lifecycle_generation bigint not null default 1 check (lifecycle_generation > 0);

alter table app.privacy_request_subjects
    add column legacy_version bigint check (legacy_version is null or legacy_version > 0),
    add constraint privacy_request_subjects_legacy_version_target_check
        check (legacy_version is null or legacy_record_id is not null);

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
        and pg_catalog.pg_get_constraintdef(con.oid) like '%staff.membership.changed%'
        and pg_catalog.pg_get_constraintdef(con.oid) like '%staff.role_grants.changed%';
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
        )
    );

grant select on app.privacy_requests to app_executor;
grant select on app.privacy_request_subjects to app_executor;
grant select on app.privacy_events to app_executor;
grant select on app.candidates to app_executor;
grant select on app.legacy_records to app_executor;
grant select on app.legacy_datasets to app_executor;
grant select on app.file_blobs to app_executor;
grant select on app.documents to app_executor;
grant select on app.candidate_processing_purposes to app_executor;
grant select on app.document_disclosures to app_executor;

grant insert on app.privacy_requests to app_executor;
grant insert on app.privacy_request_subjects to app_executor;
grant insert on app.privacy_events to app_executor;

grant update (
    status, verified_by_membership_id, verified_at, verification_method,
    updated_at, version
) on app.privacy_requests to app_executor;
grant update (
    candidate_version, legacy_version, source_sha256,
    reviewed_by_membership_id, reviewed_at
) on app.privacy_request_subjects to app_executor;
grant update (
    full_name, professional_summary, profile_version, lifecycle,
    lifecycle_generation, updated_at, version
) on app.candidates to app_executor;
grant update (
    processing_restricted, lifecycle_generation, updated_at, version
) on app.legacy_records to app_executor;
grant update (
    scan_generation, lifecycle_generation, updated_at, version
) on app.file_blobs to app_executor;
grant update (
    lifecycle, updated_at, version
) on app.documents to app_executor;
grant update (
    status, updated_at, version
) on app.candidate_processing_purposes to app_executor;
grant update (
    status, updated_at, version
) on app.document_disclosures to app_executor;

create policy executor_privacy_requests_select on app.privacy_requests
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_privacy_requests_insert on app.privacy_requests
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_privacy_requests_update on app.privacy_requests
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_privacy_subjects_select on app.privacy_request_subjects
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_privacy_subjects_insert on app.privacy_request_subjects
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_privacy_subjects_update on app.privacy_request_subjects
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_privacy_events_select on app.privacy_events
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_privacy_events_insert on app.privacy_events
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_candidates_select on app.candidates
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_candidates_update on app.candidates
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_legacy_records_select on app.legacy_records
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_legacy_records_update on app.legacy_records
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_legacy_datasets_select on app.legacy_datasets
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_file_blobs_select on app.file_blobs
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_file_blobs_update on app.file_blobs
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_documents_select on app.documents
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_documents_update on app.documents
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_candidate_purposes_select on app.candidate_processing_purposes
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_candidate_purposes_update on app.candidate_processing_purposes
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create policy executor_document_disclosures_select on app.document_disclosures
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));
create policy executor_document_disclosures_update on app.document_disclosures
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('privacy.manage'));

create function app.privacy_actor_v1(p_audit_id uuid, p_correlation_id uuid)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
begin
    if p_audit_id is null or p_correlation_id is null then
        raise exception 'Audit identifiers required' using errcode = '22023';
    end if;
    if v_org is null or v_actor is null then
        raise exception 'Staff context required' using errcode = '42501';
    end if;
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Read committed required' using errcode = '25001';
    end if;
    perform o.id from app.organizations o where o.id = v_org for update;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    if not app.has_permission_v1('privacy.manage') then
        raise exception 'Privacy permission required' using errcode = '42501';
    end if;
    select m.id into v_member
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';
    if v_member is null then
        raise exception 'Active membership required' using errcode = '42501';
    end if;
    return v_member;
end
$$;

create function app.privacy_lock_request_v1(p_request_id uuid, p_expected_version bigint)
returns app.privacy_requests
language plpgsql
volatile
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_request app.privacy_requests;
begin
    if p_request_id is null or p_expected_version is null or p_expected_version <= 0 then
        raise exception 'Request id and positive expected version required'
            using errcode = '22023';
    end if;
    select r.* into v_request
    from app.privacy_requests r
    where r.organization_id = v_org and r.id = p_request_id
    for update of r;
    if not found then
        raise exception 'Privacy request not found' using errcode = 'P0002';
    end if;
    if v_request.version <> p_expected_version then
        raise exception 'Privacy request version does not match expected version'
            using errcode = '40001';
    end if;
    if v_request.status not in ('received', 'verified', 'in_progress') then
        raise exception 'Privacy request is not open' using errcode = '23514';
    end if;
    return v_request;
end
$$;

create function app.privacy_record_event_v1(
    p_request_id uuid,
    p_subject_id uuid,
    p_candidate_id uuid,
    p_action text,
    p_generation bigint,
    p_member uuid,
    p_audit_id uuid,
    p_correlation_id uuid,
    p_details jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_sequence bigint;
begin
    select coalesce(max(e.sequence), 0) + 1 into v_sequence
    from app.privacy_events e
    where e.organization_id = v_org and e.request_id = p_request_id;
    insert into app.privacy_events (
        id, organization_id, request_id, subject_id, candidate_id, sequence, action,
        lifecycle_generation, actor_membership_id, occurred_at, evidence_code
    ) values (
        p_audit_id, v_org, p_request_id, p_subject_id, p_candidate_id, v_sequence,
        p_action, p_generation, p_member, pg_catalog.clock_timestamp(),
        'operator_recorded'
    );
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id, action,
        target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, p_member, p_action, 'privacy_request',
        p_request_id, p_correlation_id, pg_catalog.clock_timestamp(),
        pg_catalog.jsonb_strip_nulls(coalesce(p_details, '{}'::jsonb))
    );
end
$$;

create function app.create_privacy_request_v1(
    p_request_id uuid,
    p_kind text,
    p_received_at timestamptz,
    p_due_at timestamptz,
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
begin
    v_member := app.privacy_actor_v1(p_audit_id, p_correlation_id);
    if p_request_id is null or p_kind is null or p_received_at is null then
        raise exception 'create_privacy_request_v1 requires nonnull request id, kind and received_at'
            using errcode = '22023';
    end if;
    if p_kind not in (
        'access', 'correction', 'restriction', 'erasure',
        'objection', 'portability', 'withdrawal'
    ) then
        raise exception 'Unknown privacy request kind' using errcode = '22023';
    end if;
    if not pg_catalog.isfinite(p_received_at) or p_received_at > pg_catalog.clock_timestamp() then
        raise exception 'received_at must be finite and not in the future'
            using errcode = '22023';
    end if;
    if p_due_at is not null
        and (not pg_catalog.isfinite(p_due_at) or p_due_at < p_received_at) then
        raise exception 'due_at must be finite and not before received_at'
            using errcode = '22023';
    end if;

    insert into app.privacy_requests (id, organization_id, kind, status, received_at, due_at)
    values (p_request_id, v_org, p_kind, 'received', p_received_at, p_due_at);

    perform app.privacy_record_event_v1(
        p_request_id, null, null, 'privacy.request.created', null, v_member,
        p_audit_id, p_correlation_id,
        jsonb_build_object('new_version', 1)
    );

    return jsonb_build_object(
        'request_id', p_request_id,
        'request_version', '1',
        'status', 'received'
    );
end
$$;

create function app.review_privacy_subject_v1(
    p_request_id uuid,
    p_expected_request_version bigint,
    p_subject_id uuid,
    p_candidate_id uuid,
    p_legacy_record_id uuid,
    p_expected_target_version bigint,
    p_source_sha256 bytea,
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
    v_request app.privacy_requests;
    v_candidate app.candidates;
    v_record app.legacy_records;
    v_subject app.privacy_request_subjects;
    v_target_kind text;
    v_target_id uuid;
    v_target_version bigint;
    v_target_previous_version bigint;
    v_generation bigint;
begin
    v_member := app.privacy_actor_v1(p_audit_id, p_correlation_id);
    if p_subject_id is null
        or (p_candidate_id is null) = (p_legacy_record_id is null)
        or p_expected_target_version is null or p_expected_target_version <= 0 then
        raise exception 'review_privacy_subject_v1 requires a subject id, exactly one target '
            'and a positive expected target version'
            using errcode = '22023';
    end if;
    v_request := app.privacy_lock_request_v1(p_request_id, p_expected_request_version);

    if p_candidate_id is not null then
        if p_source_sha256 is not null then
            raise exception 'Candidate subjects must not carry a legacy fingerprint'
                using errcode = '22023';
        end if;
        select c.* into v_candidate
        from app.candidates c
        where c.organization_id = v_org and c.id = p_candidate_id
        for update of c;
        if not found then
            raise exception 'Candidate not found' using errcode = 'P0002';
        end if;
        if v_candidate.version <> p_expected_target_version then
            raise exception 'Candidate version does not match expected version'
                using errcode = '40001';
        end if;
        if v_candidate.lifecycle not in ('active', 'restricted') then
            raise exception 'Candidate lifecycle does not allow review'
                using errcode = '23514';
        end if;
        v_target_kind := 'candidate';
        v_target_id := p_candidate_id;
        v_target_version := v_candidate.version;
        v_generation := v_candidate.lifecycle_generation;
    else
        if p_source_sha256 is null or pg_catalog.octet_length(p_source_sha256) <> 32 then
            raise exception 'Legacy subjects require a 32-byte source fingerprint'
                using errcode = '22023';
        end if;
        select lr.* into v_record
        from app.legacy_records lr
        join app.legacy_datasets ds
            on ds.organization_id = lr.organization_id
            and ds.id = lr.dataset_id
            and ds.status = 'active'
        where lr.organization_id = v_org and lr.id = p_legacy_record_id
        for update of lr;
        if not found then
            raise exception 'Legacy record not found' using errcode = 'P0002';
        end if;
        if v_record.verified_at is null or v_record.source_sha256 is null then
            raise exception 'Legacy record is not verified with a stored fingerprint'
                using errcode = '23514';
        end if;
        if v_record.source_sha256 <> p_source_sha256 then
            raise exception 'Legacy record fingerprint does not match the reviewed snapshot'
                using errcode = '40001';
        end if;
        if v_record.version <> p_expected_target_version then
            raise exception 'Legacy record version does not match expected version'
                using errcode = '40001';
        end if;
        v_target_kind := 'legacy_record';
        v_target_id := p_legacy_record_id;
        v_target_version := v_record.version;
        v_generation := v_record.lifecycle_generation;
    end if;

    select s.* into v_subject
    from app.privacy_request_subjects s
    where s.organization_id = v_org and s.id = p_subject_id;
    if found then
        if v_subject.request_id <> p_request_id
            or v_subject.candidate_id is distinct from p_candidate_id
            or v_subject.legacy_record_id is distinct from p_legacy_record_id then
            raise exception 'Reviewed subjects cannot be retargeted to another case or target'
                using errcode = '23514';
        end if;
        v_target_previous_version := coalesce(
            v_subject.candidate_version, v_subject.legacy_version
        );
        update app.privacy_request_subjects set
            candidate_version = case
                when p_candidate_id is not null then v_target_version else null
            end,
            legacy_version = case
                when p_legacy_record_id is not null then v_target_version else null
            end,
            source_sha256 = p_source_sha256,
            reviewed_by_membership_id = v_member,
            reviewed_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and id = p_subject_id;
    else
        insert into app.privacy_request_subjects (
            id, organization_id, request_id, candidate_id, legacy_record_id,
            candidate_version, legacy_version, source_sha256,
            reviewed_by_membership_id, reviewed_at
        ) values (
            p_subject_id, v_org, p_request_id, p_candidate_id, p_legacy_record_id,
            case when p_candidate_id is not null then v_target_version end,
            case when p_legacy_record_id is not null then v_target_version end,
            p_source_sha256, v_member, pg_catalog.clock_timestamp()
        );
    end if;

    update app.privacy_requests set
        version = version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and id = p_request_id;

    perform app.privacy_record_event_v1(
        p_request_id, p_subject_id, p_candidate_id, 'privacy.subject.reviewed',
        v_generation, v_member, p_audit_id, p_correlation_id,
        jsonb_build_object(
            'subject_id', p_subject_id,
            'target_id', v_target_id,
            'target_kind', v_target_kind,
            'previous_version', v_request.version,
            'new_version', v_request.version + 1,
            'target_previous_version', v_target_previous_version,
            'target_new_version', v_target_version
        )
    );

    return jsonb_build_object(
        'request_id', p_request_id,
        'request_version', (v_request.version + 1)::text,
        'status', v_request.status,
        'subject_id', p_subject_id,
        'target_version', v_target_version::text
    );
end
$$;

create function app.verify_privacy_request_v1(
    p_request_id uuid,
    p_expected_version bigint,
    p_verification_method text,
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
    v_request app.privacy_requests;
begin
    v_member := app.privacy_actor_v1(p_audit_id, p_correlation_id);
    v_request := app.privacy_lock_request_v1(p_request_id, p_expected_version);
    if v_request.status <> 'received' then
        raise exception 'Only a received request can be verified' using errcode = '23514';
    end if;
    if p_verification_method is null
        or p_verification_method !~ '^[a-z][a-z0-9_.-]{0,63}$' then
        raise exception 'verification_method must be a lowercase machine-readable code'
            using errcode = '22023';
    end if;
    perform 1 from app.privacy_request_subjects s
    where s.organization_id = v_org and s.request_id = p_request_id;
    if not found then
        raise exception 'A verified request requires at least one reviewed subject'
            using errcode = '23514';
    end if;

    update app.privacy_requests set
        status = 'verified',
        verified_by_membership_id = v_member,
        verified_at = pg_catalog.clock_timestamp(),
        verification_method = p_verification_method,
        version = version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and id = p_request_id;

    perform app.privacy_record_event_v1(
        p_request_id, null, null, 'privacy.request.verified', null, v_member,
        p_audit_id, p_correlation_id,
        jsonb_build_object(
            'previous_version', v_request.version,
            'new_version', v_request.version + 1
        )
    );

    return jsonb_build_object(
        'request_id', p_request_id,
        'request_version', (v_request.version + 1)::text,
        'status', 'verified'
    );
end
$$;

create function app.correct_privacy_candidate_v1(
    p_request_id uuid,
    p_expected_request_version bigint,
    p_subject_id uuid,
    p_expected_candidate_version bigint,
    p_changes jsonb,
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
    v_request app.privacy_requests;
    v_subject app.privacy_request_subjects;
    v_candidate app.candidates;
    v_changed text[] := '{}';
begin
    v_member := app.privacy_actor_v1(p_audit_id, p_correlation_id);
    v_request := app.privacy_lock_request_v1(p_request_id, p_expected_request_version);
    if v_request.kind <> 'correction'
        or v_request.status not in ('verified', 'in_progress') then
        raise exception 'Correction requires a verified or in-progress correction request'
            using errcode = '23514';
    end if;
    if p_subject_id is null or p_expected_candidate_version is null
        or p_expected_candidate_version <= 0 then
        raise exception 'Subject id and positive expected candidate version required'
            using errcode = '22023';
    end if;
    if p_changes is null or pg_catalog.jsonb_typeof(p_changes) <> 'object'
        or p_changes = '{}'::jsonb then
        raise exception 'changes must be a nonempty JSON object' using errcode = '22023';
    end if;
    if exists (
        select 1 from pg_catalog.jsonb_object_keys(p_changes) k
        where k not in ('full_name', 'professional_summary')
    ) then
        raise exception 'changes supports only full_name and professional_summary'
            using errcode = '22023';
    end if;
    if exists (
        select 1
        from pg_catalog.jsonb_each(p_changes) e
        where pg_catalog.jsonb_typeof(e.value) not in ('string', 'null')
    ) then
        raise exception 'change values must be JSON strings or null' using errcode = '22023';
    end if;
    if p_changes ? 'full_name'
        and (p_changes ->> 'full_name') is not null
        and (btrim(p_changes ->> 'full_name') = ''
            or pg_catalog.char_length(p_changes ->> 'full_name') > 256) then
        raise exception 'full_name must be null or a nonblank string of at most 256 characters'
            using errcode = '22023';
    end if;
    if p_changes ? 'professional_summary'
        and pg_catalog.jsonb_typeof(p_changes -> 'professional_summary') = 'string'
        and pg_catalog.char_length(p_changes ->> 'professional_summary') > 10000 then
        raise exception 'professional_summary must be at most 10000 characters'
            using errcode = '22023';
    end if;
    if pg_catalog.octet_length(p_changes::text) > 49152 then
        raise exception 'changes payload must not exceed 49152 bytes' using errcode = '22023';
    end if;

    select s.* into v_subject
    from app.privacy_request_subjects s
    where s.organization_id = v_org
        and s.id = p_subject_id
        and s.request_id = p_request_id;
    if not found or v_subject.candidate_id is null then
        raise exception 'Reviewed candidate subject not found' using errcode = 'P0002';
    end if;

    select c.* into v_candidate
    from app.candidates c
    where c.organization_id = v_org and c.id = v_subject.candidate_id
    for update of c;
    if not found then
        raise exception 'Candidate not found' using errcode = 'P0002';
    end if;
    if v_candidate.lifecycle not in ('active', 'restricted') then
        raise exception 'Candidate lifecycle does not allow correction'
            using errcode = '23514';
    end if;
    if v_candidate.version <> p_expected_candidate_version
        or v_subject.candidate_version is distinct from v_candidate.version then
        raise exception 'Candidate version does not match the reviewed snapshot'
            using errcode = '40001';
    end if;

    if p_changes ? 'full_name'
        and (p_changes ->> 'full_name') is distinct from v_candidate.full_name then
        v_changed := array_append(v_changed, 'full_name');
    end if;
    if p_changes ? 'professional_summary'
        and (p_changes ->> 'professional_summary')
            is distinct from v_candidate.professional_summary then
        v_changed := array_append(v_changed, 'professional_summary');
    end if;
    if pg_catalog.cardinality(v_changed) = 0 then
        raise exception 'changes must modify at least one value' using errcode = '22023';
    end if;

    update app.candidates set
        full_name = case
            when p_changes ? 'full_name' then p_changes ->> 'full_name'
            else full_name
        end,
        professional_summary = case
            when p_changes ? 'professional_summary' then p_changes ->> 'professional_summary'
            else professional_summary
        end,
        profile_version = profile_version + 1,
        version = version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and id = v_subject.candidate_id;

    update app.privacy_requests set
        status = 'in_progress',
        version = version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and id = p_request_id;

    perform app.privacy_record_event_v1(
        p_request_id, p_subject_id, v_subject.candidate_id,
        'privacy.candidate.corrected', v_candidate.lifecycle_generation, v_member,
        p_audit_id, p_correlation_id,
        jsonb_build_object(
            'subject_id', p_subject_id,
            'target_id', v_subject.candidate_id,
            'target_kind', 'candidate',
            'previous_version', v_request.version,
            'new_version', v_request.version + 1,
            'target_previous_version', v_candidate.version,
            'target_new_version', v_candidate.version + 1,
            'changed_fields', v_changed
        )
    );

    return jsonb_build_object(
        'request_id', p_request_id,
        'request_version', (v_request.version + 1)::text,
        'status', 'in_progress',
        'subject_id', p_subject_id,
        'target_version', (v_candidate.version + 1)::text,
        'scope', 'candidate_profile_only'
    );
end
$$;

create function app.restrict_privacy_subject_v1(
    p_request_id uuid,
    p_expected_request_version bigint,
    p_subject_id uuid,
    p_expected_target_version bigint,
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
    v_request app.privacy_requests;
    v_subject app.privacy_request_subjects;
    v_candidate app.candidates;
    v_record app.legacy_records;
    v_target_kind text;
    v_target_id uuid;
    v_target_version bigint;
    v_generation bigint;
    v_scope text;
    v_children bigint;
begin
    v_member := app.privacy_actor_v1(p_audit_id, p_correlation_id);
    v_request := app.privacy_lock_request_v1(p_request_id, p_expected_request_version);
    if v_request.kind not in ('restriction', 'erasure', 'correction', 'objection', 'withdrawal')
        or v_request.status not in ('verified', 'in_progress') then
        raise exception 'Restriction requires a verified or in-progress request of a '
            'restrictable kind'
            using errcode = '23514';
    end if;
    if p_subject_id is null or p_expected_target_version is null
        or p_expected_target_version <= 0 then
        raise exception 'Subject id and positive expected target version required'
            using errcode = '22023';
    end if;

    select s.* into v_subject
    from app.privacy_request_subjects s
    where s.organization_id = v_org
        and s.id = p_subject_id
        and s.request_id = p_request_id;
    if not found then
        raise exception 'Reviewed subject not found' using errcode = 'P0002';
    end if;

    if v_subject.candidate_id is not null then
        select c.* into v_candidate
        from app.candidates c
        where c.organization_id = v_org and c.id = v_subject.candidate_id
        for update of c;
        if not found then
            raise exception 'Candidate not found' using errcode = 'P0002';
        end if;
        if v_candidate.lifecycle in ('deleting', 'deleted', 'merged') then
            raise exception 'Terminal candidate lifecycle cannot be restricted'
                using errcode = '23514';
        end if;
        if v_candidate.lifecycle = 'restricted' then
            raise exception 'Candidate is already restricted' using errcode = '23514';
        end if;
        if v_candidate.version <> p_expected_target_version
            or v_subject.candidate_version is distinct from v_candidate.version then
            raise exception 'Candidate version does not match the reviewed snapshot'
                using errcode = '40001';
        end if;
        v_target_kind := 'candidate';
        v_target_id := v_subject.candidate_id;
        v_scope := 'candidate_records_only';
    else
        select lr.* into v_record
        from app.legacy_records lr
        join app.legacy_datasets ds
            on ds.organization_id = lr.organization_id
            and ds.id = lr.dataset_id
            and ds.status = 'active'
        where lr.organization_id = v_org and lr.id = v_subject.legacy_record_id
        for update of lr;
        if not found then
            raise exception 'Legacy record not found' using errcode = 'P0002';
        end if;
        if v_record.processing_restricted then
            raise exception 'Legacy record is already restricted' using errcode = '23514';
        end if;
        if v_record.verified_at is null or v_record.source_sha256 is null
            or v_subject.source_sha256 is null
            or v_record.source_sha256 <> v_subject.source_sha256 then
            raise exception 'Legacy record fingerprint does not match the reviewed snapshot'
                using errcode = '40001';
        end if;
        if v_record.version <> p_expected_target_version
            or v_subject.legacy_version is distinct from v_record.version then
            raise exception 'Legacy record version does not match the reviewed snapshot'
                using errcode = '40001';
        end if;
        v_target_kind := 'legacy_record';
        v_target_id := v_subject.legacy_record_id;
        v_scope := 'legacy_metadata_only';
    end if;

    if v_target_kind = 'candidate' then
        select (
            select count(*) from app.file_blobs b
            where b.organization_id = v_org and b.candidate_id = v_target_id
                and b.lifecycle in ('live', 'unavailable', 'retired')
        ) + (
            select count(*) from app.documents d
            where d.organization_id = v_org and d.candidate_id = v_target_id
                and d.lifecycle = 'active'
        ) + (
            select count(*) from app.candidate_processing_purposes cp
            where cp.organization_id = v_org and cp.candidate_id = v_target_id
                and cp.status = 'active'
        ) + (
            select count(*) from app.document_disclosures dd
            where dd.organization_id = v_org and dd.candidate_id = v_target_id
                and dd.status = 'intended'
        ) into v_children;
    else
        select count(*) into v_children
        from app.document_disclosures dd
        where dd.organization_id = v_org and dd.legacy_record_id = v_target_id
            and dd.status = 'intended';
    end if;
    if v_children > 1000 then
        raise exception 'Restriction scope exceeds the interactive bound of 1000 records'
            using errcode = '54000';
    end if;

    if v_target_kind = 'candidate' then
        perform b.id from app.file_blobs b
        where b.organization_id = v_org and b.candidate_id = v_target_id
            and b.lifecycle in ('live', 'unavailable', 'retired')
        order by b.id
        for update of b;
        perform d.id from app.documents d
        where d.organization_id = v_org and d.candidate_id = v_target_id
            and d.lifecycle = 'active'
        order by d.id
        for update of d;
        perform cp.id from app.candidate_processing_purposes cp
        where cp.organization_id = v_org and cp.candidate_id = v_target_id
            and cp.status = 'active'
        order by cp.id
        for update of cp;
        perform dd.id from app.document_disclosures dd
        where dd.organization_id = v_org and dd.candidate_id = v_target_id
            and dd.status = 'intended'
        order by dd.id
        for update of dd;

        update app.candidates set
            lifecycle = 'restricted',
            lifecycle_generation = lifecycle_generation + 1,
            version = version + 1,
            updated_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and id = v_target_id;
        update app.file_blobs set
            lifecycle_generation = lifecycle_generation + 1,
            scan_generation = scan_generation + 1,
            version = version + 1,
            updated_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and candidate_id = v_target_id
            and lifecycle in ('live', 'unavailable', 'retired');
        update app.documents set
            lifecycle = 'restricted',
            version = version + 1,
            updated_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and candidate_id = v_target_id
            and lifecycle = 'active';
        update app.candidate_processing_purposes set
            status = 'restricted',
            version = version + 1,
            updated_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and candidate_id = v_target_id
            and status = 'active';
        update app.document_disclosures set
            status = 'cancelled',
            version = version + 1,
            updated_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and candidate_id = v_target_id
            and status = 'intended';
        v_target_version := v_candidate.version;
        v_generation := v_candidate.lifecycle_generation + 1;
    else
        perform dd.id from app.document_disclosures dd
        where dd.organization_id = v_org and dd.legacy_record_id = v_target_id
            and dd.status = 'intended'
        order by dd.id
        for update of dd;

        update app.legacy_records set
            processing_restricted = true,
            lifecycle_generation = lifecycle_generation + 1,
            version = version + 1,
            updated_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and id = v_target_id;
        update app.document_disclosures set
            status = 'cancelled',
            version = version + 1,
            updated_at = pg_catalog.clock_timestamp()
        where organization_id = v_org and legacy_record_id = v_target_id
            and status = 'intended';
        v_target_version := v_record.version;
        v_generation := v_record.lifecycle_generation + 1;
    end if;

    update app.privacy_requests set
        status = 'in_progress',
        version = version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and id = p_request_id;

    perform app.privacy_record_event_v1(
        p_request_id, p_subject_id, v_subject.candidate_id,
        'privacy.subject.restricted', v_generation, v_member,
        p_audit_id, p_correlation_id,
        jsonb_build_object(
            'subject_id', p_subject_id,
            'target_id', v_target_id,
            'target_kind', v_target_kind,
            'previous_version', v_request.version,
            'new_version', v_request.version + 1,
            'target_previous_version', v_target_version,
            'target_new_version', v_target_version + 1,
            'lifecycle_generation', v_generation,
            'enforcement_scope', v_scope
        )
    );

    return jsonb_build_object(
        'request_id', p_request_id,
        'request_version', (v_request.version + 1)::text,
        'status', 'in_progress',
        'subject_id', p_subject_id,
        'target_version', (v_target_version + 1)::text,
        'lifecycle_generation', v_generation::text,
        'scope', v_scope
    );
end
$$;

revoke all on function app.privacy_actor_v1(uuid, uuid) from public;
revoke all on function app.privacy_lock_request_v1(uuid, bigint) from public;
revoke all on function app.privacy_record_event_v1(
    uuid, uuid, uuid, text, bigint, uuid, uuid, uuid, jsonb
) from public;
revoke all on function app.create_privacy_request_v1(
    uuid, text, timestamptz, timestamptz, uuid, uuid
) from public;
revoke all on function app.review_privacy_subject_v1(
    uuid, bigint, uuid, uuid, uuid, bigint, bytea, uuid, uuid
) from public;
revoke all on function app.verify_privacy_request_v1(
    uuid, bigint, text, uuid, uuid
) from public;
revoke all on function app.correct_privacy_candidate_v1(
    uuid, bigint, uuid, bigint, jsonb, uuid, uuid
) from public;
revoke all on function app.restrict_privacy_subject_v1(
    uuid, bigint, uuid, bigint, uuid, uuid
) from public;

grant execute on function app.privacy_actor_v1(uuid, uuid) to app_executor;
grant execute on function app.privacy_lock_request_v1(uuid, bigint) to app_executor;
grant execute on function app.privacy_record_event_v1(
    uuid, uuid, uuid, text, bigint, uuid, uuid, uuid, jsonb
) to app_executor;
grant execute on function app.create_privacy_request_v1(
    uuid, text, timestamptz, timestamptz, uuid, uuid
) to app_staff;
grant execute on function app.review_privacy_subject_v1(
    uuid, bigint, uuid, uuid, uuid, bigint, bytea, uuid, uuid
) to app_staff;
grant execute on function app.verify_privacy_request_v1(
    uuid, bigint, text, uuid, uuid
) to app_staff;
grant execute on function app.correct_privacy_candidate_v1(
    uuid, bigint, uuid, bigint, jsonb, uuid, uuid
) to app_staff;
grant execute on function app.restrict_privacy_subject_v1(
    uuid, bigint, uuid, bigint, uuid, uuid
) to app_staff;

grant create on schema app to app_executor;

reset role;

alter function app.create_privacy_request_v1(
    uuid, text, timestamptz, timestamptz, uuid, uuid
) owner to app_executor;
alter function app.review_privacy_subject_v1(
    uuid, bigint, uuid, uuid, uuid, bigint, bytea, uuid, uuid
) owner to app_executor;
alter function app.verify_privacy_request_v1(
    uuid, bigint, text, uuid, uuid
) owner to app_executor;
alter function app.correct_privacy_candidate_v1(
    uuid, bigint, uuid, bigint, jsonb, uuid, uuid
) owner to app_executor;
alter function app.restrict_privacy_subject_v1(
    uuid, bigint, uuid, bigint, uuid, uuid
) owner to app_executor;

set local role app_owner;

revoke create on schema app from app_executor;

commit;
