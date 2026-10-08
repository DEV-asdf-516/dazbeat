import { LANES } from '../../rhythm/lanes.js';
import type { Lane } from '../../rhythm/types.js';
import type { Settings } from '../../storage/LocalSave.js';

export type GameplayCommand = 'confirm' | 'back' | 'mvMode';

/** 한 키가 레인과 명령을 동시에 가질 수 있다. 어느 쪽을 쓸지는 게임 단계가 정한다. */
export interface GameplayKey {
  lane: Lane | null;
  command: GameplayCommand | null;
}

export function readGameplayKey(code: string, keyBindings: Settings['keyBindings']): GameplayKey {
  const lane = LANES.find((candidate) => keyBindings[candidate] === code) ?? null;
  return { lane, command: toCommand(code, lane) };
}

function toCommand(code: string, lane: Lane | null): GameplayCommand | null {
  switch (code) {
    // Enter 는 레인 키로 바인딩해도 시작·재개 키로 계속 쓴다.
    case 'Enter':
      return 'confirm';
    case 'Escape':
      return 'back';
    // Tab 을 레인 키로 바인딩하면 MV 모드 전환보다 레인 입력이 우선한다.
    case 'Tab':
      return lane === null ? 'mvMode' : null;
    default:
      return null;
  }
}
