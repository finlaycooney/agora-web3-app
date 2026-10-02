import { createHash, randomBytes } from 'node:crypto';

export const BACKUP_CODE_COUNT = 10;

export function normalizeBackupCode(value) {
    if (typeof value !== 'string' || value.length > 64) return null;
    const normalized = value.trim().replace(/[\s-]/g, '').toLowerCase();
    return /^[a-f0-9]{32}$/.test(normalized) ? normalized : null;
}

// Codes have 128 random bits; a database-only leak cannot feasibly reverse
// these credential-bound hashes. Raw codes exist only in the response/UI.
export function hashBackupCode(credentialId, value) {
    const normalized = normalizeBackupCode(value);
    if (!normalized) return null;
    return createHash('sha256').update(`agora-backup-v1\0${credentialId}\0${normalized}`).digest('hex');
}

export function generateBackupCodes(credentialId) {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
        randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g).join('-'));
    return { codes, hashes: codes.map((code) => hashBackupCode(credentialId, code)) };
}
