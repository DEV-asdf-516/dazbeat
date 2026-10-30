import { describe, expect, it } from 'vitest';
import type { GameplayFrame } from '../../../../src/game/gameplay/GameplayController.js';
import {
  advanceEnteredNotes,
  getChangedHudRegions,
  getEnteredNoteRange,
} from '../../../../src/game/gameplay/state/gameplayHud.js';
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
      reachedFull: false,
    },
    enteredNoteCount: 0,
    ...overrides,
  };
}

describe('getChangedHudRegions', () => {
  it('paints every lasting region without effects on the first frame', () => {
    expect(getChangedHudRegions(null, frameOf())).toEqual([
      'combo',
      'comboTier',
      'score',
      'progress',
      'gaugeFill',
      'gaugeBand',
      'perfectCount',
      'greatCount',
      'goodCount',
      'badCount',
      'missCount',
      'accuracy',
    ]);
  });

  it('paints only the combo when it grows within a tier', () => {
    expect(getChangedHudRegions(frameOf({ combo: 10 }), frameOf({ combo: 11 }))).toEqual(['combo']);
  });

  it('pops the combo when the tier rises', () => {
    expect(getChangedHudRegions(frameOf({ combo: 49 }), frameOf({ combo: 50 }))).toEqual([
      'combo',
      'comboTier',
      'comboPop',
    ]);
  });

  it('does not pop when the combo breaks', () => {
    expect(getChangedHudRegions(frameOf({ combo: 60 }), frameOf({ combo: 0 }))).toEqual([
      'combo',
      'comboTier',
    ]);
  });

  it('paints only the fill when the HP drops within a band', () => {
    expect(getChangedHudRegions(frameOf({ hp: 90 }), frameOf({ hp: 80 }))).toEqual(['gaugeFill']);
  });

  it('glints when the band drops', () => {
    expect(getChangedHudRegions(frameOf({ hp: 70 }), frameOf({ hp: 60 }))).toEqual([
      'gaugeFill',
      'gaugeBand',
      'gaugeGlint',
    ]);
  });

  it('does not glint when the band rises', () => {
    expect(getChangedHudRegions(frameOf({ hp: 60 }), frameOf({ hp: 70 }))).toEqual([
      'gaugeFill',
      'gaugeBand',
    ]);
  });

  it('paints the count of the judgment that grew and the accuracy', () => {
    expect(
      getChangedHudRegions(
        frameOf(),
        frameOf({
          counts: {
            ...STATE.counts,
            good: 1,
          },
        }),
      ),
    ).toEqual(['goodCount', 'accuracy']);
  });

  it('paints only the progress when only the progress changes', () => {
    expect(getChangedHudRegions(frameOf(), frameOf({}, { progress: 0.5 }))).toEqual(['progress']);
  });
});

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
