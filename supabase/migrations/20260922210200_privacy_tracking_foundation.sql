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
    end if;
end
$$;

set local role app_owner;

create table app.legacy_datasets (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    key text not null,
    connection_key text not null,
    source_kind text not null check (source_kind in ('legacy_applicants')),
    status text not null check (status in ('active', 'inactive')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (key),
    unique (connection_key, source_kind)
);

create function app.legacy_dataset_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
begin
    if new.id is distinct from old.id
        or new.organization_id is distinct from old.organization_id
        or new.key is distinct from old.key
        or new.connection_key is distinct from old.connection_key
        or new.source_kind is distinct from old.source_kind
        or new.created_at is distinct from old.created_at then
        raise exception 'legacy dataset identity fields are immutable'
            using errcode = 'check_violation';
    end if;
    return new;
end
$$;

create trigger legacy_datasets_guard_trg
    before update on app.legacy_datasets
    for each row execute function app.legacy_dataset_guard_v1();

create table app.legacy_records (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    dataset_id uuid not null,
    native_id bigint not null,
    candidate_id uuid,
    source_sha256 bytea check (source_sha256 is null or octet_length(source_sha256) = 32),
    verified_by_membership_id uuid,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, dataset_id, native_id),
    foreign key (organization_id, dataset_id)
        references app.legacy_datasets (organization_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, verified_by_membership_id)
        references app.organization_memberships (organization_id, id),
    check ((verified_by_membership_id is null) = (verified_at is null)),
    check (verified_at is null or source_sha256 is not null)
);

create index legacy_records_candidate_idx
    on app.legacy_records (organization_id, candidate_id);

create index legacy_records_verified_by_idx
    on app.legacy_records (organization_id, verified_by_membership_id);

create function app.legacy_record_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
begin
    if new.id is distinct from old.id
        or new.organization_id is distinct from old.organization_id
        or new.dataset_id is distinct from old.dataset_id
        or new.native_id is distinct from old.native_id
        or new.created_at is distinct from old.created_at then
        raise exception 'legacy record identity fields are immutable'
            using errcode = 'check_violation';
    end if;
    return new;
end
$$;

create trigger legacy_records_guard_trg
    before update on app.legacy_records
    for each row execute function app.legacy_record_guard_v1();

create table app.privacy_request_subjects (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    request_id uuid not null,
    candidate_id uuid,
    legacy_record_id uuid,
    candidate_version bigint check (candidate_version is null or candidate_version > 0),
    source_sha256 bytea check (source_sha256 is null or octet_length(source_sha256) = 32),
    reviewed_by_membership_id uuid not null,
    reviewed_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, request_id, id),
    unique (organization_id, request_id, id, candidate_id),
    unique (organization_id, request_id, candidate_id),
    unique (organization_id, request_id, legacy_record_id),
    foreign key (organization_id, request_id)
        references app.privacy_requests (organization_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, legacy_record_id)
        references app.legacy_records (organization_id, id),
    foreign key (organization_id, reviewed_by_membership_id)
        references app.organization_memberships (organization_id, id),
    check ((candidate_id is null) <> (legacy_record_id is null)),
    check (candidate_id is null or candidate_version is not null),
    check (legacy_record_id is null or (
        candidate_version is null and source_sha256 is not null
    ))
);

create index privacy_request_subjects_candidate_idx
    on app.privacy_request_subjects (organization_id, candidate_id);

create index privacy_request_subjects_legacy_idx
    on app.privacy_request_subjects (organization_id, legacy_record_id);

create index privacy_request_subjects_reviewed_by_idx
    on app.privacy_request_subjects (organization_id, reviewed_by_membership_id);

create table app.privacy_events (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    request_id uuid not null,
    subject_id uuid,
    candidate_id uuid,
    sequence bigint not null check (sequence > 0),
    action text not null,
    lifecycle_generation bigint check (lifecycle_generation is null or lifecycle_generation > 0),
    actor_membership_id uuid,
    occurred_at timestamptz not null,
    evidence_code text not null,
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, request_id, sequence),
    foreign key (organization_id, request_id)
        references app.privacy_requests (organization_id, id),
    foreign key (organization_id, actor_membership_id)
        references app.organization_memberships (organization_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, request_id, subject_id)
        references app.privacy_request_subjects (organization_id, request_id, id),
    foreign key (organization_id, request_id, subject_id, candidate_id)
        references app.privacy_request_subjects (organization_id, request_id, id, candidate_id),
    check (candidate_id is null or subject_id is not null)
);

create index privacy_events_candidate_idx
    on app.privacy_events (organization_id, candidate_id, occurred_at, id);

