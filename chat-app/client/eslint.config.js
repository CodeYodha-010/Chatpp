import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Flat config — ESLint 10 dropped the old .eslintrc format entirely.
// Scope is the React client sources, the Vite config and the node:test suite.
// `dist/` is build output, and the .kilo/ git worktrees sit outside this package.
//
// `no-undef` (from js.configs.recommended) is the rule that matters most here:
// it catches an identifier that is used but never declared — the class of bug
// that a bundler happily compiles and that only throws in the browser.

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  {
    files: ['src/**/*.{js,mjs,jsx}', 'vite.config.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // JSX needs no extra parser — espree understands it via ecmaFeatures.
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      // `recommended` (not the flat-config variant) keeps this working across
      // plugin majors, since only its `.rules` object is version-stable.
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];