import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'assets-src', 'public/assets'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // The simulation must stay pure and strictly typed (PRD Section 0 rule 5, Section 4).
    files: ['src/sim/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'three',
            'three/*',
            'preact',
            'preact/*',
            '**/render/*',
            '**/ui/*',
            '**/input/*',
          ],
        },
      ],
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
);
