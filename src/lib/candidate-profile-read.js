import { withStaffTransaction } from './staff-authorization.js';
import { ClientJobContractError } from './client-job-contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_PERMISSION = ['candidates.read'];

function candidateId(value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw new ClientJobContractError({ candidateId: 'Candidate ID must be a UUID.' });
    }
    return value;
}

export async function getCandidateProfile(pool, identity, organizationId, input) {
    const id = candidateId(input?.candidateId);
    return withStaffTransaction(
        pool, identity, organizationId, READ_PERMISSION, async ({ client }) => {
            const { rows } = await client.query(
                'select app.get_candidate_profile_v1($1::uuid) as result', [id]);
            return rows[0].result;
        });
}

export async function resolveCandidateRedirect(pool, identity, organizationId, id) {
    const normalizedId = candidateId(id);
    return withStaffTransaction(
        pool, identity, organizationId, READ_PERMISSION, async ({ client }) => {
            const { rows } = await client.query(
                'select app.resolve_candidate_redirect_v1($1::uuid) as target_id',
                [normalizedId]);
            return rows[0]?.target_id ?? null;
        });
}

export async function listCandidateProfiles(pool, identity, organizationId, limit = 500) {
    return withStaffTransaction(
        pool, identity, organizationId, READ_PERMISSION, async ({ client }) => {
            const { rows } = await client.query(
                'select app.list_candidate_profiles_v1(null, $1::integer) as result',
                [limit]);
            return rows[0].result;
        });
}

export async function getCandidateProfileOptions(pool, identity, organizationId) {
    return withStaffTransaction(
        pool, identity, organizationId, READ_PERMISSION, async ({ client }) => {
            const { rows } = await client.query(
                'select app.get_candidate_profile_options_v1() as result');
            return rows[0].result;
        });
}
