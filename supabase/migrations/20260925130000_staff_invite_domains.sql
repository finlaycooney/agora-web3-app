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

-- Organization-scoped invite domain policy. staff_invite_domains is a
-- normalized lowercase allowlist; null or empty means any verified email
-- domain may be invited. The check is a function because constraints cannot
-- unnest arrays — the same validator is reused by the setter procedure.
create function app.valid_domain_list_v1(p_domains text[])
returns boolean
language sql
immutable
set search_path = pg_catalog, app, pg_temp
as $$
    select coalesce(bool_and(
        d is not null
            and char_length(d) <= 253
            and d ~ '^[a-z0-9]+([.-][a-z0-9]+)+$'
    ), true)
    from unnest(coalesce(p_domains, '{}'::text[])) as d
$$;

alter function app.valid_domain_list_v1(text[]) owner to app_owner;
revoke all on function app.valid_domain_list_v1(text[]) from public;
grant execute on function app.valid_domain_list_v1(text[]) to app_owner, app_executor;

alter table app.organizations
    add column staff_invite_domains text[]
        check (app.valid_domain_list_v1(staff_invite_domains));

grant update (staff_invite_domains, updated_at) on app.organizations to app_executor;

-- Extend the audit action allowlist with the domain-policy change action.
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
        and pg_catalog.pg_get_constraintdef(con.oid) like '%staff.invite.claimed%';
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
        ) or (
            actor_kind = 'staff'
            and target_type = 'organization_membership'
            and target_id is not null
            and (
                (action = 'staff.member.invited'
                    and details - array['user_id', 'role_id'] = '{}'::jsonb)
                or (action = 'staff.invite.claimed'
                    and details - array['identity_id'] = '{}'::jsonb)
            )
        ) or (
            action = 'staff.invite_domains.changed'
            and target_type = 'organization'
            and actor_kind = 'staff'
            and target_id is not null
            and details - array['domains'] = '{}'::jsonb
        )
    );

-- The procedures below are owned by app_executor; create-or-replace must run
-- under that role (the operator was granted it with SET earlier). Schema
-- CREATE is needed for the new setter function — scoped to this migration.
grant create on schema app to app_executor;
set local role app_executor;

