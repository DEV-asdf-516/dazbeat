import { GameplaySession } from '../../src/rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS } from '../../src/rhythm/judgment.js';
import type { Chart, GameplayResult, InputEvent } from '../../src/rhythm/types.js';

export interface ClientPlay {
  result: GameplayResult;
  inputs: readonly InputEvent[];
}

/** 모든 노트의 판정이 끝나는 마지막 시각. 이 시각보다 뒤의 프레임에서 남은 자동 판정이 끝난다. */
export function getLastJudgmentDeadlineMs(chart: Chart): number {
  return Math.max(
    ...chart.notes.map((note) =>
      Math.max(note.timeMs + JUDGMENT_WINDOWS.badMs, note.type === 'hold' ? note.endTimeMs : 0),
    ),
  );
}

/**
 * 클라이언트처럼 플레이를 진행한다. 각 입력 직전에 그 입력 시각보다 이른 남은 프레임을 먼저 `update` 하고,
 * 입력은 일정에 적힌 시각 그대로 `press`/`release` 한다. 입력 일정이 앞 입력보다 이른 시각을 가지면
 * 앞서 진행한 프레임보다 이른 입력(시계 역행)이 된다. 마지막에 판정 마감 이후까지 프레임을 진행한다.
 */
export function simulateClientPlay(
  chart: Chart,
  inputs: readonly InputEvent[],
  frameTimesMs: readonly number[],
): ClientPlay {
  const session = new GameplaySession(chart, JUDGMENT_WINDOWS);
  let frameIndex = 0;
  const updateFramesBefore = (limitMs: number): void => {
    for (; frameIndex < frameTimesMs.length; frameIndex++) {
      const frameTimeMs = frameTimesMs[frameIndex];
      if (frameTimeMs === undefined || frameTimeMs >= limitMs) {
        return;
      }
      session.update(frameTimeMs);
    }
  };
  for (const { lane, kind, songTimeMs } of inputs) {
    updateFramesBefore(songTimeMs);
    if (kind === 'press') {
      session.press(lane, songTimeMs);
    } else {
      session.release(lane, songTimeMs);
    }
  }
  const endMs = getLastJudgmentDeadlineMs(chart) + 1;
  updateFramesBefore(endMs);
  session.update(endMs);
  return {
    result: session.getResult(),
    inputs: session.getInputs(),
  };
}
