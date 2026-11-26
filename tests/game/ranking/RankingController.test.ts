import { describe, expect, it, vi } from 'vitest';
import { AccountRejoinBlockedError } from '../../../src/data/account.js';
import type { AuthUser } from '../../../src/data/account.js';
import { parseNickname } from '../../../src/data/nickname.js';
import { RankingRequestError } from '../../../src/data/ranking.js';
import type { Leaderboard, LeaderboardEntry } from '../../../src/data/ranking.js';
import type { ChartRef, Song } from '../../../src/data/songs.js';
import { RankingController } from '../../../src/game/ranking/RankingController.js';
import {
  getMyRankView,
  getRankingNotice,
  getRankingRows,
} from '../../../src/game/ranking/state/rankingState.js';
import type { RankingState } from '../../../src/game/ranking/state/rankingState.js';
import type { SoundEffect } from '../../../src/game/ui/view/soundEffects.js';
import { requireDefined } from '../../../src/invariant.js';

const SONG: Song = {
  id: 'song-1',
  title: 'Song 1',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/song-1/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 0,
  gameEndMs: 30000,
  charts: {
    4: {
      easy: {
        id: 'easy-4',
        level: 1,
      },
      normal: {
        id: 'normal-4',
        level: 1,
      },
      hard: {
        id: 'hard-4',
        level: 1,
      },
    },
  },
};
const EASY: ChartRef = {
  song: SONG,
  laneCount: 4,
  difficulty: 'easy',
  chartId: 'easy-4',
  level: 1,
};
const WHEEL_STEP_PX = 100;

function entryOf(rank: number, isMe = false): LeaderboardEntry {
  return {
    rank,
    nickname: `player${rank}`,
    featuredAchievement: null,
    score: 1000000 - rank,
    accuracy: 0.9,
    isMe,
  };
}

function boardOf(chartId: string, fields: Partial<Leaderboard> = {}): Leaderboard {
  return {
    chartId,
    chartRevision: 'rev-1',
    totalPlayers: 1,
    top: [entryOf(1)],
    me: null,
    hasPreviousRevisionRecord: false,
    ...fields,
  };
}

interface PendingRequest {
  readonly chartId: string;
  resolve(board: Leaderboard): void;
  reject(error: unknown): void;
}

const USER: AuthUser = {
  id: 'user1',
  email: 'player@example.com',
  nickname: requireDefined(parseNickname('Star'), 'Invalid test nickname', 'Star'),
  isEditor: false,
  featuredAchievement: null,
};

