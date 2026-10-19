import { GameplaySession } from '../../src/rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS } from '../../src/rhythm/judgment.js';
import type { Chart, GameplayResult, InputEvent } from '../../src/rhythm/types.js';

export interface ClientPlay {
  result: GameplayResult;
  inputs: readonly InputEvent[];
}

export function getLastJudgmentDeadlineMs(chart: Chart): number {
  return Math.max(
    ...chart.notes.map((note) =>
      Math.max(note.timeMs + JUDGMENT_WINDOWS.badMs, note.type === 'hold' ? note.endTimeMs : 0),
    ),
  );
}

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
  const progress = session.getProgress();
  if (progress.outcome === 'playing') {
    throw new Error('Simulated play left notes unjudged');
  }
  return {
    result: progress,
    inputs: session.getInputs(),
  };
}
