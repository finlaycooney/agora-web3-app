begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
declare
    role_names constant text[] := array[
        'app_owner',
        'app_staff',
        'app_intake',
        'app_worker',
        'app_executor',
        'app_authz_reader'
    ];
    role_name text;
    existing record;
begin
    if current_setting('server_version_num')::integer / 10000 <> 17 then
        raise exception 'Foundation requires PostgreSQL 17';
    end if;

    foreach role_name in array role_names loop
        select rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
        into existing
        from pg_catalog.pg_roles
        where rolname = role_name;

        if found then
            if existing.rolsuper
                or existing.rolcreaterole
                or existing.rolcreatedb
                or existing.rolcanlogin
                or existing.rolreplication
                or existing.rolbypassrls then
                raise exception 'Pre-existing role % has unexpected attributes; refusing to alter it', role_name;
            end if;
        else
            execute format(
                'create role %I nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
                role_name
            );
        end if;
    end loop;

    if exists (
        select 1
        from pg_catalog.pg_auth_members membership
        join pg_catalog.pg_roles member_role on member_role.oid = membership.member
        where member_role.rolname = any (role_names)
    ) then
        raise exception 'Foundation roles must not hold membership in any other role';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_auth_members membership
        join pg_catalog.pg_roles parent_role on parent_role.oid = membership.roleid
        join pg_catalog.pg_roles member_role on member_role.oid = membership.member
        where parent_role.rolname in ('app_owner', 'app_executor', 'app_authz_reader')
            and member_role.rolname <> session_user
    ) then
        raise exception 'Privileged foundation roles must not have grantees other than the migration operator';
    end if;

    if not (select rolsuper from pg_catalog.pg_roles where rolname = session_user) then
        execute format('grant app_owner to %I with inherit true, set true', session_user);
    end if;

    execute format('grant create on database %I to app_owner', current_database());
end
$$;

commit;
