-- One-use recovery codes and a shared, persistent MFA attempt budget.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
set local role app_owner;

alter table app.totp_credentials add constraint totp_credentials_actor_key
    unique (organization_id, user_id, id);
create table app.staff_mfa_backup_codes (
    organization_id uuid not null,
    user_id uuid not null,
    credential_id uuid not null,
    code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
    used_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (credential_id, code_hash),
    foreign key (organization_id, user_id, credential_id)
        references app.totp_credentials (organization_id, user_id, id)
);
create table app.staff_mfa_attempts (
    organization_id uuid not null,
    user_id uuid not null,
    window_started_at timestamptz not null,
    attempts integer not null check (attempts between 1 and 11),
    primary key (organization_id, user_id),
    foreign key (organization_id, user_id)
        references app.organization_memberships (organization_id, user_id)
);

alter table app.staff_mfa_backup_codes enable row level security;
alter table app.staff_mfa_backup_codes force row level security;
alter table app.staff_mfa_attempts enable row level security;
alter table app.staff_mfa_attempts force row level security;
create policy executor_backup_codes on app.staff_mfa_backup_codes for all to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'));
create policy executor_mfa_attempts on app.staff_mfa_attempts for all to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'));
grant select, insert, delete, update (used_at) on app.staff_mfa_backup_codes to app_executor;
grant select, insert, update (window_started_at, attempts) on app.staff_mfa_attempts to app_executor;

-- Preserve all existing audit variants, including later recruitment actions.
do $$
declare v_predicate text;
begin
    select pg_catalog.pg_get_expr(conbin, conrelid) into strict v_predicate
    from pg_catalog.pg_constraint
    where conrelid = 'app.audit_events'::regclass and conname = 'audit_events_action_check';
    alter table app.audit_events drop constraint audit_events_action_check;
    execute format('alter table app.audit_events add constraint audit_events_action_check check ((%s) or (
        actor_kind = ''staff'' and target_type = ''totp_credential'' and target_id is not null
        and action in (''staff.mfa.backup_codes.generated'', ''staff.mfa.backup_code.used'')
        and details - array[''credential_id''] = ''{}''::jsonb))', v_predicate);
end
$$;

grant create on schema app to app_executor;
set local role app_executor;

-- Reserve BEFORE verification, in its own committed transaction. Invalid
-- codes, replays and transient verification errors must not undo the budget.
create function app.reserve_mfa_attempt_v1()
returns integer language plpgsql volatile security definer
set search_path = pg_catalog, app, pg_temp as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_now timestamptz := clock_timestamp();
    v_row record;
begin
    perform app.totp_actor_v1(false);
    insert into app.staff_mfa_attempts as a
        (organization_id, user_id, window_started_at, attempts)
    values (v_org, v_actor, v_now, 1)
    on conflict (organization_id, user_id) do update set
        window_started_at = case when a.window_started_at <= v_now - interval '10 minutes'
            then v_now else a.window_started_at end,
        attempts = case when a.window_started_at <= v_now - interval '10 minutes'
            then 1 else least(a.attempts + 1, 11) end
    returning attempts, window_started_at into v_row;
    if v_row.attempts > 10 then
        return greatest(1, ceil(extract(epoch from
            (v_row.window_started_at + interval '10 minutes' - v_now)))::integer);
    end if;
    return 0;
end
$$;

create function app.set_mfa_backup_codes_v1(
    p_credential uuid, p_hashes text[], p_audit uuid, p_correlation uuid
)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, app, pg_temp as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
begin
    v_member := app.totp_actor_v1(false);
    if p_audit is null or p_correlation is null or p_credential is null
        or p_hashes is null or cardinality(p_hashes) <> 10
        or (select count(distinct h) from unnest(p_hashes) h) <> 10
        or exists (select 1 from unnest(p_hashes) h where h is null or h !~ '^[a-f0-9]{64}$') then
        raise exception 'Ten distinct backup code hashes required' using errcode = '22023';
    end if;
    perform 1 from app.totp_credentials c where c.organization_id = v_org
        and c.user_id = v_actor and c.id = p_credential and c.status = 'active' for update;
    if not found then raise exception 'Active credential required' using errcode = '42501'; end if;
    delete from app.staff_mfa_backup_codes where credential_id = p_credential;
    insert into app.staff_mfa_backup_codes (organization_id, user_id, credential_id, code_hash)
        select v_org, v_actor, p_credential, h from unnest(p_hashes) h;
    insert into app.audit_events (id, organization_id, actor_kind, actor_user_id,
        actor_membership_id, action, target_type, target_id, correlation_id, occurred_at, details)
    values (p_audit, v_org, 'staff', v_actor, v_member, 'staff.mfa.backup_codes.generated',
        'totp_credential', p_credential, p_correlation, clock_timestamp(),
        jsonb_build_object('credential_id', p_credential));
end
$$;

create function app.consume_mfa_backup_code_v1(
    p_credential uuid, p_hash text, p_audit uuid, p_correlation uuid
)
returns boolean language plpgsql volatile security definer
set search_path = pg_catalog, app, pg_temp as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
begin
    v_member := app.totp_actor_v1(false);
    if p_audit is null or p_correlation is null then
        raise exception 'Audit identifiers required' using errcode = '22023';
    end if;
    -- Same lock as generation: replacing the set and consuming a code cannot race.
    perform 1 from app.totp_credentials c where c.organization_id = v_org
        and c.user_id = v_actor and c.id = p_credential and c.status = 'active' for update;
    if not found then return false; end if;
    update app.staff_mfa_backup_codes set used_at = clock_timestamp()
        where credential_id = p_credential and code_hash = p_hash and used_at is null;
    if not found then return false; end if;
    insert into app.audit_events (id, organization_id, actor_kind, actor_user_id,
        actor_membership_id, action, target_type, target_id, correlation_id, occurred_at, details)
    values (p_audit, v_org, 'staff', v_actor, v_member, 'staff.mfa.backup_code.used',
        'totp_credential', p_credential, p_correlation, clock_timestamp(),
        jsonb_build_object('credential_id', p_credential));
    return true;
end
$$;

revoke all on function app.reserve_mfa_attempt_v1() from public;
revoke all on function app.set_mfa_backup_codes_v1(uuid, text[], uuid, uuid) from public;
revoke all on function app.consume_mfa_backup_code_v1(uuid, text, uuid, uuid) from public;
grant execute on function app.reserve_mfa_attempt_v1() to app_staff;
grant execute on function app.set_mfa_backup_codes_v1(uuid, text[], uuid, uuid) to app_staff;
grant execute on function app.consume_mfa_backup_code_v1(uuid, text, uuid, uuid) to app_staff;

set local role app_owner;
revoke create on schema app from app_executor;
commit;
