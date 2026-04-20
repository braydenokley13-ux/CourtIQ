/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'next/core-web-vitals',
  ],
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@next/next/no-html-link-for-pages': 'error',
  },
  overrides: [
    {
      // Everywhere except the analytics module itself
      files: ['**/*.ts', '**/*.tsx'],
      excludedFiles: ['**/lib/analytics/**'],
      rules: {
        // Forbid importing posthog-js directly — use track() from lib/analytics/events
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['posthog-js', 'posthog-js/*'],
                message:
                  "Direct posthog-js import is not allowed. Use track() / identify() from '@/lib/analytics/events' instead.",
              },
            ],
          },
        ],
        // Forbid calling posthog.capture() — catches dynamic imports that slip through
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "CallExpression[callee.type='MemberExpression'][callee.property.name='capture'][callee.object.name='posthog']",
            message:
              "posthog.capture() is not allowed outside lib/analytics/. Use track() from '@/lib/analytics/events' instead.",
          },
        ],
      },
    },
  ],
}
