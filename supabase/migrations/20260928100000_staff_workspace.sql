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

create table app.staff_tasks (
    id uuid primary key,
    organization_id uuid not null references app.organizations (id),
    owner_membership_id uuid not null,
    title text not null check (title = btrim(title) and char_length(title) between 1 and 256),
    category text not null check (category in ('review', 'interviews', 'notes')),
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version bigint not null default 1 check (version > 0),
    unique (organization_id, id),
    foreign key (organization_id, owner_membership_id)
        references app.organization_memberships (organization_id, id)
);

create index staff_tasks_owner_idx
    on app.staff_tasks (organization_id, owner_membership_id, completed_at, created_at desc, id desc);
alter table app.staff_tasks enable row level security;
alter table app.staff_tasks force row level security;
grant select, insert on app.staff_tasks to app_executor;
grant update (completed_at, updated_at, version) on app.staff_tasks to app_executor;

create policy executor_staff_tasks_select on app.staff_tasks
    for select to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('collaboration.read')
        and exists (select 1 from app.organization_memberships m
            where m.organization_id = staff_tasks.organization_id
                and m.id = staff_tasks.owner_membership_id
                and m.user_id = app.context_uuid_v1('app.actor_id') and m.status = 'active'));
create policy executor_staff_tasks_insert on app.staff_tasks
    for insert to app_executor
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('collaboration.read')
        and app.has_permission_v1('collaboration.write')
        and exists (select 1 from app.organization_memberships m
            where m.organization_id = staff_tasks.organization_id
                and m.id = staff_tasks.owner_membership_id
                and m.user_id = app.context_uuid_v1('app.actor_id') and m.status = 'active'));
create policy executor_staff_tasks_update on app.staff_tasks
    for update to app_executor
    using (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('collaboration.read')
        and app.has_permission_v1('collaboration.write')
        and exists (select 1 from app.organization_memberships m
            where m.organization_id = staff_tasks.organization_id
                and m.id = staff_tasks.owner_membership_id
                and m.user_id = app.context_uuid_v1('app.actor_id') and m.status = 'active'))
    with check (organization_id = app.context_uuid_v1('app.organization_id')
        and app.has_permission_v1('collaboration.read')
        and app.has_permission_v1('collaboration.write')
        and exists (select 1 from app.organization_memberships m
            where m.organization_id = staff_tasks.organization_id
                and m.id = staff_tasks.owner_membership_id
                and m.user_id = app.context_uuid_v1('app.actor_id') and m.status = 'active'));

do $$
declare
    v_check text;
begin
    select pg_get_expr(conbin, conrelid) into strict v_check
    from pg_catalog.pg_constraint
    where conrelid = 'app.audit_events'::regclass
        and conname = 'audit_events_action_check' and contype = 'c';
    alter table app.audit_events drop constraint audit_events_action_check;
    execute format($check$
        alter table app.audit_events add constraint audit_events_action_check check (
            (%s) or (
                actor_kind = 'staff' and target_type = 'staff_task' and target_id is not null
                and action in ('staff.task.created', 'staff.task.completed', 'staff.task.reopened')
                and details - array['previous_version', 'new_version'] = '{}'::jsonb
            )
        )
    $check$, v_check);
end
$$;

create function app.get_staff_workspace_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_candidates boolean;
    v_jobs boolean;
    v_clients boolean;
    v_applications boolean;
    v_members boolean;
    v_tasks boolean;
    v_candidate_count bigint;
    v_application_count bigint;
    v_open_roles bigint;
    v_review_count bigint;
    v_invite_count bigint;
    v_task_count bigint;
    v_clients_total bigint;
    v_clients_hiring jsonb := '[]'::jsonb;
    v_recent jsonb := '[]'::jsonb;
