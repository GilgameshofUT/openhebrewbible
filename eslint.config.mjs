import js from '@eslint/js'
import globals from 'globals'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'data/**', 'Screenshots/**', '.openchamber/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // Unused values are almost always leftovers from a half-finished edit,
      // which is how several dead helpers survived in this codebase.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Plain Node maintenance scripts run outside the bundler.
    files: ['scripts/**/*.mjs', '*.config.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      // Import scripts intentionally traverse loosely-typed third-party XML.
      '@typescript-eslint/no-explicit-any': 'off',
      // These one-off research scripts retain helpers kept for provenance and
      // future re-runs; unused ones are not a defect worth failing CI over.
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
)
