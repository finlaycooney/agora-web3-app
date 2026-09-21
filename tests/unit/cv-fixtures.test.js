import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { validateCvFile } from '../../src/lib/application-file.js';
import { createSyntheticDocx, createSyntheticPdf, syntheticCvText } from '../support/cv-fixtures.js';

test('synthetic PDF has a page tree, correct cross-reference offsets and stream length', () => {
    const bytes = createSyntheticPdf();
    const pdf = bytes.toString('ascii');
    const xrefOffset = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)[1]);
    assert.equal(pdf.slice(xrefOffset, xrefOffset + 4), 'xref');

    const entries = pdf.slice(xrefOffset).split('\n');
    assert.equal(entries[1], '0 6');
    for (let id = 1; id <= 5; id += 1) {
        const offset = Number(entries[id + 2].slice(0, 10));
        assert.ok(pdf.slice(offset).startsWith(`${id} 0 obj\n`));
    }
    const content = pdf.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/);
    assert.equal(Buffer.byteLength(content[2]), Number(content[1]));
    assert.match(pdf, /\/Root 1 0 R/);
    assert.match(pdf, /\/Kids \[3 0 R\] \/Count 1/);
    assert.ok(pdf.includes(syntheticCvText));
});

test('synthetic DOCX includes its OOXML content type, relationship and readable document', () => {
    const bytes = createSyntheticDocx();
    assert.deepEqual(bytes, createSyntheticDocx());
    const files = unzipSync(bytes);
    assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
    assert.match(strFromU8(files['[Content_Types].xml']), /PartName="\/word\/document.xml"/);
    assert.match(strFromU8(files['_rels/.rels']), /Target="word\/document.xml"/);
    assert.ok(strFromU8(files['word/document.xml']).includes(`<w:t>${syntheticCvText}</w:t>`));
    assert.doesNotMatch(strFromU8(files['_rels/.rels']), /TargetMode="External"/);
});

test('both synthetic fixtures pass current byte-based CV validation independently of filename', async () => {
    for (const [extension, bytes] of [
        ['pdf', createSyntheticPdf()],
        ['docx', createSyntheticDocx()],
    ]) {
        const result = await validateCvFile(new File([bytes], 'fixture.bin', { type: 'text/plain' }));
        assert.equal(result.ok, true);
        assert.equal(result.extension, extension);
    }
});