function createHarness(
  isSignedIn = true,
  notices = new Map<string, string>(),
  signIn: () => Promise<AuthUser | null> = () => Promise.resolve(null),
) {
  const requests: PendingRequest[] = [];
  const renders: RankingState[] = [];
  const sounds: SoundEffect[] = [];
  let backCount = 0;
  let profileOpenCount = 0;
  let accountRenderCount = 0;
  const controller = new RankingController(
    {
      loadLeaderboard: (chartId) =>
        new Promise((resolve, reject) => {
          requests.push({
            chartId,
            resolve,
            reject,
          });
        }),
      isSignedIn: () => isSignedIn,
      loadRevisionNotices: () => notices,
      saveRevisionNotice: (chartId, chartRevision) => {
        notices.set(chartId, chartRevision);
      },
      signIn,
    },
    {
      render: (_previous, next) => renders.push(next),
      playSound: (sound) => sounds.push(sound),
      back: () => {
        backCount += 1;
      },
      openProfile: () => {
        profileOpenCount += 1;
      },
      renderAccount: () => {
        accountRenderCount += 1;
      },
    },
    EASY,
    WHEEL_STEP_PX,
  );
  controller.start();
  return {
    controller,
    notices,
    requests,
    renders,
    sounds,
    backCount: () => backCount,
    profileOpenCount: () => profileOpenCount,
    accountRenderCount: () => accountRenderCount,
    last: () => requireDefined(renders.at(-1), 'Missing render', renders.length),
    request: (index: number) => requireDefined(requests[index], 'Missing request', index),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function loaded(
  board: Leaderboard = boardOf('easy-4'),
  isSignedIn = true,
  notices = new Map<string, string>(),
) {
  const harness = createHarness(isSignedIn, notices);
  harness.request(0).resolve(board);
  await flush();
  return harness;
}

describe('RankingController', () => {
  describe('loading', () => {
    it('requests the chart it opened with and shows the loaded board', async () => {
      const harness = createHarness();
      expect(harness.requests.map(({ chartId }) => chartId)).toEqual(['easy-4']);
      expect(getRankingNotice(harness.last())).toBe('loading');

      harness.request(0).resolve(boardOf('easy-4'));
      await flush();

      expect(harness.last().load).toEqual({
        kind: 'loaded',
        board: boardOf('easy-4'),
      });
      expect(getRankingNotice(harness.last())).toBe('none');
    });

    it('tells an empty board apart', async () => {
      const harness = await loaded(
        boardOf('easy-4', {
          top: [],
          totalPlayers: 0,
        }),
      );

      expect(getRankingNotice(harness.last())).toBe('empty');
    });
  });

  describe('difficulty', () => {
    it('requests another chart with a click and ignores the same tab', async () => {
      const harness = await loaded();

      harness.controller.selectDifficulty('normal');
      expect(harness.requests.map(({ chartId }) => chartId)).toEqual(['easy-4', 'normal-4']);
      expect(harness.last().load).toEqual({ kind: 'loading' });
      expect(harness.sounds).toEqual(['click']);

      harness.controller.selectDifficulty('normal');
      expect(harness.requests).toHaveLength(2);
      expect(harness.sounds).toEqual(['click']);
    });

    it('stops at the edge tab', async () => {
      const harness = await loaded();

      harness.controller.handleMenuKey('left');

      expect(harness.requests).toHaveLength(1);
      expect(harness.sounds).toEqual([]);
      harness.controller.handleMenuKey('nextTab');
      expect(harness.last().chart.difficulty).toBe('normal');
    });

    it('drops the late response of the previous tab', async () => {
      const harness = createHarness();
      harness.controller.handleMenuKey('right');

      harness.request(0).resolve(boardOf('easy-4'));
      await flush();
      expect(harness.last().load).toEqual({ kind: 'loading' });

      harness.request(1).resolve(boardOf('normal-4'));
      await flush();
      expect(harness.last().load).toEqual({
        kind: 'loaded',
        board: boardOf('normal-4'),
      });
    });
  });

  describe('dialogs', () => {
    it('retries the same chart from the failed dialog', async () => {
      const harness = createHarness();
      harness.request(0).reject(new RankingRequestError('failed', undefined));
      await flush();
      expect(harness.last().dialog).toBe('failed');

      harness.controller.handleMenuKey('up');
      expect(harness.last().topRow).toBe(0);
      harness.controller.handleMenuKey('confirm');

      expect(harness.last().dialog).toBe('none');
      expect(harness.requests.map(({ chartId }) => chartId)).toEqual(['easy-4', 'easy-4']);
      expect(harness.sounds).toEqual(['click']);
    });

    it('goes back from the failed dialog', async () => {
      const harness = createHarness();
      harness.request(0).reject(new Error('network'));
      await flush();

      harness.controller.handleMenuKey('back');
      harness.controller.handleMenuKey('back');

      expect(harness.backCount()).toBe(1);
      expect(harness.sounds).toEqual(['close']);
    });

    it('offers only BACK for a chart that cannot be shown', async () => {
      const harness = createHarness();
      harness.request(0).reject(new RankingRequestError('notFound', undefined));
      await flush();
      expect(harness.last().dialog).toBe('unavailable');

      harness.controller.pointerDown('dialogAccept');
      harness.controller.pointerUp('dialogAccept');

      expect(harness.backCount()).toBe(1);
      expect(harness.requests).toHaveLength(1);
    });

    it('notices a revised chart once per visit', async () => {
      const revised = boardOf('easy-4', { hasPreviousRevisionRecord: true });
      const harness = await loaded(revised);
      expect(harness.last().dialog).toBe('revised');

      harness.controller.handleMenuKey('confirm');
      expect(harness.last().dialog).toBe('none');
      expect(harness.sounds).toEqual(['click']);
      harness.controller.selectDifficulty('normal');
      harness.request(1).resolve(boardOf('normal-4'));
      harness.controller.selectDifficulty('easy');
      harness.request(2).resolve(revised);
      await flush();

      expect(harness.last().chart.chartId).toBe('easy-4');
      expect(harness.last().load.kind).toBe('loaded');
      expect(harness.last().dialog).toBe('none');
    });

    it('remembers the confirmed revision across visits and notices a newer one', async () => {
      const revised = boardOf('easy-4', { hasPreviousRevisionRecord: true });
      const first = await loaded(revised);
      first.controller.handleMenuKey('confirm');
      expect(first.notices).toEqual(new Map([['easy-4', 'rev-1']]));

      const again = await loaded(revised, true, first.notices);
      expect(again.last().dialog).toBe('none');

      const newer = await loaded(
        boardOf('easy-4', {
          hasPreviousRevisionRecord: true,
          chartRevision: 'rev-2',
        }),
        true,
        first.notices,
      );
      expect(newer.last().dialog).toBe('revised');
    });

    it('does not remember a revision notice left open', async () => {
      const harness = await loaded(boardOf('easy-4', { hasPreviousRevisionRecord: true }));

      expect(harness.last().dialog).toBe('revised');
      expect(harness.notices.size).toBe(0);
    });
  });

  describe('scroll', () => {
    const top = Array.from({ length: 20 }, (_, index) => entryOf(index + 1));

    it('scrolls by keys and wheel within the board', async () => {
      const harness = await loaded(
        boardOf('easy-4', {
          top,
          totalPlayers: 20,
        }),
      );

      harness.controller.handleMenuKey('up');
      expect(harness.last().topRow).toBe(0);
      harness.controller.handleMenuKey('down');
      expect(harness.last().topRow).toBe(1);
      harness.controller.scrollByWheel(WHEEL_STEP_PX * 30, 0);
      expect(harness.last().topRow).toBe(12);
    });

    it('does not scroll while a dialog is open', async () => {
      const harness = await loaded(
        boardOf('easy-4', {
          top,
          totalPlayers: 20,
          hasPreviousRevisionRecord: true,
        }),
      );

      harness.controller.handleMenuKey('down');
      harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);

      expect(harness.last().topRow).toBe(0);
    });
  });

  describe('MY RANK', () => {
    it('asks a guest to sign in', async () => {
      const harness = await loaded(boardOf('easy-4'), false);

      expect(getMyRankView(harness.last())).toEqual({ kind: 'guest' });
    });

    it('shows no record for a signed-in player without one', async () => {
      const harness = await loaded();

      expect(getMyRankView(harness.last())).toEqual({ kind: 'none' });
    });

    it('shows my rank', async () => {
      const harness = await loaded(
        boardOf('easy-4', {
          me: {
            rank: 34,
            nickname: 'me',
            featuredAchievement: null,
            score: 212700,
            accuracy: 0.8641,
          },
        }),
      );

      expect(getMyRankView(harness.last())).toEqual({
        kind: 'ranked',
        rank: '34',
        nickname: 'me',
        featuredAchievement: null,
        score: 212700,
        accuracy: 0.8641,
      });
    });

    it.each([
      [100, '100'],
      [101, '100+'],
    ])('shows rank %i as %s', async (rank, expected) => {
      const harness = await loaded(
        boardOf('easy-4', {
          me: {
            rank,
            nickname: 'me',
            featuredAchievement: null,
            score: 1000,
            accuracy: 0.5,
          },
        }),
      );

      expect(getMyRankView(harness.last())).toMatchObject({ rank: expected });
    });
  });

  describe('my row', () => {
    const topWithMeAt = (myRank: number) =>
      Array.from({ length: 20 }, (_, index) => entryOf(index + 1, index + 1 === myRank));

    it.each([
      [1, 0],
      [8, 0],
      [9, 4],
      [10, 5],
      [15, 10],
      [20, 12],
    ])('brings rank %i into view from row %i', async (myRank, topRow) => {
      const harness = await loaded(
        boardOf('easy-4', {
          top: topWithMeAt(myRank),
          totalPlayers: 20,
        }),
      );

      expect(harness.last().topRow).toBe(topRow);
      const rows = getRankingRows(harness.last());
      expect(rows.find((row) => row.isMe)).toMatchObject({
        rank: myRank,
        hasTopBadge: true,
      });
      expect(rows.find((row) => !row.isMe && row.tier === 'plain')?.hasTopBadge).toBe(false);
    });

    it.each([
      [31, '31'],
      [101, '100+'],
    ])('adds rank %i below the top 20 as %s and scrolls to it', async (rank, label) => {
      const harness = await loaded(
        boardOf('easy-4', {
          top: topWithMeAt(0),
          totalPlayers: 200,
          me: {
            rank,
            nickname: 'me',
            featuredAchievement: null,
            score: 1000,
            accuracy: 0.5,
          },
        }),
      );

      expect(harness.last().topRow).toBe(13);
      const rows = getRankingRows(harness.last());
      expect(rows).toHaveLength(8);
      expect(rows.at(-1)).toMatchObject({
        nickname: 'me',
        isMe: true,
        tier: 'none',
        outsideTopRank: label,
      });
      expect(rows.at(0)?.outsideTopRank).toBeNull();
      harness.controller.scrollByWheel(WHEEL_STEP_PX * 30, 0);
      expect(harness.last().topRow).toBe(13);
    });

    it('does not add my row twice when I am inside the top 20', async () => {
      const harness = await loaded(
        boardOf('easy-4', {
          top: topWithMeAt(3),
          totalPlayers: 20,
          me: {
            rank: 3,
            nickname: 'player3',
            featuredAchievement: null,
            score: 1000,
            accuracy: 0.5,
          },
        }),
      );

      harness.controller.scrollByWheel(WHEEL_STEP_PX * 30, 0);
      expect(harness.last().topRow).toBe(12);
    });

    it('adds no row for a guest or a player without a record', async () => {
      const harness = await loaded(
        boardOf('easy-4', {
          top: topWithMeAt(0),
          totalPlayers: 20,
        }),
      );

      harness.controller.scrollByWheel(WHEEL_STEP_PX * 30, 0);
      expect(harness.last().topRow).toBe(12);
    });
  });

  describe('controls guide and dialog', () => {
    const hKey = {
      code: 'KeyH',
      repeat: false,
    };

    it('does not open the controls guide while a dialog is open', async () => {
      const harness = createHarness();
      harness.request(0).reject(new RankingRequestError('failed', undefined));
      await flush();
      const rendered = harness.renders.length;
      const sounds = harness.sounds.length;

      harness.controller.handleControlsKey(hKey);

      expect(harness.last().controls).toBe('closed');
      expect(harness.last().dialog).toBe('failed');
      expect(harness.sounds).toHaveLength(sounds);
      expect(harness.renders.slice(rendered).every((state) => state.controls === 'closed')).toBe(
        true,
      );
    });

    it('does not scroll behind the controls guide', async () => {
      const harness = await loaded(
        boardOf('easy-4', {
          top: Array.from({ length: 20 }, (_, index) => entryOf(index + 1)),
          totalPlayers: 20,
        }),
      );
      harness.controller.handleControlsKey(hKey);

      harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);

      expect(harness.last().topRow).toBe(0);
    });

    it('closes the controls guide when a response opens a dialog', async () => {
      const harness = createHarness();
      harness.controller.handleControlsKey(hKey);
      expect(harness.last().controls).toBe('open');

      harness.request(0).reject(new RankingRequestError('failed', undefined));
      await flush();

      expect(harness.last().controls).toBe('closed');
      expect(harness.last().dialog).toBe('failed');
    });
  });

  it('renders nothing for a response that arrives after close', async () => {
    const harness = createHarness();
    harness.controller.close();

    harness.request(0).resolve(boardOf('easy-4'));
    await flush();

    expect(harness.renders).toHaveLength(1);
  });

  it('opens the profile from the account panel', async () => {
    const harness = await loaded();

    harness.controller.pointerDown('accountProfile');
    harness.controller.pointerUp('accountProfile');
    expect(harness.profileOpenCount()).toBe(1);

    expect(harness.backCount()).toBe(0);
    expect(harness.sounds).toEqual(['click']);
  });

  it('signs in from the guest account button and reloads the board as the account', async () => {
    const harness = createHarness(false, new Map(), () => Promise.resolve(USER));
    harness.request(0).resolve(boardOf('easy-4'));
    await flush();

    harness.controller.pointerOver('accountSignIn');
    harness.controller.pointerDown('accountSignIn');
    harness.controller.pointerUp('accountSignIn');
    expect(harness.sounds).toEqual(['click']);
    await flush();

    expect(harness.accountRenderCount()).toBe(1);
    expect(harness.last()).toMatchObject({
      isSignedIn: true,
      load: { kind: 'loading' },
      hover: null,
    });
    expect(harness.request(1).chartId).toBe('easy-4');
  });

  it('keeps the guest board when sign-in is cancelled', async () => {
    const harness = await loaded(boardOf('easy-4'), false);

    harness.controller.pointerDown('accountSignIn');
    harness.controller.pointerUp('accountSignIn');
    await flush();

    expect(harness.accountRenderCount()).toBe(0);
    expect(harness.last().isSignedIn).toBe(false);
    expect(harness.requests).toHaveLength(1);
  });
});

