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

create table app.processing_purposes (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    key text not null,
    policy_version integer not null check (policy_version > 0),
    description text not null,
    legal_basis text not null,
    jurisdiction text not null,
    retention_rule text not null,
    status text not null check (status in ('draft', 'active', 'retired')),
    approved_by_membership_id uuid,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, key, policy_version),
    foreign key (organization_id, approved_by_membership_id)
        references app.organization_memberships (organization_id, id),
    check ((approved_by_membership_id is null) = (approved_at is null)),
    check (status <> 'active' or approved_at is not null)
);

create index processing_purposes_approved_by_idx
    on app.processing_purposes (organization_id, approved_by_membership_id);

create function app.processing_purpose_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
begin
    if not (
        (old.status = 'draft' and new.status in ('draft', 'active', 'retired'))
        or (old.status = 'active' and new.status in ('active', 'retired'))
        or (old.status = 'retired' and new.status = 'retired')
    ) then
        raise exception 'invalid purpose status transition'
            using errcode = 'check_violation';
    end if;
    if old.approved_at is not null and (
        new.id is distinct from old.id
        or new.organization_id is distinct from old.organization_id
        or new.key is distinct from old.key
        or new.policy_version is distinct from old.policy_version
        or new.description is distinct from old.description
        or new.legal_basis is distinct from old.legal_basis
        or new.jurisdiction is distinct from old.jurisdiction
        or new.retention_rule is distinct from old.retention_rule
        or new.approved_by_membership_id is distinct from old.approved_by_membership_id
        or new.approved_at is distinct from old.approved_at
        or new.created_at is distinct from old.created_at
    ) then
        raise exception 'approved purpose version is immutable'
            using errcode = 'check_violation';
    end if;
    return new;
end
$$;

create trigger processing_purposes_guard_trg
    before update on app.processing_purposes
    for each row execute function app.processing_purpose_guard_v1();

create table app.privacy_notices (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    purpose_id uuid not null,
    version text not null,
    locale text not null,
    content text not null,
    content_sha256 bytea not null check (octet_length(content_sha256) = 32),
    published_at timestamptz,
    retired_at timestamptz,
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, purpose_id, id),
    unique (organization_id, purpose_id, version, locale),
    foreign key (organization_id, purpose_id)
        references app.processing_purposes (organization_id, id),
    check (content_sha256 = pg_catalog.sha256(pg_catalog.convert_to(content, 'UTF8'))),
    check (retired_at is null or (published_at is not null and retired_at >= published_at))
);

create function app.privacy_notice_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_purpose app.processing_purposes%rowtype;
begin
    if new.published_at is not null
        and (tg_op = 'INSERT' or old.published_at is null) then
        select p.* into v_purpose
        from app.processing_purposes p
        where p.organization_id = new.organization_id
            and p.id = new.purpose_id
        for share of p;
        if v_purpose.id is null
            or v_purpose.status <> 'active'
            or v_purpose.approved_at is null then
            raise exception 'notice publication requires an active approved purpose'
                using errcode = 'check_violation';
        end if;
    end if;
    if tg_op = 'UPDATE' then
        if old.published_at is not null and (
            new.id is distinct from old.id
            or new.organization_id is distinct from old.organization_id
            or new.purpose_id is distinct from old.purpose_id
            or new.version is distinct from old.version
            or new.locale is distinct from old.locale
            or new.content is distinct from old.content
            or new.content_sha256 is distinct from old.content_sha256
            or new.published_at is distinct from old.published_at
            or new.created_at is distinct from old.created_at
        ) then
            raise exception 'published notice content is immutable'
                using errcode = 'check_violation';
        end if;
        if old.retired_at is not null and new.retired_at is null then
            raise exception 'notice retirement cannot be cleared'
                using errcode = 'check_violation';
        end if;
    end if;
    return new;
end
$$;

create trigger privacy_notices_guard_trg
    before insert or update on app.privacy_notices
    for each row execute function app.privacy_notice_guard_v1();

create table app.candidate_processing_purposes (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid not null,
    purpose_id uuid not null,
    notice_id uuid,
    source_id uuid,
    status text not null check (status in ('active', 'restricted', 'expired', 'withdrawn')),
    established_at timestamptz not null,
    review_at timestamptz not null,
    expires_at timestamptz,
    evidence_summary text check (
        evidence_summary is null or char_length(evidence_summary) <= 2048
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, candidate_id, purpose_id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, purpose_id)
        references app.processing_purposes (organization_id, id),
    foreign key (organization_id, purpose_id, notice_id)
        references app.privacy_notices (organization_id, purpose_id, id),
    constraint candidate_processing_purposes_source_fk
        foreign key (organization_id, candidate_id, source_id)
        references app.candidate_sources (organization_id, candidate_id, id)
        deferrable initially immediate,
    check (review_at >= established_at),
    check (expires_at is null or expires_at >= established_at)
);

create index candidate_processing_purposes_status_idx
    on app.candidate_processing_purposes (organization_id, status, review_at, id);

