-- Setup requests reuse the pending credential rather than invalidating its QR.
-- No existing rows are changed by this migration; signatures/grants stay intact.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
set local role app_owner;
grant create on schema app to app_executor;
set local role app_executor;

-- An old race may have left a pending row beside an active credential.
-- Prefer the completed setup without rewriting either existing row.
create or replace function app.totp_status_v1()
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
    order by case c.status when 'active' then 0 else 1 end, c.created_at desc
    limit 1;
end
$$;

create or replace function app.totp_enroll_v1(
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
    -- The organization write lock held by totp_actor_v1 also serializes
    -- confirmations. A second setup request reuses the stored credential;
    -- a request arriving after confirmation cannot start another enrollment.
    select c.id into v_id from app.totp_credentials c
    where c.organization_id = v_org and c.user_id = v_actor
        and c.status in ('pending', 'active')
    order by case c.status when 'active' then 0 else 1 end, c.created_at desc
    limit 1;
    if found then return v_id; end if;
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

set local role app_owner;
revoke create on schema app from app_executor;
commit;
