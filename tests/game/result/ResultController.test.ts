import { describe, expect, it } from 'vitest';
import type { AchievementId, NamedAchievementDefinition } from '../../../src/data/achievements.js';
import type { RankingSubmission } from '../../../src/data/playSession.js';
import type { PlayReview } from '../../../src/data/ranking.js';
import { ALL_SONGS_QUERY } from '../../../src/data/songs.js';
import type { ChartRef, Song } from '../../../src/data/songs.js';
import { SongFeed } from '../../../src/game/app/SongFeed.js';
import { ResultController } from '../../../src/game/result/ResultController.js';
import type { ResultState } from '../../../src/game/result/state/resultState.js';
import type {
  PlayOrigin,
  ResultRanking,
  SceneRequest,
  ResultReport,
} from '../../../src/game/app/sceneRoutes.js';
import { requireDefined } from '../../../src/invariant.js';
import type { SoundEffect } from '../../../src/game/ui/view/soundEffects.js';

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
  profileOpenCount(): number;
  profileRankings(): readonly ResultRanking[];
  readonly controller: ResultController;
  readonly renders: { previous: ResultState | null; next: ResultState }[];
  readonly leaves: SceneRequest[];
  focusSoundCount(): number;
  clickSoundCount(): number;
  closeSoundCount(): number;
  last(): ResultState;
  submit(submission: RankingSubmission): void;
}

const UNRANKED: PlayReview = {
  kind: 'approved',
  ranking: null,
};

function savedWith(
  achievements: readonly NamedAchievementDefinition[],
  review: PlayReview = UNRANKED,
): RankingSubmission {
  return {
    kind: 'saved',
    play: {
      score: 0,
      accuracy: 0,
      maxCombo: 0,
      cleared: true,
      newAchievements: achievements,
      review,
    },
  };
}

function rankedReview(rank: number, isNewBest: boolean): PlayReview {
  return {
    kind: 'approved',
    ranking: {
      rank,
      isNewBest,
    },
  };
}

const EDITOR_START_MS = 5000;

