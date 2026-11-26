import { describe, expect, it } from 'vitest';
import {
  advanceEnteredNotes,
  getEnteredNoteRange,
} from '../../../../src/game/gameplay/state/gameplayHud.js';
import type { GameplayFrame } from '../../../../src/game/gameplay/state/gameplayHud.js';
import { GameplaySession } from '../../../../src/rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS } from '../../../../src/rhythm/judgment.js';
import type { Chart, GameplayState, Note } from '../../../../src/rhythm/types.js';

const NOTES: readonly Note[] = [1000, 2000, 3000].map((timeMs) => ({
  type: 'tap',
  timeMs,
  lane: 0,
}));
const CHART: Chart = {
  songId: 'song',
  difficulty: 'normal',
  laneCount: 4,
  offsetMs: 0,
  notes: NOTES,
};
const SESSION = new GameplaySession(CHART, JUDGMENT_WINDOWS, { canFail: true });

const STATE: GameplayState = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: {
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
  },
  hp: 100,
};

function frameOf(
  state: Partial<GameplayState> = {},
  overrides: Partial<Pick<GameplayFrame, 'progress' | 'enteredNoteCount'>> = {},
): GameplayFrame {
  return {
    session: SESSION,
    songTimeMs: 0,
    state: {
      ...STATE,
      ...state,
    },
    progress: 0,
    activation: {
      level: 0,
      hasReachedFull: false,
    },
    enteredNoteCount: 0,
    ...overrides,
  };
}

describe('getEnteredNoteRange', () => {
  it('starts from zero on the first frame', () => {
    expect(getEnteredNoteRange(null, frameOf({}, { enteredNoteCount: 2 }))).toEqual({
      fromIndex: 0,
      toIndex: 2,
    });
  });

  it('covers the notes entered since the previous frame', () => {
    expect(
      getEnteredNoteRange(
        frameOf({}, { enteredNoteCount: 1 }),
        frameOf({}, { enteredNoteCount: 3 }),
      ),
    ).toEqual({
      fromIndex: 1,
      toIndex: 3,
    });
  });
});

describe('advanceEnteredNotes', () => {
  const enteredBefore = (limitMs: number) => (noteTimeMs: number) => noteTimeMs <= limitMs;

  it('counts the following notes that have entered', () => {
    expect(advanceEnteredNotes(NOTES, 0, 0, enteredBefore(2000))).toBe(2);
  });

  it('keeps the count when the next note has not entered', () => {
    expect(advanceEnteredNotes(NOTES, 2, 0, enteredBefore(2000))).toBe(2);
  });

  it('stops at the end of the notes', () => {
    expect(advanceEnteredNotes(NOTES, 1, 0, enteredBefore(9000))).toBe(3);
  });
});
