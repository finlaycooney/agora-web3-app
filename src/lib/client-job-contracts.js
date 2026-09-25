import { canonicalLocationLabel } from './location-options.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEGRAM_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MONEY_PATTERN = /^[0-9]{1,12}(\.[0-9]{1,2})?$/;
const URL_PATTERN = /^https?:\/\/[^/?#@\s]+(?:[/?#][^\s]*)?$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;

const SOCIAL_PLATFORMS = new Set(['linkedin', 'x', 'github', 'other']);
const SOCIAL_PLATFORM_NAMES = {
    linkedin: 'LinkedIn',
    x: 'X/Twitter',
    github: 'GitHub',
    other: 'other',
};
const EMPLOYMENT_TYPES = new Set(['full_time', 'part_time', 'contract', 'internship']);
const WORKPLACE_MODES = new Set(['onsite', 'hybrid', 'remote']);
const PAY_PERIODS = new Set(['year', 'month', 'day', 'hour']);
const BONUS_TYPES = new Set(['cash', 'equity', 'options', 'stock', 'token', 'other']);
const PLAIN_MARK_TYPES = new Set(['bold', 'italic', 'underline', 'strike']);
const BLOCK_TYPES = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote']);

const DOC_MAX_BYTES = 65536;
const DOC_MAX_DEPTH = 12;
const DOC_MAX_NODES = 2048;

const CLIENT_KEYS = [
    'name', 'contactName', 'contactEmail', 'telegramUsername', 'website',
    'socialLinks', 'isStealth', 'anonymousDescription',
];
const JOB_KEYS = [
    'title', 'employmentType', 'workplaceMode', 'locations', 'remoteRegions',
    'compensationMin', 'compensationMax', 'currency', 'payPeriod', 'bonuses',
    'descriptionDocument',
];

export const EMPTY_JOB_DOCUMENT = Object.freeze({
    type: 'doc',
    content: [Object.freeze({ type: 'paragraph' })],
});

export class ClientJobContractError extends Error {
    constructor(fieldErrors) {
        super('Input failed validation');
        this.name = 'ClientJobContractError';
        this.code = 'INVALID_INPUT';
        this.fieldErrors = fieldErrors;
    }
}

const isPlainObject = (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

const isSafeUrl = (value) => typeof value === 'string'
    && value.length > 0
    && value.length <= 2048
    && URL_PATTERN.test(value)
    && !CONTROL_PATTERN.test(value);

const normalizeUrlInput = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 2048) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:[/?#][^\s]*)?$/.test(trimmed)) {
        return `https://${trimmed}`;
    }
    return trimmed;
};

const urlHost = (value) => {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return null;
    }
};

const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);

const platformHostAllowed = (platform, host) => {
    if (host === null) return false;
    if (platform === 'linkedin') return hostMatches(host, 'linkedin.com');
    if (platform === 'github') return hostMatches(host, 'github.com');
    if (platform === 'x') return hostMatches(host, 'x.com') || hostMatches(host, 'twitter.com');
    return true;
};

const normalizeTelegramUsername = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return undefined;
    const stripped = value.trim().replace(/^@/, '');
    return TELEGRAM_PATTERN.test(stripped) ? stripped : undefined;
};

const normalizeOptionalText = (value, max) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return trimmed.length <= max ? trimmed : undefined;
};

const moneyCents = (value) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};

const fail = (errors, field, reason) => {
    if (errors[field] === undefined) {
        errors[field] = reason;
    }
};

const rejectUnknownKeys = (value, allowed, base, errors) => {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
            fail(errors, base ? `${base}.${key}` : key, 'unknown key');
        }
    }
};

const trimString = (value, field, { min, max }, errors, required) => {
    if (value === null || value === undefined) {
        if (required) {
            fail(errors, field, 'required');
        }
        return null;
    }
    if (typeof value !== 'string') {
        fail(errors, field, 'must be a string');
        return null;
    }
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
        fail(errors, field, `length must be ${min}..${max}`);
        return null;
    }
    return trimmed;
};

