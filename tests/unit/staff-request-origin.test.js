import assert from 'node:assert/strict';
import test from 'node:test';
import { staffRequestOriginAllowed } from '../../src/lib/staff-request-origin.js';
const request = (headers) => new Request('http://localhost:3000/api/staff/mfa/verify', { method: 'POST', headers });
test('same-origin checks use the destination Host when Next normalizes its request URL', () => {
    assert.equal(staffRequestOriginAllowed(request({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })), true);
    assert.equal(staffRequestOriginAllowed(request({ host: '127.0.0.1:3000', origin: 'http://localhost:3000' })), false);
});
test('different schemes, hosts, ports and opaque origins remain denied', () => {
    for (const origin of ['https://localhost:3000', 'http://other.test:3000', 'http://localhost:4000', 'null', 'bad']) {
        assert.equal(staffRequestOriginAllowed(request({ origin })), false);
    }
});
test('non-browser requests without an Origin remain subject to the separate session checks', () => {
    assert.equal(staffRequestOriginAllowed(request({})), true);
    assert.equal(staffRequestOriginAllowed(request({ origin: '' })), false);
    assert.equal(staffRequestOriginAllowed(request({ origin: 'http://localhost:3000' })), true);
});
