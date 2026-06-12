import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
    {
        ignores: ['dist', 'node_modules', '.wrangler', 'coverage', '.dev.vars'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'error',
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },
    {
        // `api/log.ts` is the one sanctioned console boundary — it wraps `console.*` (incl. `console.log`
        // for the `info` level) so the rest of the codebase never calls console directly.
        files: ['api/log.ts'],
        rules: { 'no-console': 'off' },
    },
];
