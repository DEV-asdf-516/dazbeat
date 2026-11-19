import { requireDefined } from '../../../../src/invariant.js';

interface Pending {
  resolve(value: string): void;
}

export function settle(
  loads: readonly Pending[],
  routes: Record<string, string[]>,
  listener: { close(): void } | undefined,
): string | undefined {
  requireDefined(loads[0], 'Missing pending load').resolve('profile');
  listener?.close();
  const label = loads[1]?.resolve.name;
  return routes[label ?? '']?.shift();
}
