import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import {
    DOCX_MIME_TYPE,
    MAX_CV_SIZE_BYTES,
    isApplicationReference,
    normalizeProfessionalUrl,
    readApplicationFields,
    validateApplicationFields,
    validateCvFileMetadata,
} from '../../src/lib/application.js';
import { validateCvFile } from '../../src/lib/application-file.js';

const jobs = [{ id: 'founding-engineer', title: 'Founding Engineer' }];

const validFields = {
    jobId: 'founding-engineer',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    professionalUrl: 'https://github.com/ada',
    technicalAchievement: 'Built a protocol.',
};

const createDocx = () => zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="xml" ContentType="application/xml"/>
            <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        </Relationships>`),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`),
});

test('reads and trims application fields', () => {
    const formData = new FormData();
    formData.set('jobId', ' founding-engineer ');
    formData.set('fullName', ' Ada Lovelace ');
    formData.set('email', ' ADA@EXAMPLE.COM ');
    formData.set('professionalUrl', ' https://github.com/ada ');
    formData.set('technicalAchievement', ' Built a protocol. ');

    assert.deepEqual(readApplicationFields(formData), {
        ...validFields,
        email: 'ADA@EXAMPLE.COM',
    });
});

test('validates and canonicalizes application fields with Zod', () => {
    const result = validateApplicationFields({
        ...validFields,
        email: 'ADA@EXAMPLE.COM',
        professionalUrl: 'www.linkedin.com/in/ada',
    }, jobs);

    assert.equal(result.ok, true);
    assert.equal(result.job.title, 'Founding Engineer');
    assert.equal(result.fields.email, 'ada@example.com');
    assert.equal(result.fields.professionalUrl, 'https://www.linkedin.com/in/ada');
});

test('normalizes domain-like professional URLs and rejects unsafe or typo schemes', () => {
    assert.equal(normalizeProfessionalUrl('linkedin.com/in/ada').value, 'https://linkedin.com/in/ada');
    assert.equal(normalizeProfessionalUrl('hhtp://linkedin.com/in/ada').code, 'INVALID_URL');
    assert.equal(normalizeProfessionalUrl('javascript:alert(1)').code, 'INVALID_URL');
    assert.equal(normalizeProfessionalUrl('www\\.linkedin.com').code, 'INVALID_URL');
});

test('recognizes only server-issued application reference shapes', () => {
    assert.equal(isApplicationReference('AG-A1B2C3D4E5F6'), true);
    assert.equal(isApplicationReference('AG-LOCALTEST'), false);
    assert.equal(isApplicationReference(undefined), false);
});

test('rejects unknown jobs and malformed fields', () => {
    assert.equal(validateApplicationFields({ ...validFields, jobId: 'missing' }, jobs).code, 'INVALID_JOB');
    assert.equal(validateApplicationFields({ ...validFields, email: 'not-an-email' }, jobs).code, 'INVALID_EMAIL');
});

test('accepts PDF and DOCX metadata for immediate browser feedback', () => {
    const pdf = new File(['pdf'], 'resume.PDF', { type: 'application/octet-stream' });
    const docx = new File(['docx'], 'resume.docx', { type: '' });
    const text = new File(['text'], 'resume.txt', { type: 'text/plain' });

    assert.equal(validateCvFileMetadata(pdf).ok, true);
    assert.equal(validateCvFileMetadata(docx).ok, true);
    assert.equal(validateCvFileMetadata(text).code, 'INVALID_FILE_TYPE');
});

test('detects valid PDF and DOCX files from their contents', async () => {
    const pdf = new File(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'], 'resume.bin', { type: 'text/plain' });
    const docx = new File([createDocx()], 'resume.bin', { type: 'application/zip' });

    const pdfResult = await validateCvFile(pdf);
    const docxResult = await validateCvFile(docx);

    assert.deepEqual({ extension: pdfResult.extension, mimeType: pdfResult.mimeType }, {
        extension: 'pdf',
        mimeType: 'application/pdf',
    });
    assert.deepEqual({ extension: docxResult.extension, mimeType: docxResult.mimeType }, {
        extension: 'docx',
        mimeType: DOCX_MIME_TYPE,
    });
});

test('rejects spoofed, missing, and oversized CV files', async () => {
    const spoofed = new File(['not a document'], 'resume.pdf', { type: 'application/pdf' });
    const oversized = new File([new Uint8Array(MAX_CV_SIZE_BYTES + 1)], 'resume.pdf', { type: 'application/pdf' });

    assert.equal((await validateCvFile(null)).code, 'MISSING_CV');
    assert.equal((await validateCvFile(spoofed)).code, 'INVALID_FILE_TYPE');
    assert.equal((await validateCvFile(oversized)).code, 'FILE_TOO_LARGE');
});
