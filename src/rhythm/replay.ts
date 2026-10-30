import { GameplaySession } from './GameplaySession.js';
import { JUDGMENT_WINDOWS } from './judgment.js';
import type { Chart, GameplayResult, InputEvent } from './types.js';
import { requireDefined } from '../invariant.js';

export interface ReplayHit {
  noteTimeMs: number;
  inputTimeMs: number;
}

export interface ReplayedPlay {
  result: GameplayResult;
  hits: readonly ReplayHit[];
}

/** 판정 창은 클라이언트와 같은 값으로 고정한다. */
export function replayGameplay(chart: Chart, inputs: readonly InputEvent[]): ReplayedPlay {
  const session = new GameplaySession(chart, JUDGMENT_WINDOWS);
  const hits: ReplayHit[] = [];
  for (const { lane, kind, songTimeMs } of inputs) {
    if (kind === 'press') {
      // press 가 돌려주는 만료 판정은 miss·holdEnd 뿐이라, 남는 하나가 이 press 의 판정이다.
      const hit = session
        .press(lane, songTimeMs)
        .find((event) => event.kind !== 'holdEnd' && event.judgment !== 'miss');
      if (hit !== undefined) {
        hits.push({
          noteTimeMs: requireDefined(
            chart.notes[hit.noteIndex],
            'Judged note is not in the chart',
            hit.noteIndex,
          ).timeMs,
          inputTimeMs: songTimeMs,
        });
      }
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
  return {
    result: progress,
    hits,
  };
}
