interface Pending {
  resolve(value: string): void;
  reject(error: Error): void;
}

export async function settle(
  loads: readonly Pending[],
  tasks: readonly (() => Promise<void>)[],
): Promise<void> {
  loads[0]?.resolve('profile');
  loads[1]?.reject(new Error('failed'));
  await tasks[0]?.();
}
