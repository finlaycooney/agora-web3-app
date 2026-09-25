import { AUTHZ_ID, GOOGLE_ISSUER } from './staff-authorization.js';

export const WORKFLOW_MIGRATION = '20260924090000_client_job_workflows.sql';

export const WORKFLOW_FUNCTIONS = [
    'save_client_draft_v1',
    'save_client_v1',
    'create_job_draft_v1',
    'save_job_draft_v1',
    'begin_job_revision_v1',
    'duplicate_job_v1',
    'preview_job_public_v1',
    'publish_job_revision_v1',
    'get_client_v1',
    'get_job_workspace_v1',
    'get_job_publication_v1',
];

export const WORKFLOW_HELPER_FUNCTIONS = [
    'safe_url_valid_v1',
    'normalize_url_input_v1',
    'job_doc_mark_ok_v1',
    'job_doc_marks_ok_v1',
    'job_doc_content_ok_v1',
    'job_doc_node_ok_v1',
    'job_document_valid_v1',
    'job_document_text_v1',
    'location_label_valid_v1',
    'job_label_array_valid_v1',
    'job_bonuses_valid_v1',
    'social_platform_url_valid_v1',
    'client_social_links_valid_v1',
    'client_draft_fields_sanitized_v1',
    'client_fields_valid_v1',
    'client_draft_fields_valid_v1',
    'job_fields_valid_v1',
    'client_configured_v1',
    'job_revision_dto_v1',
    'job_revision_guard_v1',
    'recruitment_actor_v1',
    'recruitment_receipt_v1',
    'recruitment_record_v1',
    'job_public_projection_v1',
];

const uid = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const CJ_ID = {
    ORG_B: AUTHZ_ID.ORG_B,
    ROLE_B_ADMIN: AUTHZ_ID.ROLE_B_ADMIN,
    ROLE_B_RECRUITER: AUTHZ_ID.ROLE_B_RECRUITER,
    ROLE_B_VIEWER: uid(10),
    USER_B_REC: uid(11),
    USER_B_VIEW: uid(12),
    MEMBER_B_REC: uid(13),
    MEMBER_B_VIEW: uid(14),
    MEMBER_B_ADMIN: AUTHZ_ID.MEMBER_B_ADMIN,
    IDENTITY_B_REC: uid(15),
    IDENTITY_B_VIEW: uid(16),
    PIPELINE_B: uid(20),
    STAGE_B_1: uid(21),
    CLIENT_LEGACY_B: uid(30),
    JOB_LEGACY_B: uid(31),
    CANDIDATE_B: uid(32),
    APPLICATION_B: uid(33),
};

export const CJ_SUBJECTS = {
    ADMIN: '1002',
    RECRUITER: '2002',
    VIEWER: '2003',
};

export const clientJobFixtureSql = `
insert into app.users (id, display_name, status) values
    ('${CJ_ID.USER_B_REC}', 'Synthetic Recruiter B', 'active'),
    ('${CJ_ID.USER_B_VIEW}', 'Synthetic Viewer B', 'active');
insert into app.roles (id, organization_id, key, name, status, system_kind) values
    ('${CJ_ID.ROLE_B_VIEWER}', '${CJ_ID.ORG_B}', 'viewer', 'Viewer', 'active', null);
insert into app.role_permissions (organization_id, role_id, permission_key) values
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_ADMIN}', 'clients.read'),
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_ADMIN}', 'clients.write'),
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_ADMIN}', 'jobs.read'),
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_ADMIN}', 'jobs.write'),
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_RECRUITER}', 'clients.read'),
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_RECRUITER}', 'clients.write'),
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_RECRUITER}', 'jobs.read'),
    ('${CJ_ID.ORG_B}', '${CJ_ID.ROLE_B_RECRUITER}', 'jobs.write');
insert into app.organization_memberships
        (id, organization_id, user_id, role_id, status, activated_at) values
    ('${CJ_ID.MEMBER_B_REC}', '${CJ_ID.ORG_B}', '${CJ_ID.USER_B_REC}',
        '${CJ_ID.ROLE_B_RECRUITER}', 'active', now()),
    ('${CJ_ID.MEMBER_B_VIEW}', '${CJ_ID.ORG_B}', '${CJ_ID.USER_B_VIEW}',
        '${CJ_ID.ROLE_B_VIEWER}', 'active', now());
insert into app.auth_identities
        (id, user_id, provider, issuer, provider_subject, verified_at) values
    ('${CJ_ID.IDENTITY_B_REC}', '${CJ_ID.USER_B_REC}', 'google', '${GOOGLE_ISSUER}',
        '${CJ_SUBJECTS.RECRUITER}', now()),
    ('${CJ_ID.IDENTITY_B_VIEW}', '${CJ_ID.USER_B_VIEW}', 'google', '${GOOGLE_ISSUER}',
        '${CJ_SUBJECTS.VIEWER}', now());
insert into app.pipelines (id, organization_id, key, name, status) values
    ('${CJ_ID.PIPELINE_B}', '${CJ_ID.ORG_B}', 'default', 'Default recruitment', 'active');
insert into app.pipeline_stages
        (id, organization_id, pipeline_id, key, label, kind, position, is_initial) values
    ('${CJ_ID.STAGE_B_1}', '${CJ_ID.ORG_B}', '${CJ_ID.PIPELINE_B}',
        'review', 'Review', 'active', 0, true);
insert into app.clients (id, organization_id, name, status) values
    ('${CJ_ID.CLIENT_LEGACY_B}', '${CJ_ID.ORG_B}', 'Synthetic Legacy Client', 'active');
insert into app.jobs (id, organization_id, client_id, pipeline_id, slug, title,
        description, location_display, employment_type, publication_state,
        application_state) values
    ('${CJ_ID.JOB_LEGACY_B}', '${CJ_ID.ORG_B}', '${CJ_ID.CLIENT_LEGACY_B}',
        '${CJ_ID.PIPELINE_B}', 'legacy-synthetic-job', 'Legacy Synthetic Job',
        'Legacy description', 'Berlin', 'full_time', 'draft', 'open');
insert into app.candidates (id, organization_id, full_name, identity_state, lifecycle) values
    ('${CJ_ID.CANDIDATE_B}', '${CJ_ID.ORG_B}', 'Synthetic Candidate B',
        'established', 'active');
insert into app.applications (id, organization_id, candidate_id, job_id, pipeline_id,
        stage_id, public_reference, reference_version, received_at) values
    ('${CJ_ID.APPLICATION_B}', '${CJ_ID.ORG_B}', '${CJ_ID.CANDIDATE_B}',
        '${CJ_ID.JOB_LEGACY_B}', '${CJ_ID.PIPELINE_B}', '${CJ_ID.STAGE_B_1}',
        'AG-AAAA00000001', 1, now());
`;
