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

insert into app.organizations (id, key, name, status)
values ('9c4edd11-2571-490b-a87c-ef30b9e0a001', 'agora', 'Agora', 'active')
on conflict (key) do nothing;

insert into app.permissions (key, description, introduced_version)
values
    ('applications.read', 'Read applications and stage history', 1),
    ('applications.stage', 'Change or reopen an application stage', 1),
    ('audit.read', 'Read minimized audit evidence', 1),
    ('candidates.merge', 'Merge confirmed duplicate candidates', 1),
    ('candidates.read', 'Read and search candidates', 1),
    ('candidates.write', 'Edit candidates, assign owners and manage current CV', 1),
    ('clients.read', 'Read clients', 1),
    ('clients.write', 'Create and edit clients', 1),
    ('collaboration.read', 'Read notes, tasks and tags', 1),
    ('collaboration.write', 'Write notes, tasks and tags', 1),
    ('data.export', 'Bulk export', 1),
    ('documents.download', 'Issue a clean document download', 1),
    ('documents.write', 'Upload documents to an established candidate', 1),
    ('duplicates.review', 'Review duplicate candidate evidence', 1),
    ('jobs.read', 'Read jobs and pipelines', 1),
    ('jobs.write', 'Draft, edit, publish and close jobs', 1),
    ('organization.manage', 'Manage organization settings', 1),
    ('pipelines.manage', 'Configure pipelines and mapped stage migration', 1),
    ('privacy.manage', 'Verified rights access, correction, restriction and erasure', 1),
    ('roles.manage', 'Manage roles and permission grants', 1),
    ('staff.manage', 'Manage staff membership and role assignment', 1)
on conflict (key) do nothing;

do $$
declare
    org_id uuid;
    new_role_id uuid;
    new_pipeline_id uuid;
begin
    select id into org_id from app.organizations where key = 'agora';
    if org_id is null or org_id <> '9c4edd11-2571-490b-a87c-ef30b9e0a001' then
        raise exception 'Organization key agora is bound to a different identity';
    end if;

    if exists (
        select 1 from app.roles r
        join (values
            ('admin', '9c4edd11-2571-490b-a87c-ef30b9e0a011'::uuid, 'admin'),
            ('recruiter', '9c4edd11-2571-490b-a87c-ef30b9e0a012'::uuid, 'recruiter'),
            ('viewer', '9c4edd11-2571-490b-a87c-ef30b9e0a013'::uuid, 'viewer')
        ) expected(key, id, system_kind) on r.key = expected.key
        where r.organization_id = org_id
            and (r.id <> expected.id or r.system_kind is distinct from expected.system_kind)
    ) then
        raise exception 'Seeded role key is bound to a different identity';
    end if;

    if exists (
        select 1 from app.pipelines
        where organization_id = org_id and key = 'default'
            and id <> '9c4edd11-2571-490b-a87c-ef30b9e0a020'::uuid
    ) then
        raise exception 'Default pipeline key is bound to a different identity';
    end if;

    insert into app.roles (id, organization_id, key, name, status, system_kind)
    values ('9c4edd11-2571-490b-a87c-ef30b9e0a011', org_id, 'admin', 'Admin', 'active', 'admin')
    on conflict (organization_id, key) do nothing
    returning id into new_role_id;

    if new_role_id is not null then
        insert into app.role_permissions (organization_id, role_id, permission_key)
        select org_id, new_role_id, grants.permission_key
        from (
            values
                ('applications.read'),
                ('applications.stage'),
                ('audit.read'),
                ('candidates.merge'),
                ('candidates.read'),
                ('candidates.write'),
                ('clients.read'),
                ('clients.write'),
                ('collaboration.read'),
                ('collaboration.write'),
                ('data.export'),
                ('documents.download'),
                ('documents.write'),
                ('duplicates.review'),
                ('jobs.read'),
                ('jobs.write'),
                ('organization.manage'),
                ('pipelines.manage'),
                ('privacy.manage'),
                ('roles.manage'),
                ('staff.manage')
        ) as grants (permission_key);
    end if;

    new_role_id := null;

    insert into app.roles (id, organization_id, key, name, status, system_kind)
    values ('9c4edd11-2571-490b-a87c-ef30b9e0a012', org_id, 'recruiter', 'Recruiter', 'active', 'recruiter')
    on conflict (organization_id, key) do nothing
    returning id into new_role_id;

    if new_role_id is not null then
        insert into app.role_permissions (organization_id, role_id, permission_key)
        select org_id, new_role_id, grants.permission_key
        from (
            values
                ('applications.read'),
                ('applications.stage'),
                ('candidates.read'),
                ('candidates.write'),
                ('clients.read'),
                ('clients.write'),
                ('collaboration.read'),
                ('collaboration.write'),
                ('documents.download'),
                ('documents.write'),
                ('duplicates.review'),
                ('jobs.read'),
                ('jobs.write')
        ) as grants (permission_key);
    end if;

    new_role_id := null;

    insert into app.roles (id, organization_id, key, name, status, system_kind)
    values ('9c4edd11-2571-490b-a87c-ef30b9e0a013', org_id, 'viewer', 'Viewer', 'inactive', 'viewer')
    on conflict (organization_id, key) do nothing
    returning id into new_role_id;

    if new_role_id is not null then
        insert into app.role_permissions (organization_id, role_id, permission_key)
        select org_id, new_role_id, grants.permission_key
        from (
            values
                ('applications.read'),
                ('candidates.read'),
                ('clients.read'),
                ('collaboration.read'),
                ('jobs.read')
        ) as grants (permission_key);
    end if;

    new_pipeline_id := null;

    insert into app.pipelines (id, organization_id, key, name, status)
    values ('9c4edd11-2571-490b-a87c-ef30b9e0a020', org_id, 'default', 'Default recruitment', 'active')
    on conflict (organization_id, key) do nothing
    returning id into new_pipeline_id;

    if new_pipeline_id is not null then
        insert into app.pipeline_stages (
            id, organization_id, pipeline_id, key, label, kind, position, is_initial
        )
        select stages.id, org_id, new_pipeline_id,
            stages.key, stages.label, stages.kind, stages.position, stages.is_initial
        from (
            values
                ('9c4edd11-2571-490b-a87c-ef30b9e0a021'::uuid, 'review', 'Review', 'active', 0, true),
                ('9c4edd11-2571-490b-a87c-ef30b9e0a022'::uuid, 'initial_screen', 'Initial screen', 'active', 1, false),
                ('9c4edd11-2571-490b-a87c-ef30b9e0a023'::uuid, 'interview', 'Interview', 'active', 2, false),
                ('9c4edd11-2571-490b-a87c-ef30b9e0a024'::uuid, 'offer', 'Offer', 'active', 3, false),
                ('9c4edd11-2571-490b-a87c-ef30b9e0a025'::uuid, 'hired', 'Hired', 'hired', 4, false),
                ('9c4edd11-2571-490b-a87c-ef30b9e0a026'::uuid, 'rejected', 'Rejected', 'rejected', 5, false)
        ) as stages (id, key, label, kind, position, is_initial);
    end if;
end
$$;

commit;