create index candidate_processing_purposes_notice_idx
    on app.candidate_processing_purposes (organization_id, purpose_id, notice_id);

create index candidate_processing_purposes_source_idx
    on app.candidate_processing_purposes (organization_id, candidate_id, source_id);

create table app.privacy_requests (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid,
    kind text not null check (kind in (
        'access', 'correction', 'restriction', 'erasure',
        'objection', 'portability', 'withdrawal'
    )),
    status text not null check (status in (
        'received', 'verified', 'in_progress', 'fulfilled', 'rejected'
    )),
    received_at timestamptz not null,
    verified_by_membership_id uuid,
    verified_at timestamptz,
    verification_method text,
    due_at timestamptz,
    response_sent_at timestamptz,
    response_code text,
    resolution_code text,
    resolved_at timestamptz,
    ledger_sequence bigint,
    ledger_confirmed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, ledger_sequence),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, verified_by_membership_id)
        references app.organization_memberships (organization_id, id),
    check ((verified_by_membership_id is null) = (verified_at is null)),
    check (verified_at is null or (
        verification_method is not null and btrim(verification_method) <> ''
    )),
    check (status not in ('verified', 'in_progress', 'fulfilled') or (
        verified_at is not null
        and verification_method is not null and btrim(verification_method) <> ''
    )),
    check ((response_sent_at is null) = (response_code is null)),
    check (
        (status in ('fulfilled', 'rejected')
            and resolved_at is not null
            and resolution_code is not null and btrim(resolution_code) <> '')
        or (status not in ('fulfilled', 'rejected')
            and resolved_at is null and resolution_code is null)
    ),
    check (status <> 'fulfilled' or kind not in ('restriction', 'erasure') or (
        ledger_sequence is not null and ledger_sequence > 0
        and ledger_confirmed_at is not null
    )),
    check (ledger_confirmed_at is null or ledger_sequence is not null),
    check (ledger_sequence is null or ledger_sequence > 0),
    check (due_at is null or due_at >= received_at),
    check (verified_at is null or verified_at >= received_at),
    check (response_sent_at is null or response_sent_at >= received_at),
    check (resolved_at is null or resolved_at >= received_at),
    check (ledger_confirmed_at is null or ledger_confirmed_at >= received_at)
);

create index privacy_requests_status_idx
    on app.privacy_requests (organization_id, status, due_at, id);

create index privacy_requests_candidate_idx
    on app.privacy_requests (organization_id, candidate_id);

create index privacy_requests_verified_by_idx
    on app.privacy_requests (organization_id, verified_by_membership_id);

create table app.privacy_complaints (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid,
    related_request_id uuid,
    owner_membership_id uuid,
    status text not null check (status in ('received', 'in_progress', 'resolved')),
    received_at timestamptz not null,
    acknowledgment_due_at timestamptz,
    acknowledged_at timestamptz,
    next_update_due_at timestamptz,
    summary text check (summary is null or char_length(summary) <= 2048),
    outcome_code text,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, related_request_id)
        references app.privacy_requests (organization_id, id),
    foreign key (organization_id, owner_membership_id)
        references app.organization_memberships (organization_id, id),
    check (
        (status = 'resolved' and resolved_at is not null
            and outcome_code is not null and btrim(outcome_code) <> '')
        or (status <> 'resolved' and resolved_at is null and outcome_code is null)
    ),
    check (acknowledgment_due_at is null or acknowledgment_due_at >= received_at),
    check (acknowledged_at is null or acknowledged_at >= received_at),
    check (next_update_due_at is null or next_update_due_at >= received_at),
    check (resolved_at is null or resolved_at >= received_at)
);

create index privacy_complaints_status_idx
    on app.privacy_complaints (organization_id, status, acknowledgment_due_at, id);

create index privacy_complaints_candidate_idx
    on app.privacy_complaints (organization_id, candidate_id);

create index privacy_complaints_request_idx
    on app.privacy_complaints (organization_id, related_request_id);

create index privacy_complaints_owner_idx
    on app.privacy_complaints (organization_id, owner_membership_id);

alter table app.applications add column notice_id uuid;

alter table app.applications
    add constraint applications_notice_fk
    foreign key (organization_id, notice_id)
    references app.privacy_notices (organization_id, id);

create index applications_notice_idx on app.applications (organization_id, notice_id);

alter table app.processing_purposes enable row level security;
alter table app.processing_purposes force row level security;
alter table app.privacy_notices enable row level security;
alter table app.privacy_notices force row level security;
alter table app.candidate_processing_purposes enable row level security;
alter table app.candidate_processing_purposes force row level security;
alter table app.privacy_requests enable row level security;
alter table app.privacy_requests force row level security;
alter table app.privacy_complaints enable row level security;
alter table app.privacy_complaints force row level security;

revoke all on function app.processing_purpose_guard_v1() from public;
revoke all on function app.privacy_notice_guard_v1() from public;

commit;
