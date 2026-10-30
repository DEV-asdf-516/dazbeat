import { describe, expect, it } from 'vitest';
import type { AchievementId, NamedAchievementDefinition } from '../../../src/data/achievements.js';
import { ALL_SONGS_QUERY } from '../../../src/data/songs.js';
import type { ChartRef, Song } from '../../../src/data/songs.js';
import { SongFeed } from '../../../src/game/app/SongFeed.js';
import { ResultController } from '../../../src/game/result/ResultController.js';
import type { ResultExit, ResultState } from '../../../src/game/result/state/resultState.js';
import type { SceneRequest } from '../../../src/game/app/sceneRoutes.js';
import { requireDefined } from '../../../src/invariant.js';

function achievementOf(id: AchievementId): NamedAchievementDefinition {
  return {
    id,
    set: 'rhythm',
    category: 'play',
    rule: {
      kind: 'plays',
      target: 1,
    },
    isRetired: false,
    names: {
      ko: id,
      ja: id,
      en: id,
    },
  };
}
const FIRST_FINISH = achievementOf('FIRST_FINISH');
const FIRST_CLEAR = achievementOf('FIRST_CLEAR');
const FIVE: readonly NamedAchievementDefinition[] = ['A1', 'A2', 'A3', 'A4', 'A5'].map(
  achievementOf,
);

const SONG: Song = {
  id: 'easy-hard',
  title: 'easy-hard',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/easy-hard/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 0,
  gameEndMs: 30000,
  chartIds: {
    4: {
      easy: 'easy.json',
      hard: 'hard.json',
    },
  },
};
const EASY: ChartRef = {
  song: SONG,
  laneCount: 4,
  difficulty: 'easy',
  chartId: 'easy.json',
};

interface Harness {
  readonly controller: ResultController;
  readonly renders: { previous: ResultState | null; next: ResultState }[];
  readonly leaves: SceneRequest[];
  focusSoundCount(): number;
  last(): ResultState;
  resolve(achievements: readonly NamedAchievementDefinition[]): void;
}

function createHarness(
  exit: ResultExit = {
    mode: 'standard',
    restore: undefined,
  },
): Harness {
  const renders: { previous: ResultState | null; next: ResultState }[] = [];
  const leaves: SceneRequest[] = [];
  let focusSoundCount = 0;
  let resolve: (achievements: readonly NamedAchievementDefinition[]) => void = () => {};
  const newAchievements = new Promise<readonly NamedAchievementDefinition[]>((resolveAll) => {
    resolve = resolveAll;
  });
  const controller = new ResultController(
    {
      render: (previous, next) =>
        renders.push({
          previous,
          next,
        }),
      playFocusSound: () => {
        focusSoundCount += 1;
      },
      leave: (request) => leaves.push(request),
    },
    EASY,
    exit,
    newAchievements,
  );
  return {
    controller,
    renders,
    leaves,
    focusSoundCount: () => focusSoundCount,
    last: () => requireDefined(renders.at(-1), 'Missing render', renders.length).next,
    resolve: (achievements) => resolve(achievements),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function withAchievements(
  achievements: readonly NamedAchievementDefinition[],
): Promise<Harness> {
  const harness = createHarness();
  harness.resolve(achievements);
  await flush();
  return harness;
}

function slots(state: ResultState): { id: number; slot: number; phase: string }[] {
  return state.toasts.shown.map(({ id, slot, phase }) => ({
    id,
    slot,
    phase,
  }));
}

describe('ResultController', () => {
  describe('achievement toasts', () => {
    it('queues the new achievements once when the submission response arrives', async () => {
      const harness = createHarness();
      await flush();
      expect(harness.renders).toHaveLength(1);
      expect(harness.renders[0]?.previous).toBeNull();

      harness.resolve([FIRST_FINISH, FIRST_CLEAR]);
      await flush();

      expect(harness.renders).toHaveLength(2);
      expect(harness.last().toasts.shown.map(({ achievement }) => achievement)).toEqual([
        FIRST_FINISH,
        FIRST_CLEAR,
      ]);
    });

    it('draws nothing for an empty list', async () => {
      const harness = await withAchievements([]);

      expect(harness.renders).toHaveLength(1);
    });

    it('ignores achievements that arrive after close', async () => {
      const harness = createHarness();
      harness.controller.close();

      harness.resolve([FIRST_FINISH]);
      await flush();

      expect(harness.renders).toHaveLength(1);
    });

    it('shows three toasts with the newest at the bottom slot and keeps the rest waiting', async () => {
      const harness = await withAchievements(FIVE);

      expect(slots(harness.last())).toEqual([
        {
          id: 0,
          slot: 2,
          phase: 'shown',
        },
        {
          id: 1,
          slot: 1,
          phase: 'shown',
        },
        {
          id: 2,
          slot: 0,
          phase: 'shown',
        },
      ]);
      expect(harness.last().toasts.waiting).toHaveLength(2);
    });

    it('marks a dismissed toast as leaving only once', async () => {
      const harness = await withAchievements(FIVE);

      harness.controller.dismissToast(0);
      expect(harness.last().toasts.shown[0]?.phase).toBe('leaving');
      const count = harness.renders.length;

      harness.controller.dismissToast(0);
      expect(harness.renders).toHaveLength(count);
    });

    it('admits the next waiting toast and reassigns the slots after a removal', async () => {
      const harness = await withAchievements(FIVE);
      harness.controller.dismissToast(0);

      harness.controller.removeToast(0);

      expect(slots(harness.last())).toEqual([
        {
          id: 1,
          slot: 2,
          phase: 'shown',
        },
        {
          id: 2,
          slot: 1,
          phase: 'shown',
        },
        {
          id: 3,
          slot: 0,
          phase: 'shown',
        },
      ]);
      expect(harness.last().toasts.waiting).toHaveLength(1);
    });

    it('keeps the remaining slots when nothing is waiting', async () => {
      const harness = await withAchievements([FIRST_FINISH, FIRST_CLEAR]);
      harness.controller.dismissToast(1);

      harness.controller.removeToast(1);

      expect(slots(harness.last())).toEqual([
        {
          id: 0,
          slot: 1,
          phase: 'shown',
        },
      ]);
    });
  });

  describe('menu', () => {
    it('plays the focus sound for each focus move', () => {
      const harness = createHarness();

      harness.controller.moveFocus(1);
      harness.controller.moveFocus(1);

      expect(harness.last().focus).toBe('retry');
      expect(harness.focusSoundCount()).toBe(2);
    });

    it('requests the retry and the song select with the retry difficulty', () => {
      const restore = {
        feed: new SongFeed(ALL_SONGS_QUERY, () => Promise.reject(new Error('Not used'))),
        index: 2,
        songId: SONG.id,
        difficulty: 'easy',
      } as const;
      const harness = createHarness({
        mode: 'practice',
        restore,
      });
      harness.controller.stepDifficulty(1);

      harness.controller.confirm();
      harness.controller.back();

      expect(harness.leaves).toEqual([
        {
          key: 'gameplay',
          data: {
            song: SONG,
            laneCount: 4,
            difficulty: 'hard',
            chartId: 'hard.json',
            mode: 'practice',
            restore: {
              ...restore,
              difficulty: 'hard',
            },
          },
        },
        {
          key: 'songSelect',
          data: {
            mode: 'practice',
            restore: {
              ...restore,
              difficulty: 'hard',
            },
          },
        },
      ]);
    });

    it('changes the retry chart by selecting and stepping difficulties', () => {
      const harness = createHarness();

      harness.controller.selectDifficulty('hard');
      expect(harness.last().retryChart.chartId).toBe('hard.json');

      harness.controller.stepDifficulty(-1);
      expect(harness.last().retryChart.chartId).toBe('easy.json');
    });
  });
});

const H_KEY = {
  code: 'KeyH',
  repeat: false,
};
const ESCAPE_KEY = {
  code: 'Escape',
  repeat: false,
};
const DOWN_KEY = {
  code: 'ArrowDown',
  repeat: false,
};

describe('ResultController controls', () => {
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = createHarness();

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.last().isControlsOpen).toBe(true);
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.last().isControlsOpen).toBe(false);
    harness.controller.openControls();
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(harness.last().isControlsOpen).toBe(false);
  });
});