const optionalEnum = (value, field, allowed, errors) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== 'string' || !allowed.has(value)) {
        fail(errors, field, 'unsupported value');
        return null;
    }
    return value;
};

const optionalMoney = (value, field, errors) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) {
        fail(errors, field, 'must be a nonnegative decimal string with up to 12 integer and 2 fraction digits');
        return null;
    }
    return value;
};

const optionalLabelArray = (value, field, errors) => {
    if (!Array.isArray(value)) {
        fail(errors, field, 'must be an array');
        return null;
    }
    if (value.length > 20) {
        fail(errors, field, 'at most 20 entries');
        return null;
    }
    const seen = new Set();
    const out = [];
    let ok = true;
    value.forEach((entry, index) => {
        if (typeof entry !== 'string') {
            fail(errors, `${field}[${index}]`, 'must be a string');
            ok = false;
            return;
        }
        const label = canonicalLocationLabel(entry);
        if (label === null) {
            fail(errors, `${field}[${index}]`, 'select a supported location');
            ok = false;
            return;
        }
        if (seen.has(label.toLowerCase())) {
            fail(errors, `${field}[${index}]`, 'duplicate entry');
            ok = false;
            return;
        }
        seen.add(label.toLowerCase());
        out.push(label);
    });
    return ok ? out : null;
};

const normalizeMark = (mark, path) => {
    if (!isPlainObject(mark)) {
        throw new ClientJobContractError({ descriptionDocument: `${path} must be an object` });
    }
    const keys = Object.keys(mark);
    if (PLAIN_MARK_TYPES.has(mark.type)) {
        if (!keys.every((k) => k === 'type')) {
            throw new ClientJobContractError({ descriptionDocument: `${path} has unknown keys` });
        }
        return { type: mark.type };
    }
    if (mark.type === 'link') {
        if (!keys.every((k) => k === 'type' || k === 'attrs')) {
            throw new ClientJobContractError({ descriptionDocument: `${path} has unknown keys` });
        }
        if (mark.attrs === undefined) {
            throw new ClientJobContractError({ descriptionDocument: `${path} requires an href` });
        }
        if (!isPlainObject(mark.attrs)) {
            throw new ClientJobContractError({ descriptionDocument: `${path}.attrs must be an object` });
        }
        const attrKeys = Object.keys(mark.attrs);
        if (!attrKeys.every((k) => ['href', 'target', 'rel', 'class'].includes(k))) {
            throw new ClientJobContractError({ descriptionDocument: `${path}.attrs has unknown keys` });
        }
        if (!isSafeUrl(mark.attrs.href)) {
            throw new ClientJobContractError({ descriptionDocument: `${path}.attrs.href must be a safe http(s) URL` });
        }
        return { type: 'link', attrs: { href: mark.attrs.href } };
    }
    throw new ClientJobContractError({ descriptionDocument: `${path} has an unsupported mark type` });
};

const normalizeMarks = (value, path) => {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new ClientJobContractError({ descriptionDocument: `${path}.marks must be an array` });
    }
    const seen = new Set();
    const out = [];
    value.forEach((mark, index) => {
        const normalized = normalizeMark(mark, `${path}.marks[${index}]`);
        if (seen.has(normalized.type)) {
            throw new ClientJobContractError({ descriptionDocument: `${path}.marks[${index}] duplicates a mark` });
        }
        seen.add(normalized.type);
        out.push(normalized);
    });
    return out;
};

