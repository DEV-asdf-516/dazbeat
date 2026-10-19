import type { z } from 'zod';

export function formatPath(path: readonly PropertyKey[], rootName: string): string {
  return path.reduce<string>(
    (joined, key) => (typeof key === 'number' ? `${joined}[${key}]` : `${joined}.${String(key)}`),
    rootName,
  );
}

export interface ParseIssue {
  path: string;
  reason: string;
}

export function toParseIssue(error: z.ZodError, rootName: string): ParseIssue {
  const [issue] = error.issues;
  return {
    path: formatPath(issue?.path ?? [], rootName),
    reason: issue?.message ?? 'is invalid',
  };
}
