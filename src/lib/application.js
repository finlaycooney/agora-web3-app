import { z } from 'zod';

export const MAX_CV_SIZE_BYTES = 4 * 1024 * 1024;
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const CV_ACCEPT_ATTRIBUTE = `.pdf,.docx,application/pdf,${DOCX_MIME_TYPE}`;
export const APPLICATION_REFERENCE_PATTERN = /^AG-[A-F0-9]{12}$/;

const MAX_NAME_LENGTH = 120;
const MAX_URL_LENGTH = 2048;
const MAX_ACHIEVEMENT_LENGTH = 2000;

const error = (code, message) => ({ ok: false, code, message });

const textValue = (formData, name) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
};

export function isApplicationReference(value) {
    return typeof value === 'string' && APPLICATION_REFERENCE_PATTERN.test(value);
}

export function normalizeProfessionalUrl(value) {
    const input = value.trim();
    if (!input) {
        return { ok: true, value: '' };
    }

    if (input.includes('\\')) {
        return error('INVALID_URL', 'Enter a valid professional URL.');
    }

    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
    const candidate = hasScheme ? input : `https://${input}`;

    try {
        const url = new URL(candidate);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
            return error('INVALID_URL', 'Use a valid HTTP or HTTPS professional URL.');
        }
        if (url.username || url.password) {
            return error('INVALID_URL', 'Professional URLs cannot contain credentials.');
        }

        return { ok: true, value: url.href };
    } catch {
        return error('INVALID_URL', 'Enter a valid professional URL.');
    }
}

const professionalUrlSchema = z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, 'The professional URL is too long.')
    .transform((value, context) => {
        const result = normalizeProfessionalUrl(value);
        if (!result.ok) {
            context.addIssue({ code: 'custom', message: result.message });
            return z.NEVER;
        }
        return result.value;
    });

export const applicationSchema = z.object({
    jobId: z.string().trim().min(1, 'Please select a valid open position.'),
    fullName: z.string().trim().min(2, 'Enter your full name.').max(MAX_NAME_LENGTH, 'Enter your full name.'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254, 'Enter a valid email address.'),
    professionalUrl: professionalUrlSchema,
    technicalAchievement: z
        .string()
        .trim()
        .max(MAX_ACHIEVEMENT_LENGTH, `Keep the technical achievement under ${MAX_ACHIEVEMENT_LENGTH} characters.`),
});

const fieldErrorCodes = {
    jobId: 'INVALID_JOB',
    fullName: 'INVALID_NAME',
    email: 'INVALID_EMAIL',
    professionalUrl: 'INVALID_URL',
    technicalAchievement: 'ACHIEVEMENT_TOO_LONG',
};

export function readApplicationFields(formData) {
    return {
        jobId: textValue(formData, 'jobId'),
        fullName: textValue(formData, 'fullName'),
        email: textValue(formData, 'email'),
        professionalUrl: textValue(formData, 'professionalUrl'),
        technicalAchievement: textValue(formData, 'technicalAchievement'),
    };
}

export function validateApplicationFields(fields, jobs) {
    const parsed = applicationSchema.safeParse(fields);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const fieldName = issue.path[0];
        return error(fieldErrorCodes[fieldName] || 'INVALID_APPLICATION', issue.message);
    }

    const job = jobs.find((candidate) => candidate.id === parsed.data.jobId);
    if (!job) {
        return error('INVALID_JOB', 'Please select a valid open position.');
    }

    return { ok: true, job, fields: parsed.data };
}

export function validateCvFileMetadata(file) {
    if (!file || file.size === 0) {
        return error('MISSING_CV', 'Attach your CV as a PDF or DOCX file.');
    }

    if (file.size > MAX_CV_SIZE_BYTES) {
        return error('FILE_TOO_LARGE', 'The CV must be 4 MB or smaller.');
    }

    const extension = file.name?.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx'].includes(extension)) {
        return error('INVALID_FILE_TYPE', 'Only PDF and DOCX CVs are accepted.');
    }

    return { ok: true, file };
}
