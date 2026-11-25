import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const { jsx } = jsxRuntime;

const compiled = ts.transpileModule(
    readFileSync(
        new URL('../../src/components/common/JobDetailModal.jsx', import.meta.url),
        'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

const iconProxy = new Proxy({}, {
    get: (_target, property) => (typeof property === 'string'
        ? () => jsx('span', { 'data-icon': property })
        : undefined),
});

const FRAMER_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants',
    'whileHover', 'whileTap', 'whileInView', 'layout', 'layoutId',
]);

const motionTag = (tag) => (props) => {
    const domProps = {};
    for (const [key, value] of Object.entries(props ?? {})) {
        if (!FRAMER_PROPS.has(key)) domProps[key] = value;
    }
    return jsx(tag, domProps);
};

function loadModal({ captured = [] } = {}) {
    const exports = {};
    const imports = {
        react: React,
        'react/jsx-runtime': jsxRuntime,
        'framer-motion': {
            motion: new Proxy({}, { get: (_t, tag) => motionTag(String(tag)) }),
            AnimatePresence: ({ children }) => jsx(React.Fragment, { children }),
        },
        'lucide-react': iconProxy,
        '@/components/staff-preview/job-document': {
            JobDocumentView: ({ document, className }) => {
                captured.push({ document, className });
                return jsx('div', {
                    'data-testid': 'job-document-view',
                    'data-class': className,
                });
            },
        },
    };
    runInNewContext(compiled, {
        exports,
        require: (name) => {
            assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
            return imports[name];
        },
    });
    return exports.default;
}

const baseJob = {
    id: 'role-1',
    title: 'Real Role',
    company: 'Real Client',
    type: 'Full-time',
    location: 'Remote',
    salary: 'USD 100k',
    description: 'First line\nSecond line',
};

test('the modal renders real content only, without fabricated copy', () => {
    const Modal = loadModal();
    const html = renderToStaticMarkup(
        jsx(Modal, {
            job: baseJob,
            isOpen: true,
            onClose: () => {},
            onApply: () => {},
        }),
    );
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-modal="true"'));
    assert.ok(html.includes('aria-labelledby'));
    assert.ok(html.includes('aria-label="Close"'));
    assert.ok(html.includes('Real Role'));
    assert.ok(html.includes('First line'));
    assert.ok(!html.includes('Architect'), 'no canned responsibility bullets');
    assert.ok(!html.includes('Key Responsibilities'),
        'no responsibilities section when the job has none');
    assert.ok(!html.includes('Posted 2 days ago'), 'no fabricated posting date');
    assert.ok(!html.includes('<time'), 'no date rendered without publishedAt');
});

test('a published document renders through the shared viewer with the public palette', () => {
    const captured = [];
    const Modal = loadModal({ captured });
    const document = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich' }] }],
    };
    const html = renderToStaticMarkup(
        jsx(Modal, {
            job: {
                ...baseJob,
                descriptionDocument: document,
                publishedAt: '2026-09-20T10:00:00.000Z',
                responsibilities: ['Own the roadmap'],
            },
            isOpen: true,
            onClose: () => {},
            onApply: () => {},
        }),
    );
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].document, document);
    assert.ok(captured[0].className.includes('text-gray-300'));
    assert.ok(html.includes('data-testid="job-document-view"'));
    assert.ok(!html.includes('First line'),
        'the document view replaces the plaintext fallback');
    assert.ok(html.includes('Key Responsibilities'));
    assert.ok(html.includes('Own the roadmap'));
    assert.ok(html.includes('<time dateTime="2026-09-20T10:00:00.000Z">'));
    assert.ok(html.includes('Posted on September 20, 2026'));
    assert.ok(!html.includes('Posted 2 days ago'));
});

test('applyNote disables the apply action and explains why', () => {
    const Modal = loadModal();
    const html = renderToStaticMarkup(
        jsx(Modal, {
            job: baseJob,
            isOpen: true,
            onClose: () => {},
            onApply: () => {},
            applyNote: 'This position is no longer accepting applications.',
        }),
    );
    assert.ok(html.includes('This position is no longer accepting applications.'));
    assert.ok(html.includes('disabled'), 'apply is disabled while unavailable');
});
