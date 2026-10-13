import { GameplaySession } from './GameplaySession.js';
import { JUDGMENT_WINDOWS } from './judgment.js';
import type { Chart, GameplayResult, InputEvent } from './types.js';

/** 입력 기록만으로 플레이 결과를 다시 계산한다. 판정 창은 클라이언트와 같은 값으로 고정한다. */
export function replayGameplay(chart: Chart, inputs: readonly InputEvent[]): GameplayResult {
  const session = new GameplaySession(chart, JUDGMENT_WINDOWS);
  for (const { lane, kind, songTimeMs } of inputs) {
    if (kind === 'press') {
      session.press(lane, songTimeMs);
    } else {
      session.release(lane, songTimeMs);
    }
  }
  session.update(Number.POSITIVE_INFINITY);
  return session.getResult();
}