create index privacy_events_subject_idx
    on app.privacy_events (organization_id, request_id, subject_id, candidate_id);

create index privacy_events_actor_idx
    on app.privacy_events (organization_id, actor_membership_id);

create table app.disclosure_recipients (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    client_id uuid,
    legal_name text not null check (
        btrim(legal_name) <> '' and char_length(legal_name) <= 256
    ),
    relationship text not null check (relationship in (
        'unassessed', 'independent_controller', 'processor', 'joint_controller'
    )),
    country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
    contact_reference text check (
        contact_reference is null or char_length(contact_reference) <= 1024
    ),
    terms_reference text check (
        terms_reference is null or char_length(terms_reference) <= 1024
    ),
    transfer_reference text check (
        transfer_reference is null or char_length(transfer_reference) <= 1024
    ),
    status text not null check (status in ('active', 'inactive')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    foreign key (organization_id, client_id) references app.clients (organization_id, id)
);

create index disclosure_recipients_status_idx
    on app.disclosure_recipients (organization_id, status, legal_name, id);

create index disclosure_recipients_client_idx
    on app.disclosure_recipients (organization_id, client_id);

create table app.document_disclosures (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    recipient_id uuid not null,
    candidate_id uuid,
    document_id uuid,
    legacy_record_id uuid,
    application_id uuid,
    purpose_id uuid,
    actor_membership_id uuid,
    origin text not null check (origin in ('planned', 'historical')),
    channel text not null check (channel in ('email', 'chat', 'ats', 'secure_link', 'other')),
    status text not null check (status in ('intended', 'sent', 'failed', 'unknown', 'cancelled')),
    source_version bigint check (source_version is null or source_version > 0),
    source_sha256 bytea check (source_sha256 is null or octet_length(source_sha256) = 32),
    approval_reference text check (
        approval_reference is null or char_length(approval_reference) <= 1024
    ),
    external_reference text check (
        external_reference is null or char_length(external_reference) <= 1024
    ),
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    foreign key (organization_id, recipient_id)
        references app.disclosure_recipients (organization_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, legacy_record_id)
        references app.legacy_records (organization_id, id),
    foreign key (organization_id, purpose_id)
        references app.processing_purposes (organization_id, id),
    foreign key (organization_id, actor_membership_id)
        references app.organization_memberships (organization_id, id),
    constraint document_disclosures_document_fk
        foreign key (organization_id, candidate_id, document_id)
        references app.documents (organization_id, candidate_id, id)
        deferrable initially immediate,
    constraint document_disclosures_application_fk
        foreign key (organization_id, candidate_id, application_id)
        references app.applications (organization_id, candidate_id, id)
        deferrable initially immediate,
    check (
        (document_id is not null and candidate_id is not null and legacy_record_id is null)
        or (legacy_record_id is not null and document_id is null
            and candidate_id is null and application_id is null)
    ),
    check (origin <> 'planned' or (
        actor_membership_id is not null
        and purpose_id is not null
        and approval_reference is not null and btrim(approval_reference) <> ''
        and source_sha256 is not null
        and (document_id is null or source_version is not null)
    )),
    check ((status = 'sent') = (sent_at is not null))
);

create index document_disclosures_recipient_idx
    on app.document_disclosures (organization_id, recipient_id, created_at, id);

create index document_disclosures_candidate_idx
    on app.document_disclosures (organization_id, candidate_id, created_at, id);

create index document_disclosures_document_idx
    on app.document_disclosures (organization_id, candidate_id, document_id);

create index document_disclosures_legacy_idx
    on app.document_disclosures (organization_id, legacy_record_id);

create index document_disclosures_application_idx
    on app.document_disclosures (organization_id, candidate_id, application_id);

create index document_disclosures_purpose_idx
    on app.document_disclosures (organization_id, purpose_id);

create index document_disclosures_actor_idx
    on app.document_disclosures (organization_id, actor_membership_id);

alter table app.legacy_datasets enable row level security;
alter table app.legacy_datasets force row level security;
alter table app.legacy_records enable row level security;
alter table app.legacy_records force row level security;
alter table app.privacy_request_subjects enable row level security;
alter table app.privacy_request_subjects force row level security;
alter table app.privacy_events enable row level security;
alter table app.privacy_events force row level security;
alter table app.disclosure_recipients enable row level security;
alter table app.disclosure_recipients force row level security;
alter table app.document_disclosures enable row level security;
alter table app.document_disclosures force row level security;

revoke all on function app.legacy_dataset_guard_v1() from public;
revoke all on function app.legacy_record_guard_v1() from public;

commit;
