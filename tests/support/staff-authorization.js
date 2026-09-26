import { randomUUID } from 'node:crypto';
import { publishedPort, psql } from './foundation-docker.js';

export const AUTHZ_MIGRATION = '20260922130000_staff_authorization_core.sql';
export const GOOGLE_MIGRATION = '20260922131000_staff_google_identities.sql';
export const INVITES_MIGRATION = '20260925120000_staff_invites.sql';
export const INVITE_DOMAINS_MIGRATION = '20260925130000_staff_invite_domains.sql';
export const RUNTIME_ROLE = 'agora_authz_test';

export const AUTHZ_ID = {
    ORG_A: '9c4edd11-2571-490b-a87c-ef30b9e0a001',
    ROLE_A_ADMIN: '9c4edd11-2571-490b-a87c-ef30b9e0a011',
    ROLE_A_RECRUITER: '9c4edd11-2571-490b-a87c-ef30b9e0a012',
    ROLE_A_VIEWER: '9c4edd11-2571-490b-a87c-ef30b9e0a013',
    ORG_B: '70000000-0000-4000-8000-0000000000b2',
    ROLE_B_ADMIN: '70000000-0000-4000-8000-000000000020',
    ROLE_B_RECRUITER: '70000000-0000-4000-8000-000000000021',
    ROLE_A_CUSTOM: '70000000-0000-4000-8000-000000000022',
    ROLE_A_INACTIVE: '70000000-0000-4000-8000-000000000023',
    USER_ADMIN1: '70000000-0000-4000-8000-000000000101',
    USER_ADMIN2: '70000000-0000-4000-8000-000000000102',
    USER_RECRUITER: '70000000-0000-4000-8000-000000000103',
    USER_VIEWER: '70000000-0000-4000-8000-000000000104',
    USER_CUSTOM: '70000000-0000-4000-8000-000000000105',
    USER_INVITED: '70000000-0000-4000-8000-000000000106',
    USER_SHARED: '70000000-0000-4000-8000-000000000107',
    USER_REVOKED: '70000000-0000-4000-8000-000000000108',
    USER_DISABLED: '70000000-0000-4000-8000-000000000109',
    MEMBER_ADMIN1: '70000000-0000-4000-8000-000000000201',
    MEMBER_ADMIN2: '70000000-0000-4000-8000-000000000202',
    MEMBER_RECRUITER: '70000000-0000-4000-8000-000000000203',
    MEMBER_VIEWER: '70000000-0000-4000-8000-000000000204',
    MEMBER_CUSTOM: '70000000-0000-4000-8000-000000000205',
    MEMBER_INVITED: '70000000-0000-4000-8000-000000000206',
    MEMBER_SHARED_A: '70000000-0000-4000-8000-000000000207',
    MEMBER_SHARED_B: '70000000-0000-4000-8000-000000000208',
    MEMBER_REVOKED: '70000000-0000-4000-8000-000000000209',
    MEMBER_DISABLED: '70000000-0000-4000-8000-00000000020a',
    MEMBER_B_ADMIN: '70000000-0000-4000-8000-00000000020b',
    IDENTITY_ADMIN1: '70000000-0000-4000-8000-000000000301',
    IDENTITY_ADMIN2: '70000000-0000-4000-8000-000000000302',
    IDENTITY_RECRUITER: '70000000-0000-4000-8000-000000000303',
    IDENTITY_VIEWER: '70000000-0000-4000-8000-000000000304',
    IDENTITY_CUSTOM: '70000000-0000-4000-8000-000000000305',
    IDENTITY_INVITED: '70000000-0000-4000-8000-000000000306',
    IDENTITY_SHARED: '70000000-0000-4000-8000-000000000307',
    IDENTITY_REVOKED: '70000000-0000-4000-8000-000000000308',
    IDENTITY_DISABLED: '70000000-0000-4000-8000-000000000309',
    IDENTITY_ADMIN1_GITHUB: '70000000-0000-4000-8000-00000000030a',
};

export const SUBJECTS = {
    ADMIN1: '1001',
    ADMIN2: '1002',
    RECRUITER: '1003',
    VIEWER: '1004',
    CUSTOM: '1005',
    INVITED: '1006',
    SHARED: '1007',
    REVOKED: '1008',
    DISABLED: '1009',
    UNMAPPED: '9999',
};

export const GITHUB_ISSUER = 'https://github.com';
export const GOOGLE_ISSUER = 'https://accounts.google.com';

