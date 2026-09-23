import { AUTHZ_ID } from './staff-authorization.js';
import { HASH, PRIVACY_ID } from './privacy-foundation.js';

export const PRIVACY_OPS_MIGRATION = '20260923140000_privacy_operations_core.sql';

export const PRIVACY_FUNCTIONS = [
    'create_privacy_request_v1',
    'review_privacy_subject_v1',
    'verify_privacy_request_v1',
    'correct_privacy_candidate_v1',
    'restrict_privacy_subject_v1',
];

export const PRIVACY_HELPER_FUNCTIONS = [
    'privacy_actor_v1',
    'privacy_lock_request_v1',
    'privacy_record_event_v1',
];

export const privacyOpsFixtureSql = `
insert into app.role_permissions (organization_id, role_id, permission_key) values
    ('${AUTHZ_ID.ORG_B}', '${AUTHZ_ID.ROLE_B_ADMIN}', 'privacy.manage');
update app.legacy_records set
    source_sha256 = decode('${HASH.H6}', 'hex'),
    verified_by_membership_id = '${PRIVACY_ID.MEMBER_OFFICER_A}',
    verified_at = now()
where id = '${PRIVACY_ID.LR_2}';
`;
