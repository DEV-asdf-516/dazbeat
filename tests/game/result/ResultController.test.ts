import { describe, expect, it, vi } from 'vitest';
import { AccountRejoinBlockedError } from '../../../src/data/account.js';
import type { AuthUser } from '../../../src/data/account.js';
import { parseNickname } from '../../../src/data/nickname.js';
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
  charts: {
    4: {
      easy: {
        id: 'easy.json',
        level: 1,
      },
      hard: {
        id: 'hard.json',
        level: 1,
      },
    },
  },
};
const EASY: ChartRef = {
  song: SONG,
  laneCount: 4,
  difficulty: 'easy',
  chartId: 'easy.json',
  level: 1,
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
  signInCount(): number;
  markShownCount(): number;
  accountRenderCount(): number;
  leave(): void;
}

interface GuestNoticeSetup {
  readonly isShown: boolean;
  readonly signIn: () => Promise<AuthUser | null>;
}

const USER: AuthUser = {
  id: 'user1',
  email: 'player@example.com',
  nickname: requireDefined(parseNickname('Star'), 'Invalid test nickname', 'Star'),
  isEditor: false,
  featuredAchievement: null,
};

const SHOWN_GUEST_NOTICE: GuestNoticeSetup = {
  isShown: true,
  signIn: () => Promise.resolve(null),
};

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
  guestNotice: GuestNoticeSetup = SHOWN_GUEST_NOTICE,
): Harness {
  let signInCount = 0;
  let markShownCount = 0;
  let accountRenderCount = 0;
  const renders: { previous: ResultState | null; next: ResultState }[] = [];
  const leaves: SceneRequest[] = [];
  const sounds: SoundEffect[] = [];
  let profileOpenCount = 0;
  let isLeaving = false;
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
      renderAccount: () => {
        accountRenderCount += 1;
      },
      isLeaving: () => isLeaving,
    },
    played,
    origin,
    ranking,
    report,
    {
      isShown: () => guestNotice.isShown,
      markShown: () => {
        markShownCount += 1;
      },
      signIn: () => {
        signInCount += 1;
        return guestNotice.signIn();
      },
    },
  );
  controller.start();
  return {
    controller,
    renders,
    leaves,
    leave: () => {
      isLeaving = true;
    },
    profileOpenCount: () => profileOpenCount,
    profileRankings: () => profileRankings,
    focusSoundCount: () => sounds.filter((sound) => sound === 'menuFocus').length,
    clickSoundCount: () => sounds.filter((sound) => sound === 'click').length,
    closeSoundCount: () => sounds.filter((sound) => sound === 'close').length,
    last: () => requireDefined(renders.at(-1), 'Missing render', renders.length).next,
    submit: (submitted) => resolve(submitted),
    signInCount: () => signInCount,
    markShownCount: () => markShownCount,
    accountRenderCount: () => accountRenderCount,
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

    it('shows no toast for an empty list', async () => {
      const harness = await withAchievements([]);

      expect(harness.last().toasts).toBe(harness.renders[0]?.next.toasts);
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

      harness.controller.moveFocus('next');
      harness.controller.moveFocus('next');

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
      harness.controller.stepDifficulty('next');

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
            level: 1,
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
              level: 1,
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

    it('keeps the retry chart when a difficulty tab is selected while leaving', () => {
      const harness = createHarness();
      harness.leave();
      const renderCount = harness.renders.length;

      harness.controller.selectDifficulty('hard');

      expect(harness.renders).toHaveLength(renderCount);
      expect(harness.last().retryChart.chartId).toBe('easy.json');
      expect(harness.clickSoundCount()).toBe(0);
    });

    it('changes the retry chart by selecting and stepping difficulties', () => {
      const harness = createHarness();

      harness.controller.selectDifficulty('hard');
      expect(harness.last().retryChart.chartId).toBe('hard.json');

      harness.controller.stepDifficulty('previous');
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

    harness.controller.stepDifficulty('next');
    harness.controller.stepDifficulty('next');
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
    expect(harness.last().controls).toBe('open');
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.last().controls).toBe('closed');
    harness.controller.handleControlsKey(H_KEY);
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(harness.last().controls).toBe('closed');
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
    expect(harness.last().controls).toBe('open');

    harness.controller.pointerDown('controlsClose');
    harness.controller.pointerUp('controlsClose');
    expect(harness.last().controls).toBe('closed');

    harness.controller.handleControlsKey(H_KEY);
    harness.controller.pointerDown('controlsBackdrop');
    harness.controller.pointerUp('controlsBackdrop');
    expect(harness.last().controls).toBe('closed');
  });

  it('releases the hover of the close button when the controls close', () => {
    const harness = createHarness();
    harness.controller.handleControlsKey(H_KEY);
    harness.controller.pointerOver('controlsClose');

    harness.controller.handleControlsKey(ESCAPE_KEY);

    expect(harness.last().hover).toBeNull();
  });
});