begin
    v_member := app.recruitment_actor_v1('{}'::text[], null, null, false);
    v_candidates := app.has_permission_v1('candidates.read');
    v_clients := app.has_permission_v1('clients.read');
    v_jobs := v_clients and app.has_permission_v1('jobs.read');
    v_applications := v_candidates and v_jobs and app.has_permission_v1('applications.read');
    v_members := app.has_permission_v1('staff.manage');
    v_tasks := app.has_permission_v1('collaboration.read');
    if v_candidates then
        select count(*) into v_candidate_count from app.candidates c
        where c.organization_id = v_org and c.lifecycle = 'active';
    end if;
    if v_applications then
        select count(*), count(*) filter (where s.is_initial and s.archived_at is null)
        into v_application_count, v_review_count
        from app.applications a
        join app.candidates c on c.organization_id = a.organization_id and c.id = a.candidate_id
        join app.jobs j on j.organization_id = a.organization_id and j.id = a.job_id
        join app.clients cl on cl.organization_id = j.organization_id and cl.id = j.client_id
        join app.pipeline_stages s on s.organization_id = a.organization_id
            and s.pipeline_id = a.pipeline_id and s.id = a.stage_id
        where a.organization_id = v_org and c.lifecycle = 'active';
        select coalesce(jsonb_agg(t.row_data order by t.received_at desc, t.id desc), '[]'::jsonb)
        into v_recent
        from (
            select a.id, a.received_at, jsonb_build_object(
                'applicationId', a.id, 'candidateId', c.id,
                'candidateName', coalesce(c.full_name, a.submitted_name, 'Unnamed candidate'),
                'jobId', j.id, 'jobTitle', j.title,
                'clientId', cl.id, 'clientName', cl.name,
                'receivedAt', a.received_at
            ) as row_data
            from app.applications a
            join app.candidates c on c.organization_id = a.organization_id and c.id = a.candidate_id
            join app.jobs j on j.organization_id = a.organization_id and j.id = a.job_id
            join app.clients cl on cl.organization_id = j.organization_id and cl.id = j.client_id
            join app.pipeline_stages s on s.organization_id = a.organization_id
                and s.pipeline_id = a.pipeline_id and s.id = a.stage_id
            where a.organization_id = v_org and c.lifecycle = 'active'
                and s.is_initial and s.archived_at is null
            order by a.received_at desc, a.id desc limit 5
        ) t;
    end if;
    if v_jobs then
        select count(*) into v_open_roles from app.jobs j
        join app.clients c on c.organization_id = j.organization_id and c.id = j.client_id
        where j.organization_id = v_org and j.publication_state = 'published'
            and j.application_state = 'open' and j.published_revision_id is not null;
        select count(*) into v_clients_total from app.clients c
        where c.organization_id = v_org and exists (
            select 1 from app.jobs j where j.organization_id = c.organization_id and j.client_id = c.id
                and j.publication_state = 'published' and j.application_state = 'open'
                and j.published_revision_id is not null
        );
        select coalesce(jsonb_agg(t.row_data order by t.open_roles desc, t.name, t.id), '[]'::jsonb)
        into v_clients_hiring
        from (
            select c.id, c.name, roles.open_roles,
                jsonb_build_object(
                    'clientId', c.id, 'name', c.name, 'isStealth', c.is_stealth,
                    'openRoles', roles.open_roles,
                    'applications', case when v_applications then (
                        select count(*) from app.applications a
                        join app.candidates ca on ca.organization_id = a.organization_id and ca.id = a.candidate_id
                        join app.jobs j on j.organization_id = a.organization_id and j.id = a.job_id
                        where a.organization_id = v_org and j.client_id = c.id and ca.lifecycle = 'active'
                    ) else null end
                ) as row_data
            from app.clients c
            cross join lateral (
                select count(*) as open_roles from app.jobs j
                where j.organization_id = c.organization_id and j.client_id = c.id
                    and j.publication_state = 'published' and j.application_state = 'open'
                    and j.published_revision_id is not null
            ) roles
            where c.organization_id = v_org and roles.open_roles > 0
            order by roles.open_roles desc, c.name, c.id limit 8
        ) t;
    end if;
    if v_members then
        select count(*) into v_invite_count from app.organization_memberships m
        where m.organization_id = v_org and m.status = 'invited';
    end if;
    if v_tasks then
        select count(*) into v_task_count from app.staff_tasks t
        where t.organization_id = v_org and t.owner_membership_id = v_member and t.completed_at is null;
    end if;
    return jsonb_build_object(
        'capabilities', jsonb_build_object(
            'candidates', v_candidates, 'applications', v_applications,
            'clients', v_clients, 'jobs', v_jobs, 'members', v_members,
            'tasks', v_tasks, 'writeTasks', v_tasks and app.has_permission_v1('collaboration.write'),
            'writeClients', v_clients and app.has_permission_v1('clients.write'),
            'writeJobs', v_jobs and app.has_permission_v1('jobs.write')
        ),
        'metrics', jsonb_build_object(
            'candidates', v_candidate_count, 'applications', v_application_count, 'openRoles', v_open_roles
        ),
        'attention', jsonb_build_object(
            'reviewApplications', v_review_count, 'pendingInvites', v_invite_count, 'openTasks', v_task_count
        ),
        'clientsHiring', v_clients_hiring, 'clientsHiringTotal', v_clients_total,
        'recentApplications', v_recent
    );
end
$$;

