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

-- Staff TOTP credentials. Self-service: every row is bound to the acting
-- staff user at the RLS level, so a staff member can only ever see or mutate
-- their own credential. Secrets stay plaintext inside a deny-all table; the
-- only access path is the procedure set below, executed under a trusted
-- actor context. TOTP code verification itself happens server-side — the
-- database stores the secret, enforces ownership and replay-monotonicity.
create table app.totp_credentials (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    user_id uuid not null references app.users (id),
    secret text not null check (
        char_length(secret) between 16 and 128 and secret ~ '^[A-Z2-7]+=*$'
    ),
    label text check (label is null or char_length(label) <= 64),
    status text not null check (status in ('pending', 'active', 'revoked')),
    last_used_counter bigint not null default -1 check (last_used_counter >= -1),
    verified_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    check (status <> 'active' or (verified_at is not null and revoked_at is null)),
    check (status <> 'revoked' or revoked_at is not null),
    check (status <> 'pending' or verified_at is null)
);

create unique index totp_credentials_user_pending_uq
    on app.totp_credentials (organization_id, user_id) where status = 'pending';
create unique index totp_credentials_user_active_uq
    on app.totp_credentials (organization_id, user_id) where status = 'active';

alter table app.totp_credentials enable row level security;
alter table app.totp_credentials force row level security;

create policy executor_totp_credentials_select on app.totp_credentials
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'));
create policy executor_totp_credentials_insert on app.totp_credentials
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'));
create policy executor_totp_credentials_update on app.totp_credentials
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'));

grant select, insert,
    update (status, last_used_counter, verified_at, revoked_at, label)
    on app.totp_credentials to app_executor;

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
        and pg_catalog.pg_get_constraintdef(con.oid) like '%staff.membership.changed%';
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
        )
    );

create function app.totp_actor_v1(
    p_write boolean
)
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
    if v_org is null or v_actor is null then
        raise exception 'Staff context required' using errcode = '42501';
    end if;
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Read committed required' using errcode = '25001';
    end if;
    if coalesce(p_write, false) then
        perform o.id from app.organizations o where o.id = v_org for update;
    else
        perform o.id from app.organizations o where o.id = v_org for share;
    end if;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
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

