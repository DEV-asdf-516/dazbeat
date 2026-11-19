export interface Activation {
  readonly level: number;
  readonly reachedFull: boolean;
}

function isMvVisibleIn(status: string): boolean {
  return status === 'playing';
}

export function advance(status: string, shouldNotice: boolean): Activation {
  const wasMvVisible = isMvVisibleIn(status);
  return {
    level: wasMvVisible && shouldNotice ? 1 : 0,
    reachedFull: wasMvVisible,
  };
}

export class Player {
  private ready = false;
  failed: boolean | undefined;

  get open(): boolean {
    return this.ready;
  }
}

export function readCode({ repeat: repeated, code }: Pick<KeyboardEvent, 'repeat' | 'code'>) {
  return repeated ? '' : code;
}
