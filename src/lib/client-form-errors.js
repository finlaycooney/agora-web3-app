const GENERIC_FIELD_MESSAGE = 'Check this field.';
const GENERIC_URL_MESSAGE =
    'Enter a valid web address, such as https://example.com.';
const PLATFORM_URL_MESSAGES = {
    LinkedIn: 'Use a LinkedIn link, or choose Other.',
    GitHub: 'Use a GitHub link, or choose Other.',
    'X/Twitter': 'Use an X or Twitter link, or choose Other.',
};

const urlMessage = (reason) => {
    if (reason === 'duplicate URL') {
        return 'This link is already listed.';
    }
    const platform = /^must be a (LinkedIn|GitHub|X\/Twitter) URL$/.exec(reason)?.[1];
    if (platform) return PLATFORM_URL_MESSAGES[platform];
    return GENERIC_URL_MESSAGE;
};

export function clientFieldMessage(field, reason) {
    switch (field) {
        case 'name':
            return 'Enter a client name.';
        case 'contactName':
            return 'Enter a contact name.';
        case 'contactEmail':
            return reason === 'required' || /^length must be/.test(reason)
                ? 'Enter a contact email.'
                : 'Enter a valid email address.';
        case 'telegramUsername':
            return 'Use 5–32 letters, numbers or underscores, starting with'
                + ' a letter. @ is optional.';
        case 'website':
            return GENERIC_URL_MESSAGE;
        case 'anonymousDescription':
            return 'Add a public description for this stealth client.';
        default:
            return GENERIC_FIELD_MESSAGE;
    }
}

const SOCIAL_URL = /^socialLinks\[(\d+)\]\.url$/;
const SOCIAL_PLATFORM = /^socialLinks\[(\d+)\]\.platform$/;
const SOCIAL_ROW = /^socialLinks\[(\d+)\]$/;

export function mapClientFieldErrors(fieldErrors, submittedKeys) {
    const fields = Object.create(null);
    const rows = new Map();
    let group = null;
    for (const [key, reason] of Object.entries(fieldErrors ?? {})) {
        if (typeof reason !== 'string') {
            continue;
        }
        const rowKey = (match) => submittedKeys[Number(match[1])] ?? null;
        const rowEntry = (key) => {
            const entry = rows.get(key) ?? {};
            rows.set(key, entry);
            return entry;
        };
        const urlMatch = key.match(SOCIAL_URL);
        const platformMatch = key.match(SOCIAL_PLATFORM);
        const rowMatch = key.match(SOCIAL_ROW);
        if (urlMatch) {
            const target = rowKey(urlMatch);
            if (target) {
                rowEntry(target).url ??= urlMessage(reason);
            } else {
                group ??= 'Check the social links.';
            }
        } else if (platformMatch) {
            const target = rowKey(platformMatch);
            if (target) {
                rowEntry(target).platform ??= 'Choose a platform.';
            } else {
                group ??= 'Check the social links.';
            }
        } else if (rowMatch) {
            const target = rowKey(rowMatch);
            if (target) {
                rowEntry(target).url ??= 'Check this link.';
            } else {
                group ??= 'Check the social links.';
            }
        } else if (key === 'socialLinks') {
            group ??= reason === 'at most 8 entries'
                ? 'Add up to 8 links.'
                : 'Check the social links.';
        } else {
            fields[key] ??= clientFieldMessage(key, reason);
        }
    }
    return { fields, rows, group };
}
