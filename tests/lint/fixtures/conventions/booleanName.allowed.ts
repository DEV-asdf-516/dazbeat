export interface RankingRow {
  readonly cleared: boolean;
  readonly retired: boolean;
  readonly available: boolean;
  readonly isMine: boolean;
}

export const IS_DEBUG = false;

export const pulse = {
  yoyo: true,
  loop: false,
};

export function readCode({ repeat, code }: Pick<KeyboardEvent, 'repeat' | 'code'>): string {
  return repeat ? '' : code;
}

export function countMatches(ids: readonly string[], matches: (id: string) => boolean): number {
  return ids.filter(matches).length;
}

export class Registry extends Map<string, number> {
  private isReady = false;
  hasFailed: boolean | undefined;

  override delete(key: string): boolean {
    this.isReady = true;
    return super.delete(key);
  }

  get canRead(): boolean {
    return this.isReady;
  }
}

export const hasChart = (ids: readonly string[], id: string): boolean => ids.includes(id);

export function commit(ids: string[], id: string): boolean {
  if (hasChart(ids, id)) {
    return false;
  }
  ids.push(id);
  return true;
}
