begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
    if current_setting('server_version_num')::integer / 10000 <> 17 then
        raise exception 'Foundation requires PostgreSQL 17';
    end if;

    if not (select rolsuper from pg_catalog.pg_roles where rolname = session_user) then
        execute format(
            'grant app_executor, app_authz_reader to %I with set true, inherit false',
            session_user
        );
    end if;
end
$$;

set local role app_owner;

alter table app.organization_memberships
    add constraint organization_memberships_org_id_user_unique
    unique (organization_id, id, user_id);

create table app.audit_events (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    actor_kind text not null check (actor_kind in ('staff', 'intake', 'worker', 'migration', 'recovery')),
    actor_user_id uuid references app.users (id),
    actor_membership_id uuid,
    action text not null,
    target_type text not null,
    target_id uuid,
    correlation_id uuid not null,
    occurred_at timestamptz not null,
    details jsonb not null default '{}',
    created_at timestamptz not null default now(),
    unique (organization_id, id),
    foreign key (organization_id, actor_membership_id)
        references app.organization_memberships (organization_id, id),
    foreign key (organization_id, actor_membership_id, actor_user_id)
        references app.organization_memberships (organization_id, id, user_id),
    check (actor_kind <> 'staff' or (actor_user_id is not null and actor_membership_id is not null)),
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
    check (
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
        )
    )
);

create index audit_events_occurred_idx
    on app.audit_events (organization_id, occurred_at desc, id desc);

create index audit_events_target_idx
    on app.audit_events (organization_id, target_type, target_id, occurred_at, id);

create index audit_events_actor_user_idx on app.audit_events (actor_user_id);

create index audit_events_actor_membership_idx
    on app.audit_events (organization_id, actor_membership_id, actor_user_id);

alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;

grant usage on schema app to app_staff;
grant usage on schema app to app_executor;
grant usage on schema app to app_authz_reader;
grant create on schema app to app_executor, app_authz_reader;

grant select on app.organizations to app_authz_reader;
grant select on app.users to app_authz_reader;
grant select on app.auth_identities to app_authz_reader;
grant select on app.organization_memberships to app_authz_reader;
grant select on app.roles to app_authz_reader;
grant select on app.role_permissions to app_authz_reader;
grant select on app.permissions to app_authz_reader;

grant select on app.organizations to app_executor;
grant select on app.users to app_executor;
grant select on app.auth_identities to app_executor;
grant select on app.organization_memberships to app_executor;
grant select on app.roles to app_executor;
grant select on app.role_permissions to app_executor;
grant select on app.permissions to app_executor;
grant update (version) on app.organizations to app_executor;
grant update (role_id, status, activated_at, revoked_at, updated_at, version)
    on app.organization_memberships to app_executor;
grant update (version, updated_at) on app.roles to app_executor;
grant insert, delete on app.role_permissions to app_executor;
grant insert on app.audit_events to app_executor;

create function app.context_uuid_v1(p_setting text)
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog, app, pg_temp
as $$
    select case
        when p_setting in ('app.actor_id', 'app.organization_id')
            and pg_catalog.current_setting(p_setting, true) ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then pg_catalog.current_setting(p_setting, true)::uuid
        else null
    end
$$;

