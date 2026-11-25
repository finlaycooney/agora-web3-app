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

create table app.file_blobs (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid not null,
    sha256 bytea not null check (octet_length(sha256) = 32),
    size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 4194304),
    mime_type text not null,
    extension text not null check (extension in ('pdf', 'docx')),
    lifecycle text not null check (lifecycle in ('live', 'unavailable', 'retired', 'deleting', 'deleted')),
    scan_state text not null check (scan_state in ('unscanned', 'pending', 'scanning', 'clean', 'infected', 'failed')),
    scan_engine text,
    scan_definitions text,
    scanned_at timestamptz,
    scan_valid_until timestamptz,
    scan_generation bigint not null default 1 check (scan_generation > 0),
    lifecycle_generation bigint not null default 1 check (lifecycle_generation > 0),
    retired_into_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, candidate_id, id),
    constraint file_blobs_candidate_fk
        foreign key (organization_id, candidate_id)
        references app.candidates (organization_id, id)
        deferrable initially immediate,
    constraint file_blobs_retired_into_fk
        foreign key (organization_id, candidate_id, retired_into_id)
        references app.file_blobs (organization_id, candidate_id, id)
        deferrable initially immediate,
    check (retired_into_id is null or retired_into_id <> id),
    check (
        (mime_type = 'application/pdf' and extension = 'pdf')
        or (
            mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            and extension = 'docx'
        )
    ),
    check (scan_state <> 'clean' or (
        scan_engine is not null and btrim(scan_engine) <> ''
        and scan_definitions is not null and btrim(scan_definitions) <> ''
        and scanned_at is not null
        and scan_valid_until is not null
        and scan_valid_until > scanned_at
    ))
);

create unique index file_blobs_live_sha256_idx
    on app.file_blobs (organization_id, candidate_id, sha256)
    where lifecycle = 'live';

create index file_blobs_sha256_idx on app.file_blobs (organization_id, sha256, id);

create index file_blobs_retired_into_idx
    on app.file_blobs (organization_id, candidate_id, retired_into_id);

create table app.blob_locations (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    blob_id uuid not null,
    backend_key text not null,
    bucket text not null,
    object_key text not null,
    state text not null check (state in ('pending', 'available', 'missing', 'delete_pending', 'deleted')),
    is_primary boolean not null default false,
    verified_sha256 bytea check (
        verified_sha256 is null or octet_length(verified_sha256) = 32
    ),
    verified_size_bytes bigint check (
        verified_size_bytes is null
        or (verified_size_bytes > 0 and verified_size_bytes <= 4194304)
    ),
    verified_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (backend_key, bucket, object_key),
    foreign key (organization_id, blob_id) references app.file_blobs (organization_id, id),
    check ((state = 'deleted') = (deleted_at is not null)),
    check (state <> 'deleted' or not is_primary),
    check (state <> 'available' or (
        verified_sha256 is not null and octet_length(verified_sha256) = 32
        and verified_size_bytes is not null
        and verified_size_bytes > 0 and verified_size_bytes <= 4194304
        and verified_at is not null
    ))
);

create unique index blob_locations_single_primary_idx
    on app.blob_locations (organization_id, blob_id)
    where is_primary;

create index blob_locations_blob_state_idx
    on app.blob_locations (organization_id, blob_id, state, id);

create table app.documents (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid not null,
    blob_id uuid not null,
    purpose text not null check (purpose in ('cv')),
    original_filename text not null,
    source_id uuid,
    received_at timestamptz not null,
    supersedes_document_id uuid,
    lifecycle text not null check (lifecycle in ('active', 'restricted', 'retired')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, candidate_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    constraint documents_blob_fk
        foreign key (organization_id, candidate_id, blob_id)
        references app.file_blobs (organization_id, candidate_id, id)
        deferrable initially immediate,
    constraint documents_source_fk
        foreign key (organization_id, candidate_id, source_id)
        references app.candidate_sources (organization_id, candidate_id, id)
        deferrable initially immediate,
    constraint documents_supersedes_fk
        foreign key (organization_id, candidate_id, supersedes_document_id)
        references app.documents (organization_id, candidate_id, id)
        deferrable initially immediate,
    check (supersedes_document_id is null or supersedes_document_id <> id)
);

create index documents_received_idx
    on app.documents (organization_id, candidate_id, received_at desc, id desc);

create index documents_blob_idx on app.documents (organization_id, candidate_id, blob_id);

create index documents_source_idx on app.documents (organization_id, candidate_id, source_id);

create index documents_supersedes_idx
    on app.documents (organization_id, candidate_id, supersedes_document_id);

create table app.application_documents (
    organization_id uuid not null,
    candidate_id uuid not null,
    application_id uuid not null,
    document_id uuid not null,
    submitted_filename text not null,
    attached_at timestamptz not null,
    created_at timestamptz not null default now(),
    primary key (organization_id, application_id, document_id),
    constraint application_documents_application_fk
        foreign key (organization_id, candidate_id, application_id)
        references app.applications (organization_id, candidate_id, id)
        deferrable initially immediate,
    constraint application_documents_document_fk
        foreign key (organization_id, candidate_id, document_id)
        references app.documents (organization_id, candidate_id, id)
        deferrable initially immediate
);

create index application_documents_document_idx
    on app.application_documents (organization_id, document_id, application_id);

create index application_documents_candidate_idx
    on app.application_documents (organization_id, candidate_id, application_id);

create index application_documents_candidate_document_idx
    on app.application_documents (organization_id, candidate_id, document_id);

alter table app.candidates add column current_document_id uuid;

alter table app.candidates
    add constraint candidates_current_document_fk
    foreign key (organization_id, id, current_document_id)
    references app.documents (organization_id, candidate_id, id)
    deferrable initially immediate;

create index candidates_current_document_idx
    on app.candidates (organization_id, id, current_document_id);

create function app.file_blob_identity_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
begin
    if new.sha256 is distinct from old.sha256
        or new.size_bytes is distinct from old.size_bytes
        or new.mime_type is distinct from old.mime_type
        or new.extension is distinct from old.extension then
        raise exception 'file blob identity fields are immutable'
            using errcode = 'check_violation';
    end if;
    return new;
end
$$;

create trigger file_blobs_identity_trg
    before update on app.file_blobs
    for each row execute function app.file_blob_identity_guard_v1();

create function app.blob_location_verify_v1()
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
            and b.id = new.blob_id
        for key share of b;
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

create trigger blob_locations_verify_trg
    before insert or update on app.blob_locations
    for each row execute function app.blob_location_verify_v1();

alter table app.file_blobs enable row level security;
alter table app.file_blobs force row level security;
alter table app.blob_locations enable row level security;
alter table app.blob_locations force row level security;
alter table app.documents enable row level security;
alter table app.documents force row level security;
alter table app.application_documents enable row level security;
alter table app.application_documents force row level security;

revoke all on function app.file_blob_identity_guard_v1() from public;
revoke all on function app.blob_location_verify_v1() from public;

commit;