describe('RankingController sign-in failure', () => {
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
  const top = Array.from({ length: 20 }, (_, index) => entryOf(index + 1));

  interface PendingSignIn {
    reject(error: unknown): void;
  }

  async function signInHarness() {
    const signIns: PendingSignIn[] = [];
    const harness = createHarness(
      false,
      new Map(),
      () =>
        new Promise<AuthUser | null>((_resolve, reject) => {
          signIns.push({ reject });
        }),
    );
    harness.request(0).resolve(
      boardOf('easy-4', {
        top: top,
        totalPlayers: 20,
      }),
    );
    await flush();
    return {
      ...harness,
      clickSignIn: () => {
        harness.controller.pointerDown('accountSignIn');
        harness.controller.pointerUp('accountSignIn');
      },
      signIn: (index: number) => requireDefined(signIns[index], 'Missing sign-in', index),
    };
  }

  async function failedHarness() {
    const harness = await signInHarness();
    harness.clickSignIn();
    harness.signIn(0).reject(new Error('popup closed'));
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
      const harness = await signInHarness();
      harness.clickSignIn();

      harness.signIn(0).reject(error);
      await flush();

      expect(harness.last().signInFailure).toBe(kind);
      expect(harness.last().dialog).toBe('none');
      expect(harness.requests).toHaveLength(1);
      expect(consoleError).toHaveBeenCalledOnce();
      consoleError.mockRestore();
    },
  );

  it('opens no popup when the sign-in is cancelled', async () => {
    const harness = await loaded(boardOf('easy-4'), false);

    harness.controller.pointerDown('accountSignIn');
    harness.controller.pointerUp('accountSignIn');
    await flush();

    expect(harness.last().signInFailure).toBe('none');
  });

  it('closes with its button, releases its hover and plays the close sound', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();

    harness.controller.pointerOver('signInFailureClose');
    harness.controller.pointerDown('signInFailureClose');
    harness.controller.pointerUp('signInFailureClose');

    expect(harness.last().signInFailure).toBe('none');
    expect(harness.last().hover).toBeNull();
    expect(harness.sounds.at(-1)).toBe('close');
    consoleError.mockRestore();
  });

  it.each([
    ['Enter', enterKey],
    ['Esc', escapeKey],
  ] as const)('closes with %s', async (_name, key) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();

    expect(harness.controller.captureKey(key)).toBe(true);
    expect(harness.last().signInFailure).toBe('none');
    expect(harness.controller.captureKey(key)).toBe(false);
    consoleError.mockRestore();
  });

  it('blocks other keys and wheels without changing the state', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await failedHarness();
    const failed = harness.last();

    expect(harness.controller.captureKey(downKey)).toBe(true);
    harness.controller.scrollByWheel(WHEEL_STEP_PX * 3, 0);

    expect(harness.last()).toBe(failed);
    expect(failed.topRow).toBe(0);
    consoleError.mockRestore();
  });

  it('ignores a rejection that arrives after closing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await signInHarness();
    harness.clickSignIn();
    harness.controller.close();
    const renderCount = harness.renders.length;

    harness.signIn(0).reject(new Error('popup closed'));
    await flush();

    expect(harness.renders).toHaveLength(renderCount);
    consoleError.mockRestore();
  });

  it('ignores a late rejection of an earlier attempt', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await signInHarness();
    harness.clickSignIn();
    harness.clickSignIn();

    harness.signIn(0).reject(new Error('popup closed'));
    await flush();

    expect(harness.last().signInFailure).toBe('none');

    harness.signIn(1).reject(new Error('popup closed'));
    await flush();

    expect(harness.last().signInFailure).toBe('failed');
    consoleError.mockRestore();
  });
});
