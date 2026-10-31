import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { requireDefined } from '../../src/invariant.js';

const ROOT = resolve(import.meta.dirname, '../..');
// 타입 정보를 쓰는 규칙이라 TypeScript 프로그램을 처음 만드는 데 시간이 든다.
const LINT_TIMEOUT_MS = 120_000;

async function lintFixture(name: string): Promise<ESLint.LintResult> {
  const eslint = new ESLint({
    cwd: ROOT,
    ignore: false,
  });
  const [result] = await eslint.lintFiles([`tests/lint/fixtures/${name}`]);
  return requireDefined(result, 'Missing lint result', name);
}

describe('dazbeat/paint-only', () => {
  it(
    'reports each painting violation on its line',
    async () => {
      const result = await lintFixture('violations.ts');

      expect(
        result.messages.map(({ ruleId, line }) => ({
          ruleId,
          line,
        })),
      ).toEqual(
        [2, 3, 9, 12, 13, 14, 15, 16, 18, 22, 26].map((line) => ({
          ruleId: 'dazbeat/paint-only',
          line,
        })),
      );
    },
    LINT_TIMEOUT_MS,
  );

  it(
    'allows previous values, widget caches, scene handlers and writes to objects outside state',
    async () => {
      const result = await lintFixture('allowed.ts');

      expect(result.messages).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );

  it(
    'ignores files that do not import Phaser',
    async () => {
      const result = await lintFixture('withoutPhaser.ts');

      expect(result.messages).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );
});