export const staffFixtureSql = `
insert into app.users (id, display_name, status) values
    ('${AUTHZ_ID.USER_ADMIN1}', 'Admin One', 'active'),
    ('${AUTHZ_ID.USER_ADMIN2}', 'Admin Two', 'active'),
    ('${AUTHZ_ID.USER_RECRUITER}', 'Recruiter One', 'active'),
    ('${AUTHZ_ID.USER_VIEWER}', 'Viewer One', 'active'),
    ('${AUTHZ_ID.USER_CUSTOM}', 'Custom User', 'active'),
    ('${AUTHZ_ID.USER_INVITED}', 'Invited User', 'active'),
    ('${AUTHZ_ID.USER_SHARED}', 'Shared User', 'active'),
    ('${AUTHZ_ID.USER_REVOKED}', 'Revoked User', 'active'),
    ('${AUTHZ_ID.USER_DISABLED}', 'Disabled User', 'disabled');
insert into app.organizations (id, key, name, status) values
    ('${AUTHZ_ID.ORG_B}', 'acme', 'Acme', 'active');
insert into app.roles (id, organization_id, key, name, status, system_kind) values
    ('${AUTHZ_ID.ROLE_B_ADMIN}', '${AUTHZ_ID.ORG_B}', 'admin', 'Admin', 'active', 'admin'),
    ('${AUTHZ_ID.ROLE_B_RECRUITER}', '${AUTHZ_ID.ORG_B}', 'recruiter', 'Recruiter', 'active', 'recruiter'),
    ('${AUTHZ_ID.ROLE_A_CUSTOM}', '${AUTHZ_ID.ORG_A}', 'analyst', 'Analyst', 'active', null),
    ('${AUTHZ_ID.ROLE_A_INACTIVE}', '${AUTHZ_ID.ORG_A}', 'paused', 'Paused', 'inactive', null);
insert into app.permissions (key, description, introduced_version, retired_at)
    values ('retired.key', 'Retired test permission', 1, now());
insert into app.role_permissions (organization_id, role_id, permission_key) values
    ('${AUTHZ_ID.ORG_B}', '${AUTHZ_ID.ROLE_B_ADMIN}', 'staff.manage'),
    ('${AUTHZ_ID.ORG_B}', '${AUTHZ_ID.ROLE_B_ADMIN}', 'roles.manage'),
    ('${AUTHZ_ID.ORG_B}', '${AUTHZ_ID.ROLE_B_ADMIN}', 'organization.manage'),
    ('${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.ROLE_A_CUSTOM}', 'candidates.read'),
    ('${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.ROLE_A_CUSTOM}', 'retired.key');
update app.roles set status = 'active' where id = '${AUTHZ_ID.ROLE_A_VIEWER}';
insert into app.organization_memberships (id, organization_id, user_id, role_id, status, activated_at, revoked_at) values
    ('${AUTHZ_ID.MEMBER_ADMIN1}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_ADMIN1}', '${AUTHZ_ID.ROLE_A_ADMIN}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_ADMIN2}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_ADMIN2}', '${AUTHZ_ID.ROLE_A_ADMIN}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_RECRUITER}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_RECRUITER}', '${AUTHZ_ID.ROLE_A_RECRUITER}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_VIEWER}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_VIEWER}', '${AUTHZ_ID.ROLE_A_VIEWER}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_CUSTOM}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_CUSTOM}', '${AUTHZ_ID.ROLE_A_CUSTOM}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_INVITED}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_INVITED}', '${AUTHZ_ID.ROLE_A_RECRUITER}', 'invited', null, null),
    ('${AUTHZ_ID.MEMBER_SHARED_A}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_SHARED}', '${AUTHZ_ID.ROLE_A_RECRUITER}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_SHARED_B}', '${AUTHZ_ID.ORG_B}', '${AUTHZ_ID.USER_SHARED}', '${AUTHZ_ID.ROLE_B_ADMIN}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_REVOKED}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_REVOKED}', '${AUTHZ_ID.ROLE_A_RECRUITER}', 'revoked', now(), now()),
    ('${AUTHZ_ID.MEMBER_DISABLED}', '${AUTHZ_ID.ORG_A}', '${AUTHZ_ID.USER_DISABLED}', '${AUTHZ_ID.ROLE_A_RECRUITER}', 'active', now(), null),
    ('${AUTHZ_ID.MEMBER_B_ADMIN}', '${AUTHZ_ID.ORG_B}', '${AUTHZ_ID.USER_ADMIN2}', '${AUTHZ_ID.ROLE_B_ADMIN}', 'active', now(), null);
insert into app.auth_identities (id, user_id, provider, issuer, provider_subject, verified_at, revoked_at) values
    ('${AUTHZ_ID.IDENTITY_ADMIN1}', '${AUTHZ_ID.USER_ADMIN1}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.ADMIN1}', now(), null),
    ('${AUTHZ_ID.IDENTITY_ADMIN2}', '${AUTHZ_ID.USER_ADMIN2}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.ADMIN2}', now(), null),
    ('${AUTHZ_ID.IDENTITY_RECRUITER}', '${AUTHZ_ID.USER_RECRUITER}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.RECRUITER}', now(), null),
    ('${AUTHZ_ID.IDENTITY_VIEWER}', '${AUTHZ_ID.USER_VIEWER}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.VIEWER}', now(), null),
    ('${AUTHZ_ID.IDENTITY_CUSTOM}', '${AUTHZ_ID.USER_CUSTOM}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.CUSTOM}', now(), null),
    ('${AUTHZ_ID.IDENTITY_INVITED}', '${AUTHZ_ID.USER_INVITED}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.INVITED}', now(), null),
    ('${AUTHZ_ID.IDENTITY_SHARED}', '${AUTHZ_ID.USER_SHARED}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.SHARED}', now(), null),
    ('${AUTHZ_ID.IDENTITY_REVOKED}', '${AUTHZ_ID.USER_REVOKED}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.REVOKED}', now(), now()),
    ('${AUTHZ_ID.IDENTITY_DISABLED}', '${AUTHZ_ID.USER_DISABLED}', 'google', '${GOOGLE_ISSUER}', '${SUBJECTS.DISABLED}', now(), null),
    ('${AUTHZ_ID.IDENTITY_ADMIN1_GITHUB}', '${AUTHZ_ID.USER_ADMIN1}', 'github', '${GITHUB_ISSUER}', '${SUBJECTS.ADMIN1}', now(), null);
`;

export const runtimeRoleSql = (password) => `
create role ${RUNTIME_ROLE} login password '${password}';
grant app_staff to ${RUNTIME_ROLE};
`;

export function installStaffFixture(container) {
    psql(container, staffFixtureSql);
    const password = randomUUID();
    psql(container, runtimeRoleSql(password));
    return password;
}

export function staffPoolOptions(container, password, max) {
    return {
        host: '127.0.0.1',
        port: publishedPort(container, 5432),
        user: RUNTIME_ROLE,
        password,
        database: 'postgres',
        max,
        connectionTimeoutMillis: 10_000,
    };
}
