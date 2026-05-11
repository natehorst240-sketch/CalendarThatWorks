import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Ignore generated/non-source dirs and ambient declaration files
  { ignores: ['dist/**', 'node_modules/**', 'src/**/__tests__/**', 'src/**/*.test.*', 'src/test-setup.ts', 'src/types/**'] },

  // Base TypeScript rules (no type information needed — fast)
  ...tseslint.configs.recommended,

  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The core rule: explicit `any` is a build error, not a warning.
      // Use `unknown` or a proper type instead.
      '@typescript-eslint/no-explicit-any': 'error',

      // Suppress a few rules that are noisy for a library codebase.
      // Re-enable as the codebase matures.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'error',

      // React hooks — enforce rules-of-hooks. exhaustive-deps is off for now;
      // turn on incrementally as useEffects are audited.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
);