describe('ResultController ranking notice', () => {
  const enterKey = {
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
    harness.controller.handleControlsKey(H_KEY);

    harness.submit({ kind: 'unknown' });
    await flush();

    expect(harness.last()).toMatchObject({
      controls: 'closed',
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

    harness.controller.moveFocus('next');
    harness.controller.stepDifficulty('next');

    expect(harness.controller.handleControlsKey(H_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(enterKey)).toBe(false);
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
        renderAccount: () => undefined,
        isLeaving: () => false,
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
      {
        isShown: () => true,
        markShown: () => undefined,
        signIn: () => Promise.resolve(null),
      },
    ).start();
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

    harness.controller.stepDifficulty('next');

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

describe('ResultController record status', () => {
  it.each([
    ['submitted', 'checking'],
    ['local', 'none'],
    ['none', 'none'],
    ['issueFailed', 'none'],
  ] as const)('shows %s as %s from the first render', (rankingKind, recordStatus) => {
    const harness = createHarness(undefined, rankingKind);

    expect(harness.renders).toHaveLength(1);
    expect(harness.last().recordStatus).toBe(recordStatus);
  });

  it('stops checking and queues the toasts when a saved submission arrives', async () => {
    const harness = await withAchievements([FIRST_FINISH]);

    expect(harness.last().recordStatus).toBe('none');
    expect(harness.last().toasts.shown).toHaveLength(1);
  });

  it('stops checking when a saved submission arrives without toasts', async () => {
    const harness = await withAchievements([]);

    expect(harness.renders).toHaveLength(2);
    expect(harness.last().recordStatus).toBe('none');
  });

  it.each(['rejected', 'unknown'] as const)(
    'stops checking and opens the %s notice',
    async (kind) => {
      const harness = createHarness();

      harness.submit({ kind });
      await flush();

      expect(harness.last()).toMatchObject({
        recordStatus: 'none',
        rankingNotice: kind,
      });
    },
  );

  it.each([
    ['local', false, { kind: 'local' }],
    ['issueFailed', true, { kind: 'none' }],
  ] as const)('hands %s to the profile', (rankingKind, hasNotice, expected) => {
    const harness = createHarness(undefined, rankingKind);
    if (hasNotice) {
      harness.controller.pointerDown('noticeClose');
      harness.controller.pointerUp('noticeClose');
    }

    harness.controller.pointerDown('accountProfile');
    harness.controller.pointerUp('accountProfile');

    expect(harness.profileRankings()).toEqual([expected]);
  });
});

describe('ResultController guest notice', () => {
  const standardOrigin: PlayOrigin = {
    kind: 'songSelect',
    mode: 'standard',
    quitKey: 'confirm',
    start: { kind: 'whole' },
  };

  function createGuestHarness(
    signIn: () => Promise<AuthUser | null> = () => Promise.resolve(null),
    rankingKind: ResultRanking['kind'] = 'local',
    isShown = false,
  ): Harness {
    return createHarness(
      standardOrigin,
      rankingKind,
      EASY,
      { kind: 'graded' },
      {
        isShown,
        signIn,
      },
    );
  }

  it('opens once on the first local record and marks it shown', () => {
    const harness = createGuestHarness();

    expect(harness.last().isGuestNoticeOpen).toBe(true);
    expect(harness.markShownCount()).toBe(1);
  });

  it.each([
    ['an already shown notice', 'local', true],
    ['a run without a saved record', 'none', false],
    ['a signed-in submission', 'submitted', false],
    ['a failed session issue', 'issueFailed', false],
  ] as const)('stays closed for %s', (_label, rankingKind, isShown) => {
    const harness = createGuestHarness(undefined, rankingKind, isShown);

    expect(harness.last().isGuestNoticeOpen).toBe(false);
    expect(harness.markShownCount()).toBe(0);
  });

  it('closes on later without signing in', () => {
    const harness = createGuestHarness();

    harness.controller.pointerDown('guestNoticeLater');
    harness.controller.pointerUp('guestNoticeLater');

    expect(harness.last().isGuestNoticeOpen).toBe(false);
    expect(harness.signInCount()).toBe(0);
    expect(harness.closeSoundCount()).toBe(1);
  });

  it('closes on back without leaving the result', () => {
    const harness = createGuestHarness();

    harness.controller.back();

    expect(harness.last().isGuestNoticeOpen).toBe(false);
    expect(harness.leaves).toEqual([]);
    expect(harness.signInCount()).toBe(0);
  });

  it('signs in from confirm and renders the account once signed in', async () => {
    const harness = createGuestHarness(() => Promise.resolve(USER));

    harness.controller.confirm();

    expect(harness.signInCount()).toBe(1);
    expect(harness.last().isGuestNoticeOpen).toBe(false);
    expect(harness.leaves).toEqual([]);
    await flush();
    expect(harness.accountRenderCount()).toBe(1);
  });

  it.each([
    ['is cancelled', () => Promise.resolve(null), 'none'],
    ['fails', () => Promise.reject(new Error('popup closed')), 'failed'],
  ] as const)('closes the notice when sign-in %s', async (_label, signIn, failure) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createGuestHarness(signIn);

    harness.controller.pointerDown('guestNoticeSignIn');
    harness.controller.pointerUp('guestNoticeSignIn');
    await flush();

    expect(harness.signInCount()).toBe(1);
    expect(harness.last().isGuestNoticeOpen).toBe(false);
    expect(harness.last().signInFailure).toBe(failure);
    consoleError.mockRestore();
  });

  it('ignores menu and difficulty keys while open', () => {
    const harness = createGuestHarness();
    const before = harness.last();

    harness.controller.moveFocus('next');
    harness.controller.stepDifficulty('next');

    expect(harness.last()).toBe(before);
  });

  it('ignores a sign-in that finishes after the result closed', async () => {
    const harness = createGuestHarness(() => Promise.resolve(USER));

    harness.controller.confirm();
    harness.controller.close();
    await flush();

    expect(harness.accountRenderCount()).toBe(0);
  });
});

describe('ResultController sign-in failure', () => {
  const origin: PlayOrigin = {
    kind: 'songSelect',
    mode: 'standard',
    quitKey: 'confirm',
    start: { kind: 'whole' },
  };
  const enterKey = {
    code: 'Enter',
    repeat: false,
  };
  const escapeKey = {
    code: 'Escape',
    repeat: false,
  };
  const downKey = {
    code: 'ArrowDown',
    repeat: false,
  };

  function signInHarness() {
    const rejects: ((error: unknown) => void)[] = [];
    const harness = createHarness(
      origin,
      'none',
      EASY,
      { kind: 'graded' },
      {
        isShown: true,
        signIn: () =>
          new Promise<AuthUser | null>((_resolve, reject) => {
            rejects.push(reject);
          }),
      },
    );
    return {
      harness,
      clickSignIn: () => {
        harness.controller.pointerDown('accountSignIn');
        harness.controller.pointerUp('accountSignIn');
      },
      reject: (index: number, error: unknown) =>
        requireDefined(rejects[index], 'Missing sign-in', index)(error),
    };
  }

  async function failedHarness(): Promise<Harness> {
    const { harness, clickSignIn, reject } = signInHarness();
    clickSignIn();
    reject(0, new Error('popup closed'));
    await flush();
    return harness;
  }

  it.each([
    ['an error', new Error('popup closed'), 'failed'],
    [
      'a deleted account',
      new AccountRejoinBlockedError(new Error('account_rejoin_blocked')),
      'rejoinBlocked',
    ],
  ] as const)(
    'opens the popup when the sign-in is rejected with %s',
    async (_name, error, kind) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { harness, clickSignIn, reject } = signInHarness();
      clickSignIn();

      reject(0, error);
      await flush();

      expect(harness.last().signInFailure).toBe(kind);
      expect(consoleError).toHaveBeenCalledOnce();
      consoleError.mockRestore();
    },
  );

  it('closes with its button, releases its hover and plays the close sound', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();
    const closeSounds = harness.closeSoundCount();

    harness.controller.pointerOver('signInFailureClose');
    harness.controller.pointerDown('signInFailureClose');
    harness.controller.pointerUp('signInFailureClose');

    expect(harness.last().signInFailure).toBe('none');
    expect(harness.last().hover).toBeNull();
    expect(harness.closeSoundCount()).toBe(closeSounds + 1);
    consoleError.mockRestore();
  });

  it.each([
    ['Enter', enterKey],
    ['Esc', escapeKey],
  ] as const)('closes with %s without leaving', async (_name, key) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();

    expect(harness.controller.captureKey(key)).toBe(true);
    expect(harness.last().signInFailure).toBe('none');
    expect(harness.leaves).toEqual([]);
    expect(harness.controller.captureKey(key)).toBe(false);
    consoleError.mockRestore();
  });

  it('blocks other keys without changing the state', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();
    const failed = harness.last();

    expect(harness.controller.captureKey(downKey)).toBe(true);
    expect(harness.last()).toBe(failed);
    consoleError.mockRestore();
  });

  it('ignores a rejection that arrives after closing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { harness, clickSignIn, reject } = signInHarness();
    clickSignIn();
    harness.controller.close();
    const renderCount = harness.renders.length;

    reject(0, new Error('popup closed'));
    await flush();

    expect(harness.renders).toHaveLength(renderCount);
    consoleError.mockRestore();
  });

  it('ignores a late rejection of an earlier attempt', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { harness, clickSignIn, reject } = signInHarness();
    clickSignIn();
    clickSignIn();

    reject(0, new Error('popup closed'));
    await flush();

    expect(harness.last().signInFailure).toBe('none');

    reject(1, new Error('popup closed'));
    await flush();

    expect(harness.last().signInFailure).toBe('failed');
    consoleError.mockRestore();
  });
});