create function app.has_permission_v1(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_org uuid := app.context_uuid_v1('app.organization_id');
begin
    if v_actor is null or v_org is null or p_key is null then
        return false;
    end if;

    return exists (
        select 1
        from app.users u
        join app.organization_memberships m on m.user_id = u.id
        join app.organizations o on o.id = m.organization_id
        join app.roles r
            on r.organization_id = m.organization_id and r.id = m.role_id
        join app.role_permissions rp
            on rp.organization_id = r.organization_id and rp.role_id = r.id
        join app.permissions p on p.key = rp.permission_key
        where u.id = v_actor
            and m.organization_id = v_org
            and o.id = v_org
            and u.status = 'active'
            and m.status = 'active'
            and o.status = 'active'
            and r.status = 'active'
            and r.system_kind is distinct from 'viewer'
            and rp.permission_key = p_key
            and p.retired_at is null
    );
end
$$;

create function app.resolve_staff_principal_v1(
    p_provider text,
    p_issuer text,
    p_subject text,
    p_organization_id uuid
)
returns table (user_id uuid, membership_id uuid, role_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_user uuid;
    v_membership uuid;
    v_role uuid;
begin
    perform pg_catalog.set_config('app.actor_id', '', true);
    perform pg_catalog.set_config('app.organization_id', '', true);
    perform pg_catalog.set_config('app.identity_provider', '', true);
    perform pg_catalog.set_config('app.identity_issuer', '', true);
    perform pg_catalog.set_config('app.identity_subject', '', true);

    if p_provider = 'github'
        and p_issuer = 'https://github.com'
        and p_subject ~ '^[1-9][0-9]{0,19}$'
        and p_organization_id is not null then
        perform pg_catalog.set_config('app.identity_provider', p_provider, true);
        perform pg_catalog.set_config('app.identity_issuer', p_issuer, true);
        perform pg_catalog.set_config('app.identity_subject', p_subject, true);

        select ai.user_id into v_user
        from app.auth_identities ai
        where ai.provider = p_provider
            and ai.issuer = p_issuer
            and ai.provider_subject = p_subject
            and ai.verified_at is not null
            and ai.revoked_at is null;

        if v_user is not null then
            perform pg_catalog.set_config('app.actor_id', v_user::text, true);
            perform pg_catalog.set_config('app.organization_id', p_organization_id::text, true);

            select m.id, m.role_id into v_membership, v_role
            from app.organization_memberships m
            join app.users u on u.id = m.user_id
            join app.organizations o on o.id = m.organization_id
            join app.roles r
                on r.organization_id = m.organization_id and r.id = m.role_id
            where m.user_id = v_user
                and m.organization_id = p_organization_id
                and u.status = 'active'
                and o.status = 'active'
                and m.status = 'active'
                and r.status = 'active'
                and r.system_kind is distinct from 'viewer';
        end if;
    end if;

    perform pg_catalog.set_config('app.actor_id', '', true);
    perform pg_catalog.set_config('app.organization_id', '', true);
    perform pg_catalog.set_config('app.identity_provider', '', true);
    perform pg_catalog.set_config('app.identity_issuer', '', true);
    perform pg_catalog.set_config('app.identity_subject', '', true);

    if v_membership is not null then
        user_id := v_user;
        membership_id := v_membership;
        role_id := v_role;
        return next;
    end if;
    return;
end
$$;

create function app.change_membership_v1(
    p_membership_id uuid,
    p_role_id uuid,
    p_status text,
    p_expected_version bigint,
    p_audit_id uuid,
    p_correlation_id uuid
)
returns table (membership_id uuid, version bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor_membership uuid;
    v_target record;
    v_role record;
    v_now timestamptz;
    v_new_version bigint;
begin
    if p_membership_id is null or p_role_id is null or p_status is null
        or p_expected_version is null or p_expected_version <= 0
        or p_audit_id is null or p_correlation_id is null then
        raise exception 'change_membership_v1 requires nonnull arguments and a positive expected version'
            using errcode = '22023';
    end if;
    if p_status not in ('active', 'revoked') then
        raise exception 'change_membership_v1 supports only active or revoked status'
            using errcode = '22023';
    end if;
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;

    perform o.id from app.organizations o where o.id = v_org for update;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    v_now := pg_catalog.clock_timestamp();

    if not app.has_permission_v1('staff.manage') then
        raise exception 'staff.manage permission is required' using errcode = '42501';
    end if;

    perform 1 from app.organizations o where o.id = v_org and o.status = 'active';
    if not found then
        raise exception 'Organization is not active' using errcode = '42501';
    end if;

    select m.id into v_actor_membership
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';

    select m.* into v_target
    from app.organization_memberships m
    where m.organization_id = v_org and m.id = p_membership_id
    for update of m;
    if not found then
        raise exception 'Membership not found' using errcode = 'P0002';
    end if;
    if v_target.version <> p_expected_version then
        raise exception 'Membership version does not match expected version'
            using errcode = '40001';
    end if;

    if p_status = 'active' then
        perform 1 from app.users u where u.id = v_target.user_id and u.status = 'active';
        if not found then
            raise exception 'Target user is not active' using errcode = '42501';
        end if;
        perform 1 from app.auth_identities ai
        where ai.user_id = v_target.user_id
            and ai.verified_at is not null
            and ai.revoked_at is null;
        if not found then
            raise exception 'Target user has no verified nonrevoked identity'
                using errcode = '42501';
        end if;
        select r.* into v_role
        from app.roles r
        where r.organization_id = v_org and r.id = p_role_id;
        if not found then
            raise exception 'Role not found' using errcode = 'P0002';
        end if;
        if v_role.status <> 'active' or v_role.system_kind = 'viewer' then
            raise exception 'Assigned role must be active and not a viewer role'
                using errcode = '42501';
        end if;
        if p_role_id <> v_target.role_id
            and not app.has_permission_v1('roles.manage') then
            raise exception 'roles.manage permission is required to change role assignment'
                using errcode = '42501';
        end if;
    elsif p_role_id <> v_target.role_id then
        raise exception 'Revocation cannot reassign the role' using errcode = '22023';
    end if;

    v_new_version := v_target.version + 1;
    if p_status = 'active' then
        update app.organization_memberships
        set role_id = p_role_id,
            status = 'active',
            activated_at = case
                when v_target.status = 'active' then activated_at else v_now end,
            revoked_at = null,
            updated_at = v_now,
            version = v_new_version
        where organization_id = v_org and id = p_membership_id;
    else
        update app.organization_memberships
        set status = 'revoked',
            revoked_at = v_now,
            updated_at = v_now,
            version = v_new_version
        where organization_id = v_org and id = p_membership_id;
    end if;

    if not exists (
        select 1
        from app.organization_memberships m
        join app.users u on u.id = m.user_id
        join app.roles r
            on r.organization_id = m.organization_id and r.id = m.role_id
        where m.organization_id = v_org
            and m.status = 'active'
            and u.status = 'active'
            and r.status = 'active'
            and r.system_kind = 'admin'
            and (
                select count(distinct rp.permission_key)
                from app.role_permissions rp
                join app.permissions p
                    on p.key = rp.permission_key and p.retired_at is null
                where rp.organization_id = m.organization_id
                    and rp.role_id = r.id
                    and rp.permission_key in (
                        'staff.manage', 'roles.manage', 'organization.manage'
                    )
            ) = 3
    ) then
        raise exception 'At least one effective Admin must remain' using errcode = '23514';
    end if;

    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, v_actor_membership,
        'staff.membership.changed', 'organization_membership', p_membership_id,
        p_correlation_id, v_now,
        jsonb_build_object(
            'previous_role_id', v_target.role_id,
            'new_role_id', p_role_id,
            'previous_status', v_target.status,
            'new_status', p_status,
            'previous_version', v_target.version,
            'new_version', v_new_version
        )
    );

    membership_id := p_membership_id;
    version := v_new_version;
    return next;
    return;
end
$$;

create function app.change_role_grants_v1(
    p_role_id uuid,
    p_expected_version bigint,
    p_grant_keys text[],
    p_revoke_keys text[],
    p_audit_id uuid,
    p_correlation_id uuid
)
returns table (role_id uuid, version bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor_membership uuid;
    v_role record;
    v_grants text[];
    v_revokes text[];
    v_before text[];
    v_after text[];
    v_new_version bigint;
    v_now timestamptz;
begin
    if p_role_id is null or p_expected_version is null or p_expected_version <= 0
        or p_audit_id is null or p_correlation_id is null
        or p_grant_keys is null or p_revoke_keys is null then
        raise exception 'change_role_grants_v1 requires nonnull arguments and a positive expected version'
            using errcode = '22023';
    end if;
    if exists (select 1 from unnest(p_grant_keys) k where k is null or k = '')
        or exists (select 1 from unnest(p_revoke_keys) k where k is null or k = '') then
        raise exception 'Permission keys must be nonempty' using errcode = '22023';
    end if;

    select array_agg(distinct k order by k) into v_grants from unnest(p_grant_keys) k;
    select array_agg(distinct k order by k) into v_revokes from unnest(p_revoke_keys) k;

    if coalesce(cardinality(v_grants), 0) + coalesce(cardinality(v_revokes), 0) = 0 then
        raise exception 'At least one permission key is required' using errcode = '22023';
    end if;
    if coalesce(v_grants, '{}'::text[]) && coalesce(v_revokes, '{}'::text[]) then
        raise exception 'A key cannot appear in both grant and revoke sets' using errcode = '22023';
    end if;
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;

    perform o.id from app.organizations o where o.id = v_org for update;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    v_now := pg_catalog.clock_timestamp();

    if not app.has_permission_v1('staff.manage')
        or not app.has_permission_v1('roles.manage') then
        raise exception 'staff.manage and roles.manage permissions are required'
            using errcode = '42501';
    end if;

    perform 1 from app.organizations o where o.id = v_org and o.status = 'active';
    if not found then
        raise exception 'Organization is not active' using errcode = '42501';
    end if;

    if exists (
        select 1 from unnest(v_grants || v_revokes) k
        where not exists (select 1 from app.permissions p where p.key = k)
    ) then
        raise exception 'Unknown permission key' using errcode = '22023';
    end if;
    if exists (
        select 1 from unnest(v_grants) k
        join app.permissions p on p.key = k
        where p.retired_at is not null
    ) then
        raise exception 'Cannot grant a retired permission key' using errcode = '22023';
    end if;

    select m.id into v_actor_membership
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';

    select r.* into v_role
    from app.roles r
    where r.organization_id = v_org and r.id = p_role_id
    for update of r;
    if not found then
        raise exception 'Role not found' using errcode = 'P0002';
    end if;
    if v_role.version <> p_expected_version then
        raise exception 'Role version does not match expected version' using errcode = '40001';
    end if;

    if v_role.system_kind is distinct from 'admin'
        and coalesce(v_grants, '{}'::text[]) && array[
            'candidates.merge', 'data.export', 'privacy.manage', 'staff.manage',
            'roles.manage', 'organization.manage', 'pipelines.manage', 'audit.read'
        ] then
        raise exception 'Admin-only permissions cannot be granted to this role'
            using errcode = '42501';
    end if;
    if v_role.system_kind = 'admin'
        and coalesce(v_revokes, '{}'::text[]) && array[
            'staff.manage', 'roles.manage', 'organization.manage'
        ] then
        raise exception 'Protected Admin permissions cannot be revoked'
            using errcode = '42501';
    end if;

    select coalesce(array_agg(rp.permission_key order by rp.permission_key), '{}'::text[])
    into v_before
    from app.role_permissions rp
    where rp.organization_id = v_org and rp.role_id = p_role_id;

    insert into app.role_permissions (organization_id, role_id, permission_key, granted_by_user_id)
    select v_org, p_role_id, k, v_actor
    from unnest(coalesce(v_grants, '{}'::text[])) k
    on conflict on constraint role_permissions_pkey do nothing;

    delete from app.role_permissions rp
    where rp.organization_id = v_org and rp.role_id = p_role_id
        and rp.permission_key = any (coalesce(v_revokes, '{}'::text[]));

    select coalesce(array_agg(rp.permission_key order by rp.permission_key), '{}'::text[])
    into v_after
    from app.role_permissions rp
    where rp.organization_id = v_org and rp.role_id = p_role_id;

    v_new_version := v_role.version + 1;
    update app.roles
    set version = v_new_version, updated_at = v_now
    where organization_id = v_org and id = p_role_id;

    if not exists (
        select 1
        from app.organization_memberships m
        join app.users u on u.id = m.user_id
        join app.roles r
            on r.organization_id = m.organization_id and r.id = m.role_id
        where m.organization_id = v_org
            and m.status = 'active'
            and u.status = 'active'
            and r.status = 'active'
            and r.system_kind = 'admin'
            and (
                select count(distinct rp.permission_key)
                from app.role_permissions rp
                join app.permissions p
                    on p.key = rp.permission_key and p.retired_at is null
                where rp.organization_id = m.organization_id
                    and rp.role_id = r.id
                    and rp.permission_key in (
                        'staff.manage', 'roles.manage', 'organization.manage'
                    )
            ) = 3
    ) then
        raise exception 'At least one effective Admin must remain' using errcode = '23514';
    end if;

    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, v_actor_membership,
        'staff.role_grants.changed', 'role', p_role_id,
        p_correlation_id, v_now,
        jsonb_build_object(
            'before_keys', v_before,
            'after_keys', v_after,
            'previous_version', v_role.version,
            'new_version', v_new_version
        )
    );

    role_id := p_role_id;
    version := v_new_version;
    return next;
    return;
end
$$;

revoke all on function app.context_uuid_v1(text) from public;
revoke all on function app.has_permission_v1(text) from public;
revoke all on function app.resolve_staff_principal_v1(text, text, text, uuid) from public;
revoke all on function app.change_membership_v1(uuid, uuid, text, bigint, uuid, uuid) from public;
revoke all on function app.change_role_grants_v1(uuid, bigint, text[], text[], uuid, uuid) from public;

grant execute on function app.context_uuid_v1(text) to app_staff, app_executor, app_authz_reader;
grant execute on function app.has_permission_v1(text) to app_staff, app_executor;
grant execute on function app.resolve_staff_principal_v1(text, text, text, uuid) to app_staff;
grant execute on function app.change_membership_v1(uuid, uuid, text, bigint, uuid, uuid) to app_staff;
grant execute on function app.change_role_grants_v1(uuid, bigint, text[], text[], uuid, uuid) to app_staff;

create policy authz_reader_organizations on app.organizations
    for select to app_authz_reader
    using (id = app.context_uuid_v1('app.organization_id'));

create policy authz_reader_users on app.users
    for select to app_authz_reader
    using (id = app.context_uuid_v1('app.actor_id'));

create policy authz_reader_memberships on app.organization_memberships
    for select to app_authz_reader
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and user_id = app.context_uuid_v1('app.actor_id'));

create policy authz_reader_roles on app.roles
    for select to app_authz_reader
    using (organization_id = app.context_uuid_v1('app.organization_id'));

create policy authz_reader_role_permissions on app.role_permissions
    for select to app_authz_reader
    using (organization_id = app.context_uuid_v1('app.organization_id'));

create policy authz_reader_permissions on app.permissions
    for select to app_authz_reader
    using (retired_at is null);

create policy authz_reader_identities on app.auth_identities
    for select to app_authz_reader
    using (provider = pg_catalog.current_setting('app.identity_provider', true)
        and issuer = pg_catalog.current_setting('app.identity_issuer', true)
        and provider_subject = pg_catalog.current_setting('app.identity_subject', true)
        and revoked_at is null);

create policy executor_organizations_select on app.organizations
    for select to app_executor
    using (id = app.context_uuid_v1('app.organization_id'));

create policy executor_organizations_update on app.organizations
    for update to app_executor
    using (id = app.context_uuid_v1('app.organization_id'))
    with check (id = app.context_uuid_v1('app.organization_id'));

create policy executor_users_select on app.users
    for select to app_executor
    using (exists (
        select 1 from app.organization_memberships m
        where m.user_id = users.id
            and m.organization_id = app.context_uuid_v1('app.organization_id')
    ));

create policy executor_identities_select on app.auth_identities
    for select to app_executor
    using (exists (
        select 1 from app.organization_memberships m
        where m.user_id = auth_identities.user_id
            and m.organization_id = app.context_uuid_v1('app.organization_id')
    ));

create policy executor_memberships_select on app.organization_memberships
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id'));

create policy executor_memberships_update on app.organization_memberships
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id'))
    with check (organization_id = app.context_uuid_v1('app.organization_id'));

create policy executor_roles_select on app.roles
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id'));

create policy executor_roles_update on app.roles
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id'))
    with check (organization_id = app.context_uuid_v1('app.organization_id'));

create policy executor_role_permissions_select on app.role_permissions
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id'));

create policy executor_role_permissions_insert on app.role_permissions
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id'));

create policy executor_role_permissions_delete on app.role_permissions
    for delete to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id'));

create policy executor_permissions_select on app.permissions
    for select to app_executor
    using (true);

create policy executor_audit_insert on app.audit_events
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and actor_kind = 'staff'
        and actor_user_id = app.context_uuid_v1('app.actor_id')
        and exists (
            select 1 from app.organization_memberships m
            where m.organization_id = audit_events.organization_id
                and m.id = audit_events.actor_membership_id
                and m.user_id = audit_events.actor_user_id
        ));

reset role;

alter function app.has_permission_v1(text) owner to app_authz_reader;
alter function app.resolve_staff_principal_v1(text, text, text, uuid) owner to app_authz_reader;
alter function app.change_membership_v1(uuid, uuid, text, bigint, uuid, uuid) owner to app_executor;
alter function app.change_role_grants_v1(uuid, bigint, text[], text[], uuid, uuid) owner to app_executor;

set local role app_owner;

revoke create on schema app from app_executor, app_authz_reader;

commit;
