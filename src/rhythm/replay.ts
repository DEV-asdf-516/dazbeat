import { GameplaySession } from './GameplaySession.js';
import { JUDGMENT_WINDOWS } from './judgment.js';
import type { Chart, GameplayResult, InputEvent } from './types.js';

/** 판정 창은 클라이언트와 같은 값으로 고정한다. */
export function replayGameplay(chart: Chart, inputs: readonly InputEvent[]): GameplayResult {
  const session = new GameplaySession(chart, JUDGMENT_WINDOWS);
  for (const { lane, kind, songTimeMs } of inputs) {
    if (kind === 'press') {
      session.press(lane, songTimeMs);
    } else {
      session.release(lane, songTimeMs);
    }
  }
  // 무한대 시각까지 진행하면 남은 노트가 모두 자동 판정되므로 playing 은 세션의 버그다.
  session.update(Number.POSITIVE_INFINITY);
  const progress = session.getProgress();
  if (progress.outcome === 'playing') {
    throw new Error('Replay left notes unjudged');
  }
  return progress;
}
