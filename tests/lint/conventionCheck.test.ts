import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
// 타입 정보를 쓰는 규칙이라 TypeScript 프로그램을 처음 만드는 데 시간이 든다.
const LINT_TIMEOUT_MS = 120_000;

async function lintFixture(name: string): Promise<{ ruleId: string | null; line: number }[]> {
  const eslint = new ESLint({
    cwd: ROOT,
    ignore: false,
    overrideConfigFile: 'eslint.fast-check.config.mjs',
    allowInlineConfig: false,
  });
  const results = await eslint.lintFiles([`tests/lint/fixtures/conventions/${name}`]);
  return results.flatMap((result) =>
    result.messages.map(({ ruleId, line }) => ({
      ruleId,
      line,
    })),
  );
}

describe('fast convention check', () => {
  it.each([
    ['dazbeat/boolean-name', 'booleanName', [3, 10, 11, 19, 20, 22, 27]],
    ['dazbeat/bare-unit-name', 'bareUnitName', [1, 2, 12, 16, 19]],
    ['dazbeat/required-test-call', 'requiredTestCall', [10, 11, 12]],
  ])(
    '%s reports each violation on its line',
    async (ruleId, fixture, lines) => {
      expect(await lintFixture(`${fixture}.violations.ts`)).toEqual(
        lines.map((line) => ({
          ruleId,
          line,
        })),
      );
    },
    LINT_TIMEOUT_MS,
  );

  it.each([
    ['schema fields, external option keys, kept destructured names and functions', 'booleanName'],
    [
      'names with a unit, external option keys, type-only signatures and tuple elements',
      'bareUnitName',
    ],
    ['requireDefined, used results and optional calls on a plain reference', 'requiredTestCall'],
  ])(
    'allows %s',
    async (_exceptions, fixture) => {
      expect(await lintFixture(`${fixture}.allowed.ts`)).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );
});
