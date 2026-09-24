begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
    if current_setting('server_version_num')::integer / 10000 <> 17 then
        raise exception 'Foundation requires PostgreSQL 17';
    end if;

    if not (select rolsuper from pg_catalog.pg_roles where rolname = session_user) then
        execute format('grant app_owner, app_authz_reader to %I with set true, inherit false',
            session_user);
    end if;
end
$$;

set local role app_owner;

grant create on schema app to app_authz_reader;

set local role app_authz_reader;

create or replace function app.resolve_staff_principal_v1(
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

    -- Staff sign-in is Google-only. GitHub remains an applicant profile
    -- provider and must never resolve to a staff principal.
    if p_provider = 'google'
        and p_issuer = 'https://accounts.google.com'
        and p_subject ~ '^[1-9][0-9]{0,20}$'
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

revoke all on function app.resolve_staff_principal_v1(text, text, text, uuid) from public;
grant execute on function app.resolve_staff_principal_v1(text, text, text, uuid)
    to app_staff;

set local role app_owner;

revoke create on schema app from app_authz_reader;

reset role;

commit;
