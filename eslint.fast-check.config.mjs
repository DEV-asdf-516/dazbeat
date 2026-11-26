import tseslint from 'typescript-eslint';
import { bareUnitName, booleanName, requiredTestCall } from './eslint.config.mjs';

// 피처 러너의 FAST_CHECK_CMD(scripts/convention-check.sh)가 리뷰 전에 바뀐 파일만 돌리는 검사다.
// 규칙은 eslint.config.mjs 에 있고 npm run lint 도 같은 규칙을 검사한다.
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
      'pocketbase/pb_data/**',
      // 위반 예시라 tests/lint/conventionCheck.test.ts 가 직접 검사한다.
      'tests/lint/fixtures/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      dazbeat: {
        rules: {
          'boolean-name': booleanName,
          'bare-unit-name': bareUnitName,
          'required-test-call': requiredTestCall,
        },
      },
    },
    rules: {
      'dazbeat/boolean-name': 'error',
      'dazbeat/bare-unit-name': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'dazbeat/required-test-call': 'error',
    },
  },
  {
    // PocketBase JSVM 이 정한 이름(getBool, offset, time)을 그대로 옮긴 타입 선언이다.
    files: ['pocketbase/lib/jsvm.ts'],
    rules: {
      'dazbeat/boolean-name': 'off',
      'dazbeat/bare-unit-name': 'off',
    },
  },
);