describe('ResultController button pointer', () => {
  it('runs the button once for over, down and up on it', () => {
    const harness = createHarness();

    harness.controller.pointerOver('songSelect');
    harness.controller.pointerDown('songSelect');
    harness.controller.pointerUp('songSelect');
    harness.controller.pointerUp('songSelect');

    expect(harness.leaves.map(({ key }) => key)).toEqual(['songSelect']);
  });

  it('does not run the button for an up that was pressed elsewhere', () => {
    const harness = createHarness();

    harness.controller.pointerOver('retry');
    harness.controller.pointerUp('retry');

    expect(harness.leaves).toEqual([]);
  });

  it('releases the press when the pointer leaves the button', () => {
    const harness = createHarness();

    harness.controller.pointerOver('retry');
    harness.controller.pointerDown('retry');
    harness.controller.pointerOut('retry');
    harness.controller.pointerOver('retry');
    harness.controller.pointerUp('retry');

    expect(harness.leaves).toEqual([]);
    expect(harness.last().hover).toEqual({
      kind: 'button',
      button: 'retry',
      isPressed: false,
    });
  });

  it('ignores a press on the close button while the controls are closed', () => {
    const harness = createHarness();
    const renderCount = harness.renders.length;

    harness.controller.pointerDown('controlsClose');

    expect(harness.renders).toHaveLength(renderCount);
  });

  it('opens with the entry and closes with the close button and the backdrop', () => {
    const harness = createHarness();

    harness.controller.pointerDown('controlsEntry');
    harness.controller.pointerUp('controlsEntry');
    expect(harness.last().isControlsOpen).toBe(true);

    harness.controller.pointerDown('controlsClose');
    harness.controller.pointerUp('controlsClose');
    expect(harness.last().isControlsOpen).toBe(false);

    harness.controller.openControls();
    harness.controller.pointerDown('controlsBackdrop');
    harness.controller.pointerUp('controlsBackdrop');
    expect(harness.last().isControlsOpen).toBe(false);
  });

  it('releases the hover of the close button when the controls close', () => {
    const harness = createHarness();
    harness.controller.openControls();
    harness.controller.pointerOver('controlsClose');

    harness.controller.handleControlsKey(ESCAPE_KEY);

    expect(harness.last().hover).toBeNull();
  });
});