const normalizeNode = (node, parentType, depth, state, path) => {
    if (depth > DOC_MAX_DEPTH) {
        throw new ClientJobContractError({ descriptionDocument: `${path} exceeds the depth limit` });
    }
    if (!isPlainObject(node)) {
        throw new ClientJobContractError({ descriptionDocument: `${path} must be an object` });
    }
    state.nodes += 1;
    if (state.nodes > DOC_MAX_NODES) {
        throw new ClientJobContractError({ descriptionDocument: 'document exceeds the node limit' });
    }
    const keys = Object.keys(node);
    const onlyKeys = (allowed) => {
        if (!keys.includes('type') || !keys.every((k) => allowed.includes(k))) {
            throw new ClientJobContractError({ descriptionDocument: `${path} has unknown keys` });
        }
    };
    const normalizeChildren = (allowedTypes, { requireFirst, allowEmpty } = {}) => {
        const content = node.content;
        if (content === undefined) {
            if (allowEmpty) {
                return undefined;
            }
            throw new ClientJobContractError({ descriptionDocument: `${path}.content is required` });
        }
        if (!Array.isArray(content)) {
            throw new ClientJobContractError({ descriptionDocument: `${path}.content must be an array` });
        }
        if (content.length === 0) {
            if (allowEmpty) {
                return [];
            }
            throw new ClientJobContractError({ descriptionDocument: `${path}.content must be nonempty` });
        }
        const out = content.map((child, index) => {
            const childNode = normalizeNode(child, node.type, depth + 1, state, `${path}.content[${index}]`);
            if (!allowedTypes.includes(childNode.type)) {
                throw new ClientJobContractError({ descriptionDocument: `${path}.content[${index}] is not allowed here` });
            }
            return childNode;
        });
        if (requireFirst && out[0].type !== requireFirst) {
            throw new ClientJobContractError({ descriptionDocument: `${path}.content[0] must be a paragraph` });
        }
        return out;
    };

    switch (node.type) {
        case 'doc': {
            if (parentType !== null) {
                throw new ClientJobContractError({ descriptionDocument: `${path} must be the root` });
            }
            onlyKeys(['type', 'content']);
            return { type: 'doc', content: normalizeChildren([...BLOCK_TYPES]) };
        }
        case 'paragraph': {
            if (!['doc', 'listItem', 'blockquote'].includes(parentType)) {
                throw new ClientJobContractError({ descriptionDocument: `${path} is not allowed here` });
            }
            onlyKeys(['type', 'content']);
            const content = normalizeChildren(['text', 'hardBreak'], { allowEmpty: true });
            return content === undefined ? { type: 'paragraph' } : { type: 'paragraph', content };
        }
        case 'heading': {
            if (!['doc', 'listItem', 'blockquote'].includes(parentType)) {
                throw new ClientJobContractError({ descriptionDocument: `${path} is not allowed here` });
            }
            onlyKeys(['type', 'content', 'attrs']);
            if (!isPlainObject(node.attrs)) {
                throw new ClientJobContractError({ descriptionDocument: `${path}.attrs must be an object` });
            }
            if (!Object.keys(node.attrs).every((k) => k === 'level')
                || !Number.isInteger(node.attrs.level)
                || node.attrs.level < 2 || node.attrs.level > 3) {
                throw new ClientJobContractError({ descriptionDocument: `${path}.attrs.level must be 2 or 3` });
            }
            const content = normalizeChildren(['text', 'hardBreak'], { allowEmpty: true });
            const out = { type: 'heading', attrs: { level: node.attrs.level } };
            if (content !== undefined) {
                out.content = content;
            }
            return out;
        }
        case 'bulletList':
        case 'orderedList': {
            if (!['doc', 'listItem', 'blockquote'].includes(parentType)) {
                throw new ClientJobContractError({ descriptionDocument: `${path} is not allowed here` });
            }
            onlyKeys(['type', 'content', 'attrs']);
            const content = normalizeChildren(['listItem']);
            const out = { type: node.type };
            if (node.attrs !== undefined) {
                if (!isPlainObject(node.attrs)) {
                    throw new ClientJobContractError({ descriptionDocument: `${path}.attrs must be an object` });
                }
                if (node.type === 'orderedList') {
                    if (!Object.keys(node.attrs).every((k) => k === 'start')
                        || node.attrs.start === undefined
                        || !Number.isInteger(node.attrs.start)
                        || node.attrs.start < 1 || node.attrs.start > 10000) {
                        throw new ClientJobContractError({ descriptionDocument: `${path}.attrs.start must be an integer 1..10000` });
                    }
                    out.attrs = { start: node.attrs.start };
                } else if (Object.keys(node.attrs).length > 0) {
                    throw new ClientJobContractError({ descriptionDocument: `${path}.attrs has unknown keys` });
                }
            }
            out.content = content;
            return out;
        }
        case 'listItem': {
            if (!['bulletList', 'orderedList'].includes(parentType)) {
                throw new ClientJobContractError({ descriptionDocument: `${path} is not allowed here` });
            }
            onlyKeys(['type', 'content']);
            return {
                type: 'listItem',
                content: normalizeChildren([...BLOCK_TYPES], { requireFirst: 'paragraph' }),
            };
        }
        case 'blockquote': {
            if (!['doc', 'listItem'].includes(parentType)) {
                throw new ClientJobContractError({ descriptionDocument: `${path} is not allowed here` });
            }
            onlyKeys(['type', 'content']);
            return { type: 'blockquote', content: normalizeChildren([...BLOCK_TYPES]) };
        }
        case 'text': {
            if (!['paragraph', 'heading'].includes(parentType)) {
                throw new ClientJobContractError({ descriptionDocument: `${path} is not allowed here` });
            }
            onlyKeys(['type', 'text', 'marks']);
            if (typeof node.text !== 'string' || node.text.length === 0) {
                throw new ClientJobContractError({ descriptionDocument: `${path}.text must be a nonempty string` });
            }
            const out = { type: 'text', text: node.text };
            const marks = normalizeMarks(node.marks, path);
            if (marks !== undefined && marks.length > 0) {
                out.marks = marks;
            }
            return out;
        }
        case 'hardBreak': {
            if (!['paragraph', 'heading'].includes(parentType)) {
                throw new ClientJobContractError({ descriptionDocument: `${path} is not allowed here` });
            }
            onlyKeys(['type']);
            return { type: 'hardBreak' };
        }
        default:
            throw new ClientJobContractError({ descriptionDocument: `${path} has an unsupported node type` });
    }
};