-- Returns the acting user's current credential (pending preferred over active
-- so a mid-enrollment state keeps rendering the same secret). Includes the
-- secret: this is a server-only read path behind a trusted actor context.
create function app.totp_status_v1()
returns table (credential_id uuid, status text, secret text, last_used_counter bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
begin
    v_member := app.totp_actor_v1(false);
    return query
    select c.id, c.status, c.secret, c.last_used_counter
    from app.totp_credentials c
    where c.organization_id = v_org and c.user_id = v_actor
        and c.status in ('pending', 'active')
    order by case c.status when 'pending' then 0 else 1 end, c.created_at desc
    limit 1;
end
$$;

create function app.totp_enroll_v1(
    p_secret text,
    p_audit_id uuid,
    p_correlation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_id uuid;
begin
    v_member := app.totp_actor_v1(true);
    if p_audit_id is null or p_correlation_id is null then
        raise exception 'Audit and correlation identifiers required' using errcode = '22023';
    end if;
    if p_secret is null or char_length(p_secret) not between 16 and 128
        or p_secret !~ '^[A-Z2-7]+=*$' then
        raise exception 'Invalid TOTP secret shape' using errcode = '22023';
    end if;
    update app.totp_credentials
        set status = 'revoked', revoked_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and user_id = v_actor and status = 'pending';
    v_id := pg_catalog.gen_random_uuid();
    insert into app.totp_credentials (
        id, organization_id, user_id, secret, status
    ) values (
        v_id, v_org, v_actor, p_secret, 'pending'
    );
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id, action,
        target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, v_member, 'staff.totp.enrolled',
        'totp_credential', v_id, p_correlation_id, pg_catalog.clock_timestamp(),
        pg_catalog.jsonb_build_object('credential_id', v_id)
    );
    return v_id;
end
$$;

-- Activates a pending credential after the server has verified a code against
-- the secret. Any existing active credential is revoked — re-enrollment
-- replaces the device atomically.
create function app.totp_confirm_v1(
    p_credential_id uuid,
    p_audit_id uuid,
    p_correlation_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_row app.totp_credentials%rowtype;
begin
    v_member := app.totp_actor_v1(true);
    if p_audit_id is null or p_correlation_id is null then
        raise exception 'Audit and correlation identifiers required' using errcode = '22023';
    end if;
    select c.* into v_row
    from app.totp_credentials c
    where c.id = p_credential_id
        and c.organization_id = v_org
        and c.user_id = v_actor
    for update;
    if not found then
        raise exception 'Credential not found' using errcode = 'P0002';
    end if;
    if v_row.status <> 'pending' then
        raise exception 'Credential is not pending' using errcode = '23514';
    end if;
    update app.totp_credentials
        set status = 'revoked', revoked_at = pg_catalog.clock_timestamp()
    where organization_id = v_org and user_id = v_actor and status = 'active';
    update app.totp_credentials
        set status = 'active', verified_at = pg_catalog.clock_timestamp()
    where id = v_row.id;
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id, action,
        target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, v_member, 'staff.totp.activated',
        'totp_credential', v_row.id, p_correlation_id, pg_catalog.clock_timestamp(),
        pg_catalog.jsonb_build_object('credential_id', v_row.id)
    );
end
$$;

-- Records a successful code verification. The counter must advance strictly,
-- which is the replay-protection boundary: a code already used within its
-- step window can never be accepted twice.
create function app.totp_record_use_v1(
    p_credential_id uuid,
    p_counter bigint,
    p_audit_id uuid,
    p_correlation_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_row app.totp_credentials%rowtype;
begin
    v_member := app.totp_actor_v1(true);
    if p_audit_id is null or p_correlation_id is null then
        raise exception 'Audit and correlation identifiers required' using errcode = '22023';
    end if;
    if p_counter is null or p_counter < 0 then
        raise exception 'Invalid TOTP counter' using errcode = '22023';
    end if;
    select c.* into v_row
    from app.totp_credentials c
    where c.id = p_credential_id
        and c.organization_id = v_org
        and c.user_id = v_actor
    for update;
    if not found then
        raise exception 'Credential not found' using errcode = 'P0002';
    end if;
    if v_row.status <> 'active' then
        raise exception 'Credential is not active' using errcode = '23514';
    end if;
    if p_counter <= v_row.last_used_counter then
        raise exception 'TOTP counter already used' using errcode = '23514';
    end if;
    update app.totp_credentials
        set last_used_counter = p_counter
    where id = v_row.id;
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id, action,
        target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, v_member, 'staff.totp.verified',
        'totp_credential', v_row.id, p_correlation_id, pg_catalog.clock_timestamp(),
        pg_catalog.jsonb_build_object(
            'credential_id', v_row.id, 'last_used_counter', p_counter
        )
    );
end
$$;

revoke all on function app.totp_actor_v1(boolean) from public;
revoke all on function app.totp_status_v1() from public;
revoke all on function app.totp_enroll_v1(text, uuid, uuid) from public;
revoke all on function app.totp_confirm_v1(uuid, uuid, uuid) from public;
revoke all on function app.totp_record_use_v1(uuid, bigint, uuid, uuid) from public;

grant execute on function app.totp_actor_v1(boolean) to app_executor;
grant execute on function app.totp_status_v1() to app_staff;
grant execute on function app.totp_enroll_v1(text, uuid, uuid) to app_staff;
grant execute on function app.totp_confirm_v1(uuid, uuid, uuid) to app_staff;
grant execute on function app.totp_record_use_v1(uuid, bigint, uuid, uuid) to app_staff;

grant create on schema app to app_executor;

reset role;

alter function app.totp_status_v1() owner to app_executor;
alter function app.totp_enroll_v1(text, uuid, uuid) owner to app_executor;
alter function app.totp_confirm_v1(uuid, uuid, uuid) owner to app_executor;
alter function app.totp_record_use_v1(uuid, bigint, uuid, uuid) owner to app_executor;

set local role app_owner;

revoke create on schema app from app_executor;

commit;