function createHarness(
  origin: PlayOrigin = {
    kind: 'songSelect',
    mode: 'standard',
    quitKey: 'confirm',
    start: { kind: 'whole' },
  },
  rankingKind: ResultRanking['kind'] = 'submitted',
  played: ChartRef = EASY,
  report: ResultReport = { kind: 'graded' },
): Harness {
  const renders: { previous: ResultState | null; next: ResultState }[] = [];
  const leaves: SceneRequest[] = [];
  const sounds: SoundEffect[] = [];
  let profileOpenCount = 0;
  const profileRankings: ResultRanking[] = [];
  let resolve: (submission: RankingSubmission) => void = () => {};
  const submission = new Promise<RankingSubmission>((resolveSubmission) => {
    resolve = resolveSubmission;
  });
  const ranking: ResultRanking =
    rankingKind === 'submitted'
      ? {
          kind: 'submitted',
          submission,
        }
      : { kind: rankingKind };
  const controller = new ResultController(
    {
      render: (previous, next) =>
        renders.push({
          previous,
          next,
        }),
      playSound: (sound) => sounds.push(sound),
      leave: (request) => leaves.push(request),
      openProfile: (awaitedRanking) => {
        profileOpenCount += 1;
        profileRankings.push(awaitedRanking);
      },
    },
    played,
    origin,
    ranking,
    report,
  );
  return {
    controller,
    renders,
    leaves,
    profileOpenCount: () => profileOpenCount,
    profileRankings: () => profileRankings,
    focusSoundCount: () => sounds.filter((sound) => sound === 'menuFocus').length,
    clickSoundCount: () => sounds.filter((sound) => sound === 'click').length,
    closeSoundCount: () => sounds.filter((sound) => sound === 'close').length,
    last: () => requireDefined(renders.at(-1), 'Missing render', renders.length).next,
    submit: (submitted) => resolve(submitted),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function withAchievements(
  achievements: readonly NamedAchievementDefinition[],
): Promise<Harness> {
  const harness = createHarness();
  harness.submit(savedWith(achievements));
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

      harness.submit(savedWith([FIRST_FINISH, FIRST_CLEAR]));
      await flush();

      expect(harness.renders).toHaveLength(2);
      expect(harness.last().toasts.shown.map(({ content }) => content)).toEqual([
        {
          kind: 'achievement',
          achievement: FIRST_FINISH,
        },
        {
          kind: 'achievement',
          achievement: FIRST_CLEAR,
        },
      ]);
    });

    it('draws nothing for an empty list', async () => {
      const harness = await withAchievements([]);

      expect(harness.renders).toHaveLength(1);
    });

    it('ignores a submission result that arrives after close', async () => {
      const harness = createHarness();
      harness.controller.close();

      harness.submit(savedWith([FIRST_FINISH]));
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

  describe('ranking toasts', () => {
    async function contentsAfter(submission: RankingSubmission) {
      const harness = createHarness();
      harness.submit(submission);
      await flush();
      return harness.last().toasts.shown.map(({ content }) => content);
    }

    it.each([1, 3, 20])(
      'shows TOP %i before the achievements when the best record enters the top',
      async (rank) => {
        expect(await contentsAfter(savedWith([FIRST_FINISH], rankedReview(rank, true)))).toEqual([
          {
            kind: 'ranking',
            rank,
          },
          {
            kind: 'achievement',
            achievement: FIRST_FINISH,
          },
        ]);
      },
    );

    it.each([
      ['a rank outside the top', rankedReview(21, true)],
      ['a record that is not a new best', rankedReview(1, false)],
      ['no visible ranking', UNRANKED],
    ])('shows only the achievements for %s', async (_case, review) => {
      expect(await contentsAfter(savedWith([FIRST_FINISH], review))).toEqual([
        {
          kind: 'achievement',
          achievement: FIRST_FINISH,
        },
      ]);
    });

    it('shows one pending toast for a play held for review', async () => {
      expect(await contentsAfter(savedWith([], { kind: 'pending' }))).toEqual([
        { kind: 'rankingPending' },
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

    it('requests the retry with the same origin and the song select with the retry difficulty', () => {
      const restore = {
        feed: new SongFeed(ALL_SONGS_QUERY, () => Promise.reject(new Error('Not used'))),
        index: 2,
        songId: SONG.id,
        difficulty: 'easy',
      } as const;
      const origin: PlayOrigin = {
        kind: 'songSelect',
        mode: 'practice',
        quitKey: 'confirm',
        start: { kind: 'whole' },
        restore,
      };
      const harness = createHarness(origin);
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
            origin,
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

    describe('from the editor', () => {
      const list = new SongFeed(ALL_SONGS_QUERY, () => Promise.reject(new Error('Not used')));
      const origin: PlayOrigin = {
        kind: 'chartEditor',
        mode: 'practice',
        quitKey: 'leave',
        start: {
          kind: 'from',
          timeMs: EDITOR_START_MS,
        },
        list,
      };
      const backToEditor = (difficulty: 'easy' | 'hard'): SceneRequest => ({
        key: 'chartEditor',
        data: {
          songId: SONG.id,
          list,
          chart: {
            laneCount: 4,
            difficulty,
          },
          resumeTimeMs: EDITOR_START_MS,
        },
      });

      it('retries the selected difficulty with the same origin', () => {
        const harness = createHarness(origin, 'none');
        harness.controller.selectDifficulty('hard');

        harness.controller.confirm();

        expect(harness.leaves).toEqual([
          {
            key: 'gameplay',
            data: {
              song: SONG,
              laneCount: 4,
              difficulty: 'hard',
              chartId: 'hard.json',
              origin,
            },
          },
        ]);
      });

      it('goes back to the played chart', () => {
        const harness = createHarness(origin, 'none');

        harness.controller.back();

        expect(harness.leaves).toEqual([backToEditor('easy')]);
      });

      it('goes back to the played difficulty when only the tab changed', () => {
        const harness = createHarness(origin, 'none');
        harness.controller.selectDifficulty('hard');

        harness.controller.back();

        expect(harness.leaves).toEqual([backToEditor('easy')]);
      });

      it('goes back to the difficulty a retry played', () => {
        const harness = createHarness(origin, 'none', {
          ...EASY,
          difficulty: 'hard',
          chartId: 'hard.json',
        });

        harness.controller.back();

        expect(harness.leaves).toEqual([backToEditor('hard')]);
      });
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

describe('ResultController sounds', () => {
  it('plays the click sound only when a click or a key changes the retry difficulty', () => {
    const harness = createHarness();

    harness.controller.stepDifficulty(1);
    harness.controller.stepDifficulty(1);
    harness.controller.selectDifficulty('easy');
    harness.controller.selectDifficulty('easy');

    expect(harness.last().retryChart.difficulty).toBe('easy');
    expect(harness.clickSoundCount()).toBe(2);
  });

  it('plays the click sound on Enter and the close sound on Esc', () => {
    const harness = createHarness();

    harness.controller.confirm();
    harness.controller.back();

    expect(harness.leaves).toHaveLength(2);
    expect(harness.clickSoundCount()).toBe(1);
    expect(harness.closeSoundCount()).toBe(1);
  });
});

describe('ResultController controls', () => {
  it('plays the click sound when H opens the controls', () => {
    const harness = createHarness();

    harness.controller.handleControlsKey(H_KEY);

    expect(harness.clickSoundCount()).toBe(1);
  });
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

describe('ResultController ranking notice', () => {
  const ENTER_KEY = {
    code: 'Enter',
    repeat: false,
  };

  async function withNotice(): Promise<Harness> {
    const harness = createHarness();
    harness.submit({ kind: 'rejected' });
    await flush();
    return harness;
  }

  it('opens the issue failure notice from the first render', () => {
    const harness = createHarness(undefined, 'issueFailed');

    expect(harness.renders).toHaveLength(1);
    expect(harness.last().rankingNotice).toBe('issueFailed');
  });

  it.each(['none', 'submitted'] as const)('opens no notice first for %s', (kind) => {
    const harness = createHarness(undefined, kind);

    expect(harness.last().rankingNotice).toBeNull();
  });

  it.each(['rejected', 'unknown'] as const)(
    'opens the %s notice when the submission arrives',
    async (kind) => {
      const harness = createHarness();

      harness.submit({ kind });
      await flush();

      expect(harness.renders).toHaveLength(2);
      expect(harness.last().rankingNotice).toBe(kind);
      expect(harness.last().toasts.shown).toEqual([]);
    },
  );

  it('opens no notice for a saved submission', async () => {
    const harness = await withAchievements([FIRST_FINISH]);

    expect(harness.last().rankingNotice).toBeNull();
  });

  it('ignores a failed submission that arrives after close', async () => {
    const harness = createHarness();
    harness.controller.close();

    harness.submit({ kind: 'unknown' });
    await flush();

    expect(harness.renders).toHaveLength(1);
  });

  it('closes the controls guide when the notice opens', async () => {
    const harness = createHarness();
    harness.controller.openControls();

    harness.submit({ kind: 'unknown' });
    await flush();

    expect(harness.last()).toMatchObject({
      isControlsOpen: false,
      rankingNotice: 'unknown',
    });
  });

  it.each([
    ['confirm', (controller: ResultController) => controller.confirm()],
    ['back', (controller: ResultController) => controller.back()],
  ])('only closes the notice on %s', async (_label, close) => {
    const harness = await withNotice();

    close(harness.controller);

    expect(harness.last().rankingNotice).toBeNull();
    expect(harness.leaves).toEqual([]);
    close(harness.controller);
    expect(harness.leaves).toHaveLength(1);
  });

  it('ignores menu, difficulty and controls input while open and passes Enter and Esc on', async () => {
    const harness = await withNotice();
    const state = harness.last();

    harness.controller.moveFocus(1);
    harness.controller.stepDifficulty(1);
    harness.controller.selectDifficulty('hard');
    harness.controller.openControls();

    expect(harness.controller.handleControlsKey(H_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(ENTER_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.last()).toBe(state);
    expect(harness.leaves).toEqual([]);
    expect(harness.focusSoundCount()).toBe(0);
  });

  it('closes with the notice button and releases its hover', async () => {
    const harness = await withNotice();

    harness.controller.pointerOver('noticeClose');
    harness.controller.pointerDown('noticeClose');
    harness.controller.pointerUp('noticeClose');

    expect(harness.last()).toMatchObject({
      rankingNotice: null,
      hover: null,
    });
    expect(harness.leaves).toEqual([]);
  });

  it('hands an unanswered submission to the profile so its toasts show on return', async () => {
    const harness = createHarness();
    const openProfile = (): void => {
      harness.controller.pointerDown('accountProfile');
      harness.controller.pointerUp('accountProfile');
    };

    openProfile();
    expect(harness.profileRankings().at(-1)).toMatchObject({ kind: 'submitted' });

    harness.submit({ kind: 'unknown' });
    await Promise.resolve();
    harness.controller.pointerDown('noticeClose');
    harness.controller.pointerUp('noticeClose');
    openProfile();
    expect(harness.profileRankings().at(-1)).toEqual({ kind: 'none' });
  });

  it('shows the toasts of a submission answered while the profile was open', async () => {
    const submission = Promise.resolve<RankingSubmission>({ kind: 'unknown' });
    const renders: ResultState[] = [];
    new ResultController(
      {
        render: (_previous, next) => renders.push(next),
        playSound: () => undefined,
        leave: () => undefined,
        openProfile: () => undefined,
      },
      EASY,
      {
        kind: 'songSelect',
        mode: 'standard',
        quitKey: 'confirm',
        start: { kind: 'whole' },
      },
      {
        kind: 'submitted',
        submission,
      },
      { kind: 'graded' },
    );
    await submission;
    await Promise.resolve();

    expect(renders.at(-1)?.rankingNotice).toBe('unknown');
  });

  it('keeps the retry chart on a section report', () => {
    const harness = createHarness(undefined, 'none', EASY, {
      kind: 'section',
      startTimeMs: 5000,
      endTimeMs: 60000,
      noteCount: 26,
      totalNoteCount: 116,
    });
    const renderCount = harness.renders.length;

    harness.controller.stepDifficulty(1);

    expect(harness.renders).toHaveLength(renderCount);
    expect(harness.clickSoundCount()).toBe(0);
  });

  it('opens the profile from the account panel', () => {
    const harness = createHarness();

    harness.controller.pointerDown('accountProfile');
    harness.controller.pointerUp('accountProfile');
    expect(harness.profileOpenCount()).toBe(1);
    expect(harness.leaves).toEqual([]);
    expect(harness.clickSoundCount()).toBe(1);
  });
});
