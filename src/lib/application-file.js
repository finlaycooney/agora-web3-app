import { fileTypeFromBuffer } from 'file-type';
import { DOCX_MIME_TYPE, MAX_CV_SIZE_BYTES } from './application.js';

const acceptedTypes = new Map([
    ['pdf', 'application/pdf'],
    ['docx', DOCX_MIME_TYPE],
]);

const error = (code, message) => ({ ok: false, code, message });

export async function validateCvFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) {
        return error('MISSING_CV', 'Attach your CV as a PDF or DOCX file.');
    }

    if (file.size > MAX_CV_SIZE_BYTES) {
        return error('FILE_TOO_LARGE', 'The CV must be 4 MB or smaller.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedType = await fileTypeFromBuffer(bytes);
    const expectedMimeType = detectedType && acceptedTypes.get(detectedType.ext);

    if (!detectedType || !expectedMimeType || detectedType.mime !== expectedMimeType) {
        return error('INVALID_FILE_TYPE', 'Only valid PDF and DOCX CVs are accepted.');
    }

    return {
        ok: true,
        file,
        extension: detectedType.ext,
        mimeType: expectedMimeType,
    };
}
