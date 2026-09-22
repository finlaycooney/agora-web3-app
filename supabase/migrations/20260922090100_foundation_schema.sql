begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
    if current_setting('server_version_num')::integer / 10000 <> 17 then
        raise exception 'Foundation requires PostgreSQL 17';
    end if;
end
$$;

set local role app_owner;

create schema app authorization app_owner;

revoke all on schema app from public;

alter default privileges for role app_owner in schema app revoke all on tables from public;
alter default privileges for role app_owner in schema app revoke all on sequences from public;
alter default privileges for role app_owner revoke execute on functions from public;

create table app.organizations (
    id uuid primary key,
    key text not null,
    name text not null,
    status text not null check (status in ('active', 'suspended')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (key)
);

create table app.users (
    id uuid primary key,
    display_name text,
    status text not null check (status in ('active', 'disabled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0)
);

create index users_status_id_idx on app.users (status, id);

create table app.auth_identities (
    id uuid primary key,
    user_id uuid not null references app.users (id),
    provider text not null,
    issuer text not null,
    provider_subject text not null,
    verified_at timestamptz not null,
    last_seen_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    unique (provider, issuer, provider_subject)
);

create index auth_identities_user_id_id_idx on app.auth_identities (user_id, id);

create table app.permissions (
    key text primary key,
    description text not null,
    introduced_version integer not null check (introduced_version > 0),
    retired_at timestamptz,
    created_at timestamptz not null default now()
);

create table app.roles (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    key text not null,
    name text not null,
    status text not null check (status in ('active', 'inactive', 'archived')),
    system_kind text check (system_kind is null or system_kind in ('admin', 'recruiter', 'viewer')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, key)
);

create unique index roles_single_system_kind_idx
    on app.roles (organization_id, system_kind)
    where system_kind is not null;

create table app.role_permissions (
    organization_id uuid not null,
    role_id uuid not null,
    permission_key text not null references app.permissions (key),
    granted_by_user_id uuid references app.users (id),
    created_at timestamptz not null default now(),
    primary key (organization_id, role_id, permission_key),
    foreign key (organization_id, role_id) references app.roles (organization_id, id)
);

create index role_permissions_permission_key_idx
    on app.role_permissions (permission_key, organization_id, role_id);

create index role_permissions_granted_by_user_id_idx
    on app.role_permissions (granted_by_user_id);

create table app.organization_memberships (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    user_id uuid not null references app.users (id),
    role_id uuid not null,
    status text not null check (status in ('invited', 'active', 'revoked')),
    activated_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, user_id),
    foreign key (organization_id, role_id) references app.roles (organization_id, id),
    check (status <> 'active' or (activated_at is not null and revoked_at is null)),
    check (status <> 'revoked' or revoked_at is not null)
);

create index organization_memberships_role_status_idx
    on app.organization_memberships (organization_id, role_id, status, id);

create index organization_memberships_user_id_idx
    on app.organization_memberships (user_id);

create table app.clients (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    name text not null,
    status text not null check (status in ('active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id)
);

create index clients_status_created_idx
    on app.clients (organization_id, status, created_at desc, id desc);

create table app.pipelines (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    key text not null,
    name text not null,
    status text not null check (status in ('active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, key)
);

create table app.pipeline_stages (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    pipeline_id uuid not null,
    key text not null,
    label text not null,
    kind text not null check (kind in ('active', 'hired', 'rejected', 'withdrawn')),
    position integer not null check (position >= 0),
    is_initial boolean not null default false,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, pipeline_id, id),
    unique (organization_id, pipeline_id, key),
    foreign key (organization_id, pipeline_id) references app.pipelines (organization_id, id)
);

create unique index pipeline_stages_single_initial_idx
    on app.pipeline_stages (organization_id, pipeline_id)
    where is_initial and archived_at is null;

create index pipeline_stages_position_idx
    on app.pipeline_stages (organization_id, pipeline_id, position, id);

create table app.jobs (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    client_id uuid not null,
    pipeline_id uuid not null,
    owner_membership_id uuid,
    slug text not null,
    title text not null,
    description text not null,
    responsibilities text[] not null default '{}',
    tags text[] not null default '{}',
    salary_display text,
    location_display text not null,
    employment_type text not null,
    public_client_name text,
    publication_state text not null check (publication_state in ('draft', 'published', 'withdrawn', 'archived')),
    application_state text not null check (application_state in ('open', 'closed')),
    publication_reviewed_by uuid,
    publication_reviewed_at timestamptz,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (slug),
    foreign key (organization_id, client_id) references app.clients (organization_id, id),
    foreign key (organization_id, pipeline_id) references app.pipelines (organization_id, id),
    foreign key (organization_id, owner_membership_id) references app.organization_memberships (organization_id, id),
    foreign key (organization_id, publication_reviewed_by) references app.organization_memberships (organization_id, id),
    check (publication_state <> 'published' or (
        publication_reviewed_at is not null
        and publication_reviewed_by is not null
        and published_at is not null
    ))
);

create index jobs_publication_idx
    on app.jobs (organization_id, publication_state, application_state, created_at desc, id desc);

create index jobs_client_idx on app.jobs (organization_id, client_id);
create index jobs_pipeline_idx on app.jobs (organization_id, pipeline_id);
create index jobs_owner_membership_idx on app.jobs (organization_id, owner_membership_id);
create index jobs_publication_reviewed_by_idx on app.jobs (organization_id, publication_reviewed_by);

create table app.candidates (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    full_name text,
    professional_summary text,
    owner_membership_id uuid,
    identity_state text not null check (identity_state in ('provisional', 'established')),
    lifecycle text not null check (lifecycle in ('active', 'restricted', 'deleting', 'deleted', 'merged')),
    merged_into_id uuid,
    lifecycle_generation bigint not null default 1 check (lifecycle_generation > 0),
    profile_version bigint not null default 1 check (profile_version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    foreign key (organization_id, owner_membership_id) references app.organization_memberships (organization_id, id),
    constraint candidates_merged_into_fk
        foreign key (organization_id, merged_into_id)
        references app.candidates (organization_id, id),
    check (merged_into_id is null or merged_into_id <> id),
    check (
        (lifecycle = 'merged' and merged_into_id is not null)
        or (lifecycle <> 'merged' and merged_into_id is null)
    )
);

create index candidates_lifecycle_idx
    on app.candidates (organization_id, lifecycle, created_at desc, id desc);

create index candidates_owner_membership_idx
    on app.candidates (organization_id, owner_membership_id, lifecycle, id);

create index candidates_merged_into_idx on app.candidates (organization_id, merged_into_id);

create table app.candidate_sources (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid not null,
    kind text not null check (kind in ('public_application', 'manual', 'referral', 'legacy', 'import')),
    received_at timestamptz not null,
    created_by_membership_id uuid,
    context_summary text,
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, candidate_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, created_by_membership_id) references app.organization_memberships (organization_id, id)
);

create index candidate_sources_received_idx
    on app.candidate_sources (organization_id, candidate_id, received_at desc, id desc);

create index candidate_sources_created_by_idx
    on app.candidate_sources (organization_id, created_by_membership_id);

create table app.candidate_identifiers (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid not null,
    kind text not null check (kind in ('email', 'phone', 'professional_url', 'provider_subject')),
    raw_value text not null,
    normalized_value text,
    normalization_version integer not null check (normalization_version > 0),
    provider_issuer text,
    verification text not null check (verification in ('unverified', 'verified', 'disputed')),
    verified_at timestamptz,
    source_id uuid,
    received_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    constraint candidate_identifiers_source_fk
        foreign key (organization_id, candidate_id, source_id)
        references app.candidate_sources (organization_id, candidate_id, id)
        deferrable initially immediate,
    check (verification <> 'verified' or verified_at is not null)
);

create index candidate_identifiers_normalized_idx
    on app.candidate_identifiers (organization_id, kind, normalized_value, candidate_id);

create index candidate_identifiers_candidate_idx
    on app.candidate_identifiers (organization_id, candidate_id, id);

create index candidate_identifiers_source_idx
    on app.candidate_identifiers (organization_id, candidate_id, source_id);

create table app.applications (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    candidate_id uuid not null,
    job_id uuid not null,
    pipeline_id uuid not null,
    stage_id uuid not null,
    public_reference text not null,
    reference_version integer not null check (reference_version in (1, 2)),
    submitted_name text,
    submitted_email text,
    submitted_professional_url text,
    submitted_achievement text,
    submitted_job_title text,
    source_id uuid,
    received_at timestamptz not null,
    facts_erased_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    unique (organization_id, candidate_id, id),
    unique (public_reference),
    foreign key (organization_id, candidate_id) references app.candidates (organization_id, id),
    foreign key (organization_id, job_id) references app.jobs (organization_id, id),
    foreign key (organization_id, pipeline_id) references app.pipelines (organization_id, id),
    constraint applications_stage_fk
        foreign key (organization_id, pipeline_id, stage_id)
        references app.pipeline_stages (organization_id, pipeline_id, id),
    constraint applications_source_fk
        foreign key (organization_id, candidate_id, source_id)
        references app.candidate_sources (organization_id, candidate_id, id)
        deferrable initially immediate,
    check (
        (reference_version = 1 and public_reference ~ '^AG-[0-9A-F]{12}$')
        or (reference_version = 2 and public_reference ~ '^AG-[0-9A-F]{24}$')
    )
);

create index applications_job_stage_idx
    on app.applications (organization_id, job_id, stage_id, received_at desc, id desc);

create index applications_candidate_idx
    on app.applications (organization_id, candidate_id, received_at desc, id desc);

create index applications_pipeline_stage_idx
    on app.applications (organization_id, pipeline_id, stage_id);

create index applications_source_idx
    on app.applications (organization_id, candidate_id, source_id);

create table app.application_stage_history (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    application_id uuid not null,
    sequence bigint not null check (sequence > 0),
    from_pipeline_id uuid,
    from_stage_id uuid,
    to_pipeline_id uuid not null,
    to_stage_id uuid not null,
    actor_membership_id uuid,
    actor_kind text not null check (actor_kind in ('staff', 'intake', 'migration')),
    reason text,
    occurred_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    unique (organization_id, application_id, sequence),
    foreign key (organization_id, application_id) references app.applications (organization_id, id),
    foreign key (organization_id, from_pipeline_id, from_stage_id)
        references app.pipeline_stages (organization_id, pipeline_id, id),
    foreign key (organization_id, to_pipeline_id, to_stage_id)
        references app.pipeline_stages (organization_id, pipeline_id, id),
    foreign key (organization_id, actor_membership_id)
        references app.organization_memberships (organization_id, id),
    check (
        (sequence = 1 and from_pipeline_id is null and from_stage_id is null)
        or (sequence > 1 and from_pipeline_id is not null and from_stage_id is not null)
    ),
    check (actor_kind <> 'staff' or actor_membership_id is not null)
);

create index application_stage_history_from_stage_idx
    on app.application_stage_history (organization_id, from_pipeline_id, from_stage_id);

create index application_stage_history_to_stage_idx
    on app.application_stage_history (organization_id, to_pipeline_id, to_stage_id);

create index application_stage_history_actor_idx
    on app.application_stage_history (organization_id, actor_membership_id);

alter table app.organizations enable row level security;
alter table app.organizations force row level security;
alter table app.users enable row level security;
alter table app.users force row level security;
alter table app.auth_identities enable row level security;
alter table app.auth_identities force row level security;
alter table app.permissions enable row level security;
alter table app.permissions force row level security;
alter table app.roles enable row level security;
alter table app.roles force row level security;
alter table app.role_permissions enable row level security;
alter table app.role_permissions force row level security;
alter table app.organization_memberships enable row level security;
alter table app.organization_memberships force row level security;
alter table app.clients enable row level security;
alter table app.clients force row level security;
alter table app.pipelines enable row level security;
alter table app.pipelines force row level security;
alter table app.pipeline_stages enable row level security;
alter table app.pipeline_stages force row level security;
alter table app.jobs enable row level security;
alter table app.jobs force row level security;
alter table app.candidates enable row level security;
alter table app.candidates force row level security;
alter table app.candidate_sources enable row level security;
alter table app.candidate_sources force row level security;
alter table app.candidate_identifiers enable row level security;
alter table app.candidate_identifiers force row level security;
alter table app.applications enable row level security;
alter table app.applications force row level security;
alter table app.application_stage_history enable row level security;
alter table app.application_stage_history force row level security;

commit;