-- Invite-time domain enforcement: when the organization has a non-empty
-- allowlist, the invitee email's domain must appear in it.
create or replace function app.invite_staff_member_v1(
    p_user_id uuid,
    p_membership_id uuid,
    p_display_name text,
    p_email text,
    p_role_id uuid,
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
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_email text;
    v_role record;
    v_domains text[];
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    if p_user_id is null or p_membership_id is null or p_role_id is null
        or p_audit_id is null or p_correlation_id is null then
        raise exception 'invite_staff_member_v1 requires nonnull identifiers'
            using errcode = '22023';
    end if;
    v_email := lower(btrim(coalesce(p_email, '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 320 then
        raise exception 'Invalid invite email' using errcode = '22023';
    end if;
    if p_display_name is null or btrim(p_display_name) = ''
        or char_length(p_display_name) > 256 then
        raise exception 'Invalid display name' using errcode = '22023';
    end if;
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Read committed required' using errcode = '25001';
    end if;
    select o.staff_invite_domains into v_domains
    from app.organizations o where o.id = v_org for update;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    if not app.has_permission_v1('staff.manage') then
        raise exception 'staff.manage permission is required' using errcode = '42501';
    end if;
    if not exists (
        select 1 from app.organizations o where o.id = v_org and o.status = 'active'
    ) then
        raise exception 'Organization is not active' using errcode = '42501';
    end if;
    select m.id into v_member
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';
    if v_member is null then
        raise exception 'Active membership required' using errcode = '42501';
    end if;
    select r.* into v_role
    from app.roles r
    where r.organization_id = v_org and r.id = p_role_id;
    if not found then
        raise exception 'Role not found' using errcode = 'P0002';
    end if;
    if v_role.status <> 'active' or v_role.system_kind = 'viewer' then
        raise exception 'Invited role must be active and not a viewer role'
            using errcode = '42501';
    end if;
    if coalesce(cardinality(v_domains), 0) > 0
        and not (lower(split_part(v_email, '@', 2)) = any (v_domains)) then
        raise exception 'Invite email domain is not allowed for this organization'
            using errcode = '42501';
    end if;
    perform 1 from app.organization_memberships m
    where m.organization_id = v_org
        and m.status = 'invited'
        and lower(m.invited_email) = v_email;
    if found then
        raise exception 'An invite for this email is already pending'
            using errcode = '23505';
    end if;
    insert into app.users (id, display_name, status)
    values (p_user_id, btrim(p_display_name), 'active');
    insert into app.organization_memberships (
        id, organization_id, user_id, role_id, status, invited_email
    ) values (p_membership_id, v_org, p_user_id, p_role_id, 'invited', v_email);
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, v_member,
        'staff.member.invited', 'organization_membership', p_membership_id,
        p_correlation_id, v_now,
        pg_catalog.jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id)
    );
    return pg_catalog.jsonb_build_object(
        'membershipId', p_membership_id,
        'userId', p_user_id,
        'email', v_email
    );
end
$$;

-- The directory payload gains the configured domain allowlist so the members
-- screen can render it.
create or replace function app.staff_directory_v1(p_limit integer default 200)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_limit integer;
    v_domains text[];
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    select o.staff_invite_domains into v_domains
    from app.organizations o where o.id = v_org for share;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    if not app.has_permission_v1('staff.manage') then
        raise exception 'staff.manage permission is required' using errcode = '42501';
    end if;
    select m.id into v_member
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';
    if v_member is null then
        raise exception 'Active membership required' using errcode = '42501';
    end if;
    v_limit := coalesce(p_limit, 200);
    if v_limit < 1 or v_limit > 500 then
        raise exception 'Invalid list limit' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
        'members', (
            select coalesce(jsonb_agg(t.row_data order by t.created_at desc, t.id desc), '[]'::jsonb)
            from (
                select m.created_at, m.id,
                    jsonb_build_object(
                        'membershipId', m.id,
                        'userId', m.user_id,
                        'displayName', u.display_name,
                        'invitedEmail', m.invited_email,
                        'status', m.status,
                        'roleId', m.role_id,
                        'roleKey', r.key,
                        'roleName', r.name,
                        'activatedAt', m.activated_at,
                        'createdAt', m.created_at,
                        'version', m.version::text
                    ) as row_data
                from app.organization_memberships m
                join app.users u on u.id = m.user_id
                join app.roles r
                    on r.organization_id = m.organization_id and r.id = m.role_id
                where m.organization_id = v_org
                order by m.created_at desc, m.id desc
                limit v_limit
            ) t
        ),
        'roles', (
            select coalesce(jsonb_agg(t.row_data order by t.name, t.id), '[]'::jsonb)
            from (
                select r.id,
                    jsonb_build_object(
                        'id', r.id,
                        'key', r.key,
                        'name', r.name,
                        'systemKind', r.system_kind
                    ) as row_data, r.name
                from app.roles r
                where r.organization_id = v_org
                    and r.status = 'active'
                    and r.system_kind is distinct from 'viewer'
            ) t
        ),
        'inviteDomains', coalesce(to_jsonb(v_domains), '[]'::jsonb)
    );
end
$$;

-- Claim-time re-enforcement: the pending invite must still satisfy the
-- allowlist, so tightening the domains also unclaims stale invites.
create or replace function app.claim_staff_invite_v1(
    p_identity_id uuid,
    p_provider text,
    p_issuer text,
    p_subject text,
    p_email text,
    p_audit_id uuid,
    p_correlation_id uuid
)
returns table (user_id uuid, membership_id uuid, role_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_email text;
    v_domains text[];
    v_target record;
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if v_org is null then
        raise exception 'organization context required' using errcode = '42501';
    end if;
    if p_identity_id is null or p_provider is null or p_issuer is null
        or p_subject is null or p_audit_id is null or p_correlation_id is null then
        raise exception 'claim_staff_invite_v1 requires nonnull identifiers'
            using errcode = '22023';
    end if;
    if p_provider <> 'google'
        or p_issuer <> 'https://accounts.google.com'
        or p_subject !~ '^[1-9][0-9]{0,20}$' then
        raise exception 'Unsupported identity for invite claim' using errcode = '22023';
    end if;
    v_email := lower(btrim(coalesce(p_email, '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 320 then
        raise exception 'Invalid invite email' using errcode = '22023';
    end if;
    select o.staff_invite_domains into v_domains
    from app.organizations o where o.id = v_org for update;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    if not exists (
        select 1 from app.organizations o where o.id = v_org and o.status = 'active'
    ) then
        raise exception 'Organization is not active' using errcode = '42501';
    end if;
    if coalesce(cardinality(v_domains), 0) > 0
        and not (lower(split_part(v_email, '@', 2)) = any (v_domains)) then
        return;
    end if;
    select m.id, m.user_id, m.role_id, m.version into v_target
    from app.organization_memberships m
    join app.users u on u.id = m.user_id
    where m.organization_id = v_org
        and m.status = 'invited'
        and lower(m.invited_email) = v_email
        and u.status = 'active'
    for update of m;
    if not found then
        return;
    end if;
    insert into app.auth_identities (
        id, user_id, provider, issuer, provider_subject, verified_at
    ) values (p_identity_id, v_target.user_id, p_provider, p_issuer, p_subject, v_now);
    update app.organization_memberships
        set status = 'active',
            activated_at = v_now,
            updated_at = v_now,
            version = v_target.version + 1
        where organization_id = v_org and id = v_target.id;
    -- The audit row belongs to the newly activated member: the executor
    -- audit-insert policy requires actor_user_id to match the context actor.
    perform pg_catalog.set_config('app.actor_id', v_target.user_id::text, true);
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_target.user_id, v_target.id,
        'staff.invite.claimed', 'organization_membership', v_target.id,
        p_correlation_id, v_now,
        pg_catalog.jsonb_build_object('identity_id', p_identity_id)
    );
    user_id := v_target.user_id;
    membership_id := v_target.id;
    role_id := v_target.role_id;
    return next;
    return;
end
$$;

-- Replaces the organization invite-domain allowlist. An empty (or null) list
-- clears the restriction. Requires staff.manage.
create function app.set_staff_invite_domains_v1(
    p_domains text[],
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
    v_actor uuid := app.context_uuid_v1('app.actor_id');
    v_member uuid;
    v_domains text[];
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    if p_audit_id is null or p_correlation_id is null then
        raise exception 'set_staff_invite_domains_v1 requires nonnull identifiers'
            using errcode = '22023';
    end if;
    perform o.id from app.organizations o where o.id = v_org for update;
    if not found then
        raise exception 'Organization not found' using errcode = 'P0002';
    end if;
    if not app.has_permission_v1('staff.manage') then
        raise exception 'staff.manage permission is required' using errcode = '42501';
    end if;
    if not exists (
        select 1 from app.organizations o where o.id = v_org and o.status = 'active'
    ) then
        raise exception 'Organization is not active' using errcode = '42501';
    end if;
    select m.id into v_member
    from app.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_actor and m.status = 'active';
    if v_member is null then
        raise exception 'Active membership required' using errcode = '42501';
    end if;
    select coalesce(
        array_agg(distinct lower(btrim(d)) order by lower(btrim(d))),
        '{}'::text[]
    )
    into v_domains
    from unnest(coalesce(p_domains, '{}'::text[])) as d
    where btrim(d) <> '';
    if not app.valid_domain_list_v1(v_domains) then
        raise exception 'Invalid invite domain' using errcode = '22023';
    end if;
    if cardinality(v_domains) > 32 then
        raise exception 'Too many invite domains' using errcode = '22023';
    end if;
    update app.organizations
        set staff_invite_domains = nullif(v_domains, '{}'::text[]),
            version = version + 1,
            updated_at = v_now
        where id = v_org;
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', v_actor, v_member,
        'staff.invite_domains.changed', 'organization', v_org,
        p_correlation_id, v_now,
        pg_catalog.jsonb_build_object('domains', to_jsonb(v_domains))
    );
    return pg_catalog.jsonb_build_object(
        'inviteDomains', to_jsonb(v_domains)
    );
end
$$;

revoke all on function app.set_staff_invite_domains_v1(text[], uuid, uuid) from public;
grant execute on function app.set_staff_invite_domains_v1(text[], uuid, uuid) to app_staff;

set local role app_owner;
revoke create on schema app from app_executor;

commit;