create function app.list_staff_tasks_v1(
    p_completed boolean default false, p_category text default null,
    p_limit integer default 20, p_offset integer default 0
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_total bigint;
    v_counts jsonb;
    v_tasks jsonb;
begin
    v_member := app.recruitment_actor_v1(array['collaboration.read'], null, null, false);
    if p_completed is null or p_limit is null or p_limit < 1 or p_limit > 100
        or p_offset is null or p_offset < 0 or p_offset > 100000
        or (p_category is not null and p_category not in ('review', 'interviews', 'notes')) then
        raise exception 'Invalid task filters' using errcode = '22023';
    end if;
    select jsonb_build_object(
        'open', count(*) filter (where t.completed_at is null),
        'completed', count(*) filter (where t.completed_at is not null),
        'all', count(*) filter (where (t.completed_at is not null) = p_completed),
        'review', count(*) filter (where (t.completed_at is not null) = p_completed and t.category = 'review'),
        'interviews', count(*) filter (where (t.completed_at is not null) = p_completed and t.category = 'interviews'),
        'notes', count(*) filter (where (t.completed_at is not null) = p_completed and t.category = 'notes')
    ), count(*) filter (where (t.completed_at is not null) = p_completed
        and (p_category is null or t.category = p_category))
    into v_counts, v_total from app.staff_tasks t
    where t.organization_id = v_org and t.owner_membership_id = v_member;
    select coalesce(jsonb_agg(t.row_data order by t.created_at desc, t.id desc), '[]'::jsonb)
    into v_tasks from (
        select t.id, t.created_at, jsonb_build_object(
            'id', t.id, 'title', t.title, 'category', t.category,
            'completedAt', t.completed_at, 'createdAt', t.created_at, 'version', t.version::text
        ) as row_data
        from app.staff_tasks t
        where t.organization_id = v_org and t.owner_membership_id = v_member
            and (t.completed_at is not null) = p_completed
            and (p_category is null or t.category = p_category)
        order by t.created_at desc, t.id desc limit p_limit offset p_offset
    ) t;
    return jsonb_build_object('tasks', v_tasks, 'total', v_total, 'counts', v_counts);
end
$$;

create function app.create_staff_task_v1(
    p_task_id uuid, p_title text, p_category text, p_audit_id uuid, p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_task app.staff_tasks;
begin
    v_member := app.recruitment_actor_v1(
        array['collaboration.read', 'collaboration.write'], p_audit_id, p_correlation_id, true);
    if p_task_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 256
        or p_category is null or p_category not in ('review', 'interviews', 'notes') then
        raise exception 'Invalid task' using errcode = '22023';
    end if;
    select t.* into v_task from app.staff_tasks t
    where t.organization_id = v_org and t.id = p_task_id and t.owner_membership_id = v_member;
    if found then
        if v_task.title <> btrim(p_title) or v_task.category <> p_category then
            raise exception 'Task identifier already used' using errcode = '23505';
        end if;
        return jsonb_build_object('id', v_task.id, 'version', v_task.version::text);
    end if;
    insert into app.staff_tasks (id, organization_id, owner_membership_id, title, category)
    values (p_task_id, v_org, v_member, btrim(p_title), p_category);
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', app.context_uuid_v1('app.actor_id'), v_member,
        'staff.task.created', 'staff_task', p_task_id, p_correlation_id, clock_timestamp(),
        jsonb_build_object('new_version', 1)
    );
    return jsonb_build_object('id', p_task_id, 'version', '1');
end
$$;

create function app.set_staff_task_completed_v1(
    p_task_id uuid, p_completed boolean, p_expected_version bigint, p_audit_id uuid, p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, app, pg_temp
as $$
declare
    v_org uuid := app.context_uuid_v1('app.organization_id');
    v_member uuid;
    v_task app.staff_tasks;
    v_now timestamptz := clock_timestamp();
begin
    v_member := app.recruitment_actor_v1(
        array['collaboration.read', 'collaboration.write'], p_audit_id, p_correlation_id, true);
    if p_task_id is null or p_completed is null or p_expected_version is null or p_expected_version < 1 then
        raise exception 'Invalid task update' using errcode = '22023';
    end if;
    select t.* into v_task from app.staff_tasks t
    where t.organization_id = v_org and t.id = p_task_id and t.owner_membership_id = v_member for update;
    if not found then
        raise exception 'Task not found' using errcode = 'P0002';
    end if;
    if v_task.version <> p_expected_version then
        raise exception 'Task changed; reload and retry' using errcode = '40001';
    end if;
    if (v_task.completed_at is not null) = p_completed then
        return jsonb_build_object('id', v_task.id, 'version', v_task.version::text);
    end if;
    update app.staff_tasks set completed_at = case when p_completed then v_now else null end,
        updated_at = v_now, version = version + 1
    where organization_id = v_org and id = p_task_id;
    insert into app.audit_events (
        id, organization_id, actor_kind, actor_user_id, actor_membership_id,
        action, target_type, target_id, correlation_id, occurred_at, details
    ) values (
        p_audit_id, v_org, 'staff', app.context_uuid_v1('app.actor_id'), v_member,
        case when p_completed then 'staff.task.completed' else 'staff.task.reopened' end,
        'staff_task', p_task_id, p_correlation_id, v_now,
        jsonb_build_object('previous_version', v_task.version, 'new_version', v_task.version + 1)
    );
    return jsonb_build_object('id', p_task_id, 'version', (v_task.version + 1)::text);
end
$$;

revoke all on function app.get_staff_workspace_v1() from public;
revoke all on function app.list_staff_tasks_v1(boolean, text, integer, integer) from public;
revoke all on function app.create_staff_task_v1(uuid, text, text, uuid, uuid) from public;
revoke all on function app.set_staff_task_completed_v1(uuid, boolean, bigint, uuid, uuid) from public;
grant execute on function app.get_staff_workspace_v1() to app_staff;
grant execute on function app.list_staff_tasks_v1(boolean, text, integer, integer) to app_staff;
grant execute on function app.create_staff_task_v1(uuid, text, text, uuid, uuid) to app_staff;
grant execute on function app.set_staff_task_completed_v1(uuid, boolean, bigint, uuid, uuid) to app_staff;
grant create on schema app to app_executor;
reset role;
set local role app_executor;

create or replace function app.list_applications_v1(
    p_job_id uuid default null,
    p_query text default null,
    p_limit integer default 500
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
    v_limit integer;
    v_query text;
begin
    if v_actor is null or v_org is null then
        raise exception 'staff actor and organization context are required'
            using errcode = '42501';
    end if;
    if not app.has_permission_v1('applications.read') then
        raise exception 'applications.read permission is required' using errcode = '42501';
    end if;
    v_limit := coalesce(p_limit, 500);
    if v_limit < 1 or v_limit > 1000 then
        raise exception 'Invalid list limit' using errcode = '22023';
    end if;
    v_query := nullif(lower(btrim(coalesce(p_query, ''))), '');
    if v_query is not null and char_length(v_query) > 200 then
        raise exception 'Invalid search query' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
        'applications', (
            select coalesce(jsonb_agg(t.row_data order by t.received_at desc, t.id desc), '[]'::jsonb)
            from (
                select a.id, a.received_at,
                    jsonb_build_object(
                        'applicationId', a.id,
                        'candidateId', a.candidate_id,
                        'candidateName', coalesce(c.full_name, a.submitted_name),
                        'jobId', a.job_id,
                        'jobTitle', j.title,
                        'clientId', j.client_id,
                        'clientName', cl.name,
                        'stageId', a.stage_id,
                        'stageKey', s.key,
                        'stageLabel', s.label,
                        'stageKind', s.kind,
                        'stageIsInitial', s.is_initial and s.archived_at is null,
                        'publicReference', a.public_reference,
                        'receivedAt', a.received_at,
                        'version', a.version::text
                    ) as row_data
                from app.applications a
                join app.candidates c
                    on c.organization_id = a.organization_id and c.id = a.candidate_id
                join app.jobs j
                    on j.organization_id = a.organization_id and j.id = a.job_id
                join app.clients cl
                    on cl.organization_id = j.organization_id and cl.id = j.client_id
                join app.pipeline_stages s
                    on s.organization_id = a.organization_id
                    and s.pipeline_id = a.pipeline_id
                    and s.id = a.stage_id
                where a.organization_id = v_org
                    and c.lifecycle = 'active'
                    and (p_job_id is null or a.job_id = p_job_id)
                    and (v_query is null or position(v_query in lower(
                        coalesce(c.full_name, '') || ' ' || coalesce(a.submitted_name, '')
                        || ' ' || j.title || ' ' || cl.name
                        || ' ' || a.public_reference)) > 0)
                order by a.received_at desc, a.id desc
                limit v_limit
            ) t
        )
    );
end
$$;

reset role;
alter function app.get_staff_workspace_v1() owner to app_executor;
alter function app.list_staff_tasks_v1(boolean, text, integer, integer) owner to app_executor;
alter function app.create_staff_task_v1(uuid, text, text, uuid, uuid) owner to app_executor;
alter function app.set_staff_task_completed_v1(uuid, boolean, bigint, uuid, uuid) owner to app_executor;
set local role app_owner;
revoke create on schema app from app_executor;
commit;