export function normalizeJobDocument(value) {
    if (!isPlainObject(value)) {
        throw new ClientJobContractError({ descriptionDocument: 'must be an object' });
    }
    let serialized;
    try {
        serialized = JSON.stringify(value);
    } catch {
        throw new ClientJobContractError({ descriptionDocument: 'must be serializable' });
    }
    if (new TextEncoder().encode(serialized).length > DOC_MAX_BYTES) {
        throw new ClientJobContractError({ descriptionDocument: 'exceeds the 64 KiB limit' });
    }
    const state = { nodes: 0 };
    return normalizeNode(value, null, 0, state, 'descriptionDocument');
}

export function jobDocumentText(value) {
    const canonical = normalizeJobDocument(value);
    const textOf = (node) => {
        if (node.type === 'text') {
            return node.text;
        }
        if (node.type === 'hardBreak') {
            return '\n';
        }
        const parts = (node.content ?? []).map(textOf);
        if (node.type === 'paragraph' || node.type === 'heading') {
            return parts.join('');
        }
        return parts.join('\n');
    };
    return textOf(canonical);
}

export function validateClientInput(value) {
    const errors = Object.create(null);
    if (!isPlainObject(value)) {
        throw new ClientJobContractError({ fields: 'must be an object' });
    }
    rejectUnknownKeys(value, CLIENT_KEYS, '', errors);
    for (const key of CLIENT_KEYS) {
        if (!(key in value)) {
            fail(errors, key, 'required');
        }
    }
    if (Object.keys(errors).length > 0) {
        throw new ClientJobContractError(errors);
    }

    const name = trimString(value.name, 'name', { min: 1, max: 256 }, errors, true);
    const contactName = trimString(value.contactName, 'contactName', { min: 1, max: 256 }, errors, true);
    const contactEmail = trimString(value.contactEmail, 'contactEmail', { min: 1, max: 254 }, errors, true);
    if (contactEmail !== null && !EMAIL_PATTERN.test(contactEmail)) {
        fail(errors, 'contactEmail', 'must be a simple email address');
    }

    let telegramUsername = null;
    if (value.telegramUsername !== null && value.telegramUsername !== undefined) {
        if (typeof value.telegramUsername !== 'string') {
            fail(errors, 'telegramUsername', 'must be a string or null');
        } else {
            const stripped = value.telegramUsername.trim().replace(/^@/, '');
            if (!TELEGRAM_PATTERN.test(stripped)) {
                fail(errors, 'telegramUsername', 'must be a valid Telegram username');
            } else {
                telegramUsername = stripped;
            }
        }
    }

    const websiteInput = normalizeOptionalText(value.website, 2048);
    const website = websiteInput === undefined ? null : normalizeUrlInput(websiteInput);
    if (websiteInput === undefined || (website !== null && !isSafeUrl(website))) {
        fail(errors, 'website', 'must be a valid website URL');
    }

    let socialLinks = null;
    if (!Array.isArray(value.socialLinks)) {
        fail(errors, 'socialLinks', 'must be an array');
    } else if (value.socialLinks.length > 8) {
        fail(errors, 'socialLinks', 'at most 8 entries');
    } else {
        const seen = new Set();
        socialLinks = [];
        value.socialLinks.forEach((entry, index) => {
            const path = `socialLinks[${index}]`;
            if (!isPlainObject(entry)) {
                fail(errors, path, 'must be an object');
                return;
            }
            rejectUnknownKeys(entry, ['platform', 'url'], path, errors);
            const platform = typeof entry.platform === 'string' ? entry.platform : null;
            if (platform === null || !SOCIAL_PLATFORMS.has(platform)) {
                fail(errors, `${path}.platform`, 'unsupported platform');
            }
            const url = normalizeUrlInput(entry.url);
            if (url === null || !isSafeUrl(url)) {
                fail(errors, `${path}.url`, 'must be a valid URL');
            } else if (platform !== null && !platformHostAllowed(platform, urlHost(url))) {
                fail(errors, `${path}.url`, `must be a ${SOCIAL_PLATFORM_NAMES[platform]} URL`);
            } else if (seen.has(url.toLowerCase())) {
                fail(errors, `${path}.url`, 'duplicate URL');
            } else {
                seen.add(url.toLowerCase());
            }
            if (errors[path] === undefined
                && errors[`${path}.platform`] === undefined
                && errors[`${path}.url`] === undefined) {
                socialLinks.push({ platform, url });
            }
        });
    }

    if (typeof value.isStealth !== 'boolean') {
        fail(errors, 'isStealth', 'must be a boolean');
    }
    const anonymousDescription = trimString(
        value.anonymousDescription, 'anonymousDescription', { min: 1, max: 4000 }, errors, false,
    );
    if (value.isStealth === true && anonymousDescription === null
        && errors.anonymousDescription === undefined) {
        fail(errors, 'anonymousDescription', 'required for a stealth client');
    }

    if (Object.keys(errors).length > 0) {
        throw new ClientJobContractError(errors);
    }
    return {
        name,
        contactName,
        contactEmail,
        telegramUsername,
        website,
        socialLinks,
        isStealth: value.isStealth,
        anonymousDescription,
    };
}

