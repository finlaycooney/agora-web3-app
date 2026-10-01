import assert from 'node:assert/strict';
import test from 'node:test';
import { cvWorkerInput, decodeCvUploadProof, cvStaffAction, TELEGRAM_CV_MAX_BYTES } from '../../src/lib/telegram-cv-contracts.js';
const id = '10000000-0000-4000-8000-000000000001';
const proof = { connectionId: id, generation: 1, connectionLeaseToken: id, accountUserId: '123' };
const upload = { ...proof, jobId: id, jobLeaseToken: id, sourceDigest: 'a'.repeat(64), sha256: 'b'.repeat(64), sizeBytes: 100 };
test('CV upload proof is canonical bounded base64url and retains precise source identity', () => {
    const header = Buffer.from(JSON.stringify(upload)).toString('base64url');
    assert.deepEqual(decodeCvUploadProof(header), upload);
    assert.throws(() => decodeCvUploadProof(`${header}=`)); assert.throws(() => decodeCvUploadProof('a'.repeat(4097)));
    assert.throws(() => cvWorkerInput('upload', { ...upload, sizeBytes: TELEGRAM_CV_MAX_BYTES + 1 }));
    assert.throws(() => cvWorkerInput('upload', { ...upload, sha256: 'x'.repeat(64) }));
    assert.throws(() => cvWorkerInput('upload', { ...upload, objectKey: 'invented' }));
});
test('retrieval is bound to document revision and explicit attachment, not profile version', () => {
    const input = { action: 'retrieve', draftId: id, expectedDocumentRevision: 0, extractionJobId: id, messageId: '2147483647', attachmentIndex: 15 };
    assert.deepEqual(cvStaffAction(input), input);
    assert.throws(() => cvStaffAction({ ...input, messageId: '2147483648' }));
    assert.throws(() => cvStaffAction({ ...input, expectedVersion: 9 }));
    assert.throws(() => cvStaffAction({ ...input, expectedDocumentRevision: -1 }));
});

test('CV storage fetch forwards a real abort signal and preserves caller cancellation', async () => {
    const { cvStorageFetch } = await import('../../src/lib/telegram-cv-storage.js');
    const previous = globalThis.fetch; let received;
    globalThis.fetch = async (_input, init) => { received = init.signal; return new Response('ok'); };
    try {
        const controller = new AbortController();
        await cvStorageFetch('https://storage.invalid/example', { signal: controller.signal });
        assert.ok(received instanceof AbortSignal); assert.equal(received.aborted, false);
        controller.abort(); assert.equal(received.aborted, true);
    } finally { globalThis.fetch = previous; }
});
