import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const legacyWarningRules = new Set([
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-require-imports',
    'react/display-name',
    'react/no-unescaped-entities',
    'react-hooks/purity',
    'react-hooks/set-state-in-effect',
]);

const preserveLegacyWarnings = (config) => ({
    ...config,
    rules: Object.fromEntries(
        Object.entries(config.rules || {}).map(([name, setting]) => [
            name,
            legacyWarningRules.has(name) ? 'warn' : setting,
        ]),
    ),
});

export default defineConfig([
    ...nextVitals.map(preserveLegacyWarnings),
    ...nextTypescript.map(preserveLegacyWarnings),
    globalIgnores([
        '.next/**',
        'design-preview/.next/**',
        'out/**',
        'build/**',
        'next-env.d.ts',
    ]),
]);