export function validateClientDraftInput(value) {
    const errors = Object.create(null);
    if (!isPlainObject(value)) {
        throw new ClientJobContractError({ fields: 'must be an object' });
    }
    rejectUnknownKeys(value, CLIENT_KEYS, '', errors);
    for (const key of CLIENT_KEYS) {
        if (!(key in value)) {
            fail(errors, key, 'required');
        }
    }
    if (Object.keys(errors).length > 0) {
        throw new ClientJobContractError(errors);
    }

    const name = trimString(value.name, 'name', { min: 1, max: 256 }, errors, true);
    if (Object.keys(errors).length > 0) {
        throw new ClientJobContractError(errors);
    }

    const contactName = normalizeOptionalText(value.contactName, 256) ?? null;
    const email = normalizeOptionalText(value.contactEmail, 254);
    const contactEmail = email !== undefined && EMAIL_PATTERN.test(email) ? email : null;
    const telegramUsername = normalizeTelegramUsername(value.telegramUsername) ?? null;
    const websiteText = normalizeOptionalText(value.website, 2048);
    const websiteValue = websiteText === undefined ? undefined : normalizeUrlInput(websiteText);
    const website = websiteValue !== undefined && websiteValue !== null && isSafeUrl(websiteValue)
        ? websiteValue
        : null;

    const socialLinks = [];
    const seen = new Set();
    if (Array.isArray(value.socialLinks)) {
        for (const entry of value.socialLinks) {
            if (socialLinks.length >= 8 || !isPlainObject(entry)
                || !Object.keys(entry).every((key) => ['platform', 'url'].includes(key))) {
                continue;
            }
            const platform = entry.platform;
            if (typeof platform !== 'string' || !SOCIAL_PLATFORMS.has(platform)) continue;
            const url = normalizeUrlInput(entry.url);
            if (url === null || !isSafeUrl(url)
                || !platformHostAllowed(platform, urlHost(url))
                || seen.has(url.toLowerCase())) {
                continue;
            }
            seen.add(url.toLowerCase());
            socialLinks.push({ platform, url });
        }
    }

    return {
        name,
        contactName,
        contactEmail,
        telegramUsername,
        website,
        socialLinks,
        isStealth: typeof value.isStealth === 'boolean' ? value.isStealth : null,
        anonymousDescription: normalizeOptionalText(value.anonymousDescription, 4000) ?? null,
    };
}

