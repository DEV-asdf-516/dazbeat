import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.agent-work/**',
      '.claude/**',
      '.codex/**',
      'pocketbase/pb_hooks/lib/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-nested-ternary': 'error',
    },
  },
  prettier,
  {
    // eslint-config-prettier 가 끄는 규칙을 다시 켠다. Prettier 는 첫 키 앞에 줄바꿈이 있으면
    // 객체를 여러 줄로 유지하므로(objectWrap: preserve) 두 도구가 충돌하지 않는다.
    files: ['**/*.ts'],
    rules: {
      'object-curly-newline': [
        'error',
        {
          ObjectExpression: { minProperties: 2, consistent: true },
        },
      ],
      'object-property-newline': 'error',
    },
  },
);
