import { createHmac, randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

export function base32Decode(text) {
    const clean = String(text).replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) {
            throw new Error('Invalid base32 input');
        }
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

// 160-bit secret → 32-char base32, the de-facto standard authenticator size.
export function generateTotpSecret() {
    return base32Encode(randomBytes(20));
}

export function totpCounter(timestampMs = Date.now(), stepSeconds = 30) {
    return Math.floor(timestampMs / 1000 / stepSeconds);
}

export function totpCode(secret, counter, digits = 6) {
    const key = base32Decode(secret);
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac('sha1', key).update(message).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);
    return String(binary % 10 ** digits).padStart(digits, '0');
}

// Returns the matching counter so the caller can enforce replay monotonicity,
// or null when no code in the drift window matches.
export function matchTotpCode(secret, code, { timestampMs = Date.now(), window = 1 } = {}) {
    if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) {
        return null;
    }
    const counter = totpCounter(timestampMs);
    for (let drift = -window; drift <= window; drift += 1) {
        if (counter + drift < 0) {
            continue;
        }
        if (totpCode(secret, counter + drift) === code) {
            return counter + drift;
        }
    }
    return null;
}

export function totpUri({ secret, accountName, issuer = 'Agora' }) {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}