const validateJobShape = (value) => {
    const errors = Object.create(null);
    if (!isPlainObject(value)) {
        throw new ClientJobContractError({ fields: 'must be an object' });
    }
    rejectUnknownKeys(value, JOB_KEYS, '', errors);
    for (const key of JOB_KEYS) {
        if (!(key in value)) {
            fail(errors, key, 'required');
        }
    }
    if (Object.keys(errors).length > 0) {
        throw new ClientJobContractError(errors);
    }

    const title = trimString(value.title, 'title', { min: 1, max: 200 }, errors, true);
    const employmentType = optionalEnum(value.employmentType, 'employmentType', EMPLOYMENT_TYPES, errors);
    const workplaceMode = optionalEnum(value.workplaceMode, 'workplaceMode', WORKPLACE_MODES, errors);
    const locations = optionalLabelArray(value.locations, 'locations', errors);
    const remoteRegions = optionalLabelArray(value.remoteRegions, 'remoteRegions', errors);
    const compensationMin = optionalMoney(value.compensationMin, 'compensationMin', errors);
    const compensationMax = optionalMoney(value.compensationMax, 'compensationMax', errors);
    if (compensationMin !== null && compensationMax !== null
        && moneyCents(compensationMax) < moneyCents(compensationMin)) {
        fail(errors, 'compensationMax', 'must be greater than or equal to compensationMin');
    }
    let currency = null;
    if (value.currency !== null && value.currency !== undefined) {
        if (typeof value.currency !== 'string' || !CURRENCY_PATTERN.test(value.currency)) {
            fail(errors, 'currency', 'must be three uppercase letters');
        } else {
            currency = value.currency;
        }
    }
    const payPeriod = optionalEnum(value.payPeriod, 'payPeriod', PAY_PERIODS, errors);

    let bonuses = null;
    if (!Array.isArray(value.bonuses)) {
        fail(errors, 'bonuses', 'must be an array');
    } else if (value.bonuses.length > 5) {
        fail(errors, 'bonuses', 'at most 5 entries');
    } else {
        const seenTypes = new Set();
        bonuses = [];
        value.bonuses.forEach((entry, index) => {
            const path = `bonuses[${index}]`;
            if (!isPlainObject(entry)) {
                fail(errors, path, 'must be an object');
                return;
            }
            rejectUnknownKeys(entry, ['type', 'details'], path, errors);
            if (typeof entry.type !== 'string' || !BONUS_TYPES.has(entry.type)) {
                fail(errors, `${path}.type`, 'unsupported type');
            } else if (seenTypes.has(entry.type)) {
                fail(errors, `${path}.type`, 'duplicate type');
            } else {
                seenTypes.add(entry.type);
            }
            const details = typeof entry.details === 'string' ? entry.details.trim() : entry.details;
            if (typeof details !== 'string' || details.length < 1 || details.length > 2000) {
                fail(errors, `${path}.details`, 'length must be 1..2000');
            }
            if (errors[path] === undefined
                && errors[`${path}.type`] === undefined
                && errors[`${path}.details`] === undefined) {
                bonuses.push({ type: entry.type, details });
            }
        });
    }

    let descriptionDocument = null;
    let descriptionText = '';
    try {
        descriptionDocument = normalizeJobDocument(value.descriptionDocument);
        descriptionText = jobDocumentText(descriptionDocument);
    } catch (error) {
        if (error instanceof ClientJobContractError) {
            Object.assign(errors, error.fieldErrors);
        } else {
            throw error;
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new ClientJobContractError(errors);
    }
    return {
        canonical: {
            title,
            employmentType,
            workplaceMode,
            locations,
            remoteRegions,
            compensationMin,
            compensationMax,
            currency: currency ?? null,
            payPeriod,
            bonuses,
            descriptionDocument,
        },
        descriptionText,
    };
};

export function validateJobDraftInput(value) {
    return validateJobShape(value).canonical;
}

export function validateJobReadyInput(value) {
    const errors = Object.create(null);
    const { canonical, descriptionText } = validateJobShape(value);
    if (canonical.employmentType === null) {
        fail(errors, 'employmentType', 'required to publish');
    }
    if (canonical.workplaceMode === null) {
        fail(errors, 'workplaceMode', 'required to publish');
    }
    if (canonical.compensationMin === null || canonical.compensationMax === null) {
        fail(errors, 'compensationMin', 'both amounts are required to publish');
    }
    if (canonical.currency === null) {
        fail(errors, 'currency', 'required to publish');
    }
    if (canonical.payPeriod === null) {
        fail(errors, 'payPeriod', 'required to publish');
    }
    if (canonical.workplaceMode === 'onsite' || canonical.workplaceMode === 'hybrid') {
        if (canonical.locations.length === 0) {
            fail(errors, 'locations', 'required for onsite or hybrid jobs');
        }
    }
    if (canonical.workplaceMode === 'remote' && canonical.remoteRegions.length === 0) {
        fail(errors, 'remoteRegions', 'required for remote jobs');
    }
    if (canonical.workplaceMode === 'onsite' && canonical.remoteRegions.length > 0) {
        fail(errors, 'remoteRegions', 'must be empty for onsite jobs');
    }
    const plain = descriptionText.trim();
    if (plain.length === 0 || plain.length > 30000) {
        fail(errors, 'descriptionDocument', 'plain text must be nonempty and at most 30000 characters');
    }
    if (Object.keys(errors).length > 0) {
        throw new ClientJobContractError(errors);
    }
    return canonical;
}
