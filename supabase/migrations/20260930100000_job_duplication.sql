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
grant create on schema app to app_executor;
reset role;
set local role app_executor;

create function app.duplicate_job_v2(
    p_source_revision_id uuid, p_expected_source_version bigint, p_client_id uuid,
    p_job_id uuid, p_revision_id uuid, p_operation_id uuid, p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_result jsonb;
begin
    v_result := app.duplicate_job_v1(p_source_revision_id, p_expected_source_version,
        p_client_id, p_job_id, p_revision_id, p_operation_id, p_correlation_id);
    if not coalesce((v_result ->> 'replayed')::boolean, false) then
        update app.jobs set publicly_listed = false
        where organization_id = app.context_uuid_v1('app.organization_id') and id = p_job_id;
    end if;
    return v_result;
end
$$;

revoke all on function app.duplicate_job_v2(uuid, bigint, uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function app.duplicate_job_v2(uuid, bigint, uuid, uuid, uuid, uuid, uuid) to app_staff;

reset role;
set local role app_owner;
revoke create on schema app from app_executor;
commit;
