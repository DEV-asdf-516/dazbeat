import { describe, expect, it, vi } from 'vitest';
import type {
  AchievementDefinition,
  AchievementId,
  AchievementSet,
  NamedAchievementDefinition,
} from '../../../src/data/achievements.js';
import { AccountDeletionError } from '../../../src/data/account.js';
import { parseNickname } from '../../../src/data/nickname.js';
import type { Nickname } from '../../../src/data/nickname.js';
import { ProfileRequestError } from '../../../src/data/profile.js';
import type { Profile, ProfileRequestErrorKind } from '../../../src/data/profile.js';
import { RankingRequestError } from '../../../src/data/ranking.js';
import type {
  RankedChart,
  RankedChartCursor,
  RankedChartQuery,
  RankedChartPage,
} from '../../../src/data/ranking.js';
import { ProfileController } from '../../../src/game/profile/ProfileController.js';
import type { ProfilePorts } from '../../../src/game/profile/ProfileController.js';
import type {
  ProfileButton,
  ProfileHover,
  ProfileState,
} from '../../../src/game/profile/state/profileState.js';
import { requireDefined } from '../../../src/invariant.js';
import type { SoundEffect } from '../../../src/game/ui/view/soundEffects.js';

function nickname(input: string): Nickname {
  return requireDefined(parseNickname(input), 'Invalid test nickname', input);
}

type Classification<D extends AchievementDefinition = AchievementDefinition> = D extends unknown
  ? [category: D['category'], rule: D['rule']]
  : never;

function definitionOf(
  id: AchievementId,
  set: AchievementSet,
  ...[category, rule]: Classification
): NamedAchievementDefinition {
  const base = {
    id,
    set,
    isRetired: false,
    names: {
      ko: id,
      ja: id,
      en: id,
    },
  };
  return category === 'album'
    ? {
        ...base,
        category,
        rule,
      }
    : {
        ...base,
        category,
        rule,
      };
}

// 프로필 응답과 카탈로그로 만든 보이는 업적. 카테고리마다 연속해 놓아 줄이 나뉘고, 앨범은 album 이 달라 줄이 나뉜다.
const DEFINITIONS: readonly NamedAchievementDefinition[] = [
  ...[1, 5].map((target) =>
    definitionOf(target === 1 ? 'FIRST_CLEAR' : `CLEAR_${target}_SONGS`, 'rhythm', 'songClear', {
      kind: 'songs',
      mark: 'clear',
      target,
    }),
  ),
  ...[1, 3, 10].map((target) =>
    definitionOf(target === 1 ? 'FIRST_FINISH' : `PLAY_${target}`, 'rhythm', 'play', {
      kind: 'plays',
      target,
    }),
  ),
  ...(
    [
      ['', 'zodiacComplete', 'clear'],
      ['_S', 'zodiacAllS', 's'],
      ['_FC', 'zodiacAllFullCombo', 'fc'],
    ] as const
  ).flatMap(([suffix, category, mark]) =>
    (['aries', 'taurus'] as const).map((zodiac) =>
      definitionOf(`ZODIAC_${zodiac.toUpperCase()}${suffix}`, 'zodiac', category, {
        kind: 'zodiacComplete',
        mark,
        zodiac,
      }),
    ),
  ),
  ...['REMINDFUL_ONE', 'REMINDFUL_TWO', 'NOSTALZIA'].flatMap((album) =>
    (['clear', 's', 'fc'] as const).map((mark) =>
      definitionOf(`ALBUM_${album}_${mark.toUpperCase()}`, 'discography', 'album', {
        kind: 'album',
        album: `album_${album.toLowerCase()}`,
        mark,
      }),
    ),
  ),
];
const FIRST_CLEAR = requireDefined(
  DEFINITIONS.find(({ id }) => id === 'FIRST_CLEAR'),
  'Missing test achievement',
);

const EARNED_AT_MS = Date.parse('2026-10-21T09:12:33.000Z');
const EARNED: readonly AchievementId[] = ['FIRST_CLEAR', 'FIRST_FINISH'];

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    nickname: nickname('과즙이4829'),
    featuredAchievement: null,
    stats: {
      playCount: 3,
      clearedSongCount: 1,
      sChartCount: 0,
      fullComboChartCount: 0,
      allPerfectChartCount: 0,
    },
    achievements: DEFINITIONS.map((definition) => ({
      definition,
      earnedAtMs: EARNED.includes(definition.id) ? EARNED_AT_MS : null,
      current: 0,
      target: 1,
    })),
    newAchievements: new Set(),
    catalog: {
      definitions: DEFINITIONS,
      albums: new Map(),
    },
    ...overrides,
  };
}

interface Pending<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

function requestError(kind: ProfileRequestErrorKind): ProfileRequestError {
  return new ProfileRequestError(kind, undefined);
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const WHEEL_STEP_PX = 90;

function getRankingTopRow(harness: Harness): number | null {
  const { rankings } = harness.loaded();
  return rankings.kind === 'loaded' ? rankings.topRow : null;
}

function rankedChart(rank: number): RankedChart {
  return {
    chartId: `chart${rank}`,
    songId: `song${rank}`,
    songTitle: `Song ${rank}`,
    constellation: 'aries',
    laneCount: 4,
    difficulty: 'hard',
    rank,
    score: 300000 - rank,
    achievedAtMs: EARNED_AT_MS,
  };
}

interface Harness {
  signOutCount(): number;
  readonly controller: ProfileController;
  readonly rendered: ProfileState[];
  readonly previous: (ProfileState | null)[];
  readonly controlsOpen: boolean[];
  readonly hovers: (ProfileHover | null)[];
  readonly loads: Pending<Profile>[];
  readonly nicknames: { nickname: string; response: Pending<Nickname> }[];
  readonly waits: { delayMs: number; done: Pending<void> }[];
  readonly checks: { nickname: string; response: Pending<boolean> }[];
  readonly featured: {
    id: AchievementId | null;
    response: Pending<AchievementId | null>;
  }[];
  readonly rankings: Pending<RankedChartPage>[];
  readonly rankingCursors: (RankedChartCursor | null)[];
  readonly rankingQueries: RankedChartQuery[];
  readonly deletions: Pending<void>[];
  readonly sounds: SoundEffect[];
  leaveCount(): number;
  mainLeaveCount(): number;
  focusSoundCount(): number;
  clickSoundCount(): number;
  featuredSounds(): SoundEffect[];
  last(): ProfileState;
  hover(): ProfileHover | null;
  loaded(): Extract<ProfileState, { kind: 'loaded' }>;
}

function createHarness(isSignedIn = true): Harness {
  const rendered: ProfileState[] = [];
  const previous: (ProfileState | null)[] = [];
  const controlsOpen: boolean[] = [];
  const hovers: (ProfileHover | null)[] = [];
  const loads: Pending<Profile>[] = [];
  const nicknames: Harness['nicknames'] = [];
  const waits: Harness['waits'] = [];
  const checks: Harness['checks'] = [];
  const featured: Harness['featured'] = [];
  const rankings: Harness['rankings'] = [];
  const rankingCursors: Harness['rankingCursors'] = [];
  const rankingQueries: Harness['rankingQueries'] = [];
  const deletions: Pending<void>[] = [];
  let leaves = 0;
  let mainLeaves = 0;
  let signOuts = 0;
  const sounds: SoundEffect[] = [];
  const ports: ProfilePorts = {
    isSignedIn: () => isSignedIn,
    loadProfile: () => {
      const load = pending<Profile>();
      loads.push(load);
      return load.promise;
    },
    changeNickname: (nickname) => {
      const response = pending<Nickname>();
      nicknames.push({
        nickname,
        response,
      });
      return response.promise;
    },
    isNicknameAvailable: (nickname) => {
      const response = pending<boolean>();
      checks.push({
        nickname,
        response,
      });
      return response.promise;
    },
    wait: (delayMs) => {
      const done = pending<void>();
      waits.push({
        delayMs,
        done,
      });
      return done.promise;
    },
    setFeaturedAchievement: (id) => {
      const response = pending<AchievementId | null>();
      featured.push({
        id,
        response,
      });
      return response.promise;
    },
    loadMyRankings: (query) => {
      const response = pending<RankedChartPage>();
      rankings.push(response);
      rankingCursors.push(query.cursor);
      rankingQueries.push(query);
      return response.promise;
    },
    deleteAccount: () => {
      const deletion = pending<void>();
      deletions.push(deletion);
      return deletion.promise;
    },
    signOut: () => {
      signOuts += 1;
    },
  };
  const controller = new ProfileController(
    ports,
    {
      render: (previousState, next) => {
        rendered.push(next.page);
        previous.push(previousState?.page ?? null);
        controlsOpen.push(next.isControlsOpen);
        hovers.push(next.hover);
      },
      playSound: (sound) => sounds.push(sound),
      leave: () => {
        leaves += 1;
      },
      leaveToMain: () => {
        mainLeaves += 1;
      },
    },
    WHEEL_STEP_PX,
  );
  const last = (): ProfileState => {
    return requireDefined(rendered.at(-1), 'nothing rendered');
  };
  return {
    controller,
    rendered,
    previous,
    controlsOpen,
    hovers,
    loads,
    nicknames,
    waits,
    checks,
    featured,
    rankings,
    rankingCursors,
    rankingQueries,
    deletions,
    sounds,
    leaveCount: () => leaves,
    mainLeaveCount: () => mainLeaves,
    signOutCount: () => signOuts,
    focusSoundCount: () => sounds.filter((sound) => sound === 'menuFocus').length,
    clickSoundCount: () => sounds.filter((sound) => sound === 'click').length,
    featuredSounds: () => sounds.filter((sound) => sound === 'equip' || sound === 'unequip'),
    last,
    hover: () => requireDefined(hovers.at(-1), 'nothing rendered'),
    loaded: () => {
      const state = last();
      if (state.kind !== 'loaded') {
        throw new Error(`expected loaded, got ${state.kind}`);
      }
      return state;
    },
  };
}

async function loadedHarness(profile: Profile = createProfile()): Promise<Harness> {
  const harness = createHarness();
  harness.controller.start();
  harness.loads[0]?.resolve(profile);
  await flush();
  return harness;
}

async function editingHarness(): Promise<Harness> {
  const harness = await loadedHarness();
  harness.controller.select();
  return harness;
}

describe('ProfileController loading', () => {
  it('shows the guest screen without any request when signed out', () => {
    const harness = createHarness(false);

    harness.controller.start();

    expect(harness.rendered).toEqual([{ kind: 'guest' }]);
    expect(harness.loads).toHaveLength(0);
  });

  it('shows loading and then the summary of the loaded profile', async () => {
    const harness = createHarness();
    const profile = createProfile();

    harness.controller.start();
    expect(harness.last()).toEqual({ kind: 'loading' });

    harness.loads[0]?.resolve(profile);
    await flush();

    const state = harness.loaded();
    expect(state.profile).toBe(profile);
    expect(state.view).toBe('summary');
    expect(state.summaryFocus).toBe('nickname');
  });

  it('shows the failure and loads again on retry', async () => {
    const harness = createHarness();
    harness.controller.start();
    harness.loads[0]?.reject(requestError('failed'));
    await flush();
    expect(harness.last()).toEqual({ kind: 'failed' });

    harness.controller.confirm();
    expect(harness.last()).toEqual({ kind: 'loading' });
    harness.loads[1]?.resolve(createProfile());
    await flush();

    expect(harness.loaded().kind).toBe('loaded');
    expect(harness.loads).toHaveLength(2);
  });

  it('treats a parse failure as a load failure', async () => {
    const harness = createHarness();
    harness.controller.start();
    harness.loads[0]?.reject(new Error('Profile must list every achievement exactly once'));
    await flush();

    expect(harness.last()).toEqual({ kind: 'failed' });
  });

  it('selects the focus instead of retrying unless the load failed', async () => {
    const harness = await loadedHarness();

    harness.controller.confirm();

    expect(harness.loads).toHaveLength(1);
    expect(harness.loaded().nickname.kind).not.toBe('idle');
  });

  it('shows the guest screen when the session expired', async () => {
    const harness = createHarness();
    harness.controller.start();
    harness.loads[0]?.reject(requestError('unauthorized'));
    await flush();

    expect(harness.last()).toEqual({ kind: 'guest' });
  });

  it('ignores a profile that arrives after close', async () => {
    const harness = createHarness();
    harness.controller.start();
    harness.controller.close();

    harness.loads[0]?.resolve(createProfile());
    await flush();

    expect(harness.rendered).toEqual([{ kind: 'loading' }]);
  });
});

describe('ProfileController focus and views', () => {
  it('moves the summary focus from the nickname through the three sets and wraps around', async () => {
    const harness = await loadedHarness();
    harness.controller.moveFocus('right');
    expect(harness.loaded().summaryTab).toBe('collection');

    harness.controller.moveFocus('up');
    expect(harness.loaded().summaryFocus).toBe('discography');
    harness.controller.moveFocus('down');
    expect(harness.loaded().summaryFocus).toBe('nickname');

    const focuses = [1, 2, 3, 4].map(() => {
      harness.controller.moveFocus('down');
      return harness.loaded().summaryFocus;
    });

    expect(focuses).toEqual(['rhythm', 'zodiac', 'discography', 'nickname']);
  });

  it('starts on the stats tab where only the nickname takes focus', async () => {
    const harness = await loadedHarness();
    expect(harness.loaded().summaryTab).toBe('stats');

    harness.controller.moveFocus('down');
    harness.controller.moveFocus('left');

    expect(harness.rendered).toHaveLength(2);
  });

  it('returns the focus to the nickname when leaving the collection tab', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');

    harness.controller.moveFocus('left');

    expect(harness.loaded().summaryTab).toBe('stats');
    expect(harness.loaded().summaryFocus).toBe('nickname');
  });

  it('keeps the collection tab when coming back from a set', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.select('zodiac');

    harness.controller.back();

    expect(harness.loaded().view).toBe('summary');
    expect(harness.loaded().summaryTab).toBe('collection');
  });

  it('opens the collection of the selected set on its first achievement and goes back', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.moveFocus('down');

    harness.controller.select();

    expect(harness.loaded().view).toBe('collection');
    expect(harness.loaded().collection).toEqual({
      set: 'zodiac',
      focusedId: 'ZODIAC_ARIES',
    });

    harness.controller.back();

    expect(harness.loaded().view).toBe('summary');
    expect(harness.loaded().summaryFocus).toBe('zodiac');
  });

  it('opens the pointed set from the summary regardless of the focus', async () => {
    const harness = await loadedHarness();

    harness.controller.select('discography');

    expect(harness.loaded().view).toBe('collection');
    expect(harness.loaded().collection).toEqual({
      set: 'discography',
      focusedId: 'ALBUM_REMINDFUL_ONE_CLEAR',
    });

    harness.controller.back();

    expect(harness.loaded().summaryFocus).toBe('discography');
  });

  it('moves within a category row sideways and between rows vertically', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.select();

    harness.controller.moveFocus('right');
    expect(harness.loaded().collection.focusedId).toBe('CLEAR_5_SONGS');
    harness.controller.moveFocus('down');
    expect(harness.loaded().collection.focusedId).toBe('PLAY_3');
    harness.controller.moveFocus('up');
    expect(harness.loaded().collection.focusedId).toBe('CLEAR_5_SONGS');
    harness.controller.moveFocus('left');
    harness.controller.moveFocus('left');
    expect(harness.loaded().collection.focusedId).toBe('FIRST_CLEAR');
  });

  it('moves through an album row sideways and between albums vertically', async () => {
    const harness = await loadedHarness();
    harness.controller.select('discography');

    harness.controller.moveFocus('right');
    harness.controller.moveFocus('right');
    expect(harness.loaded().collection.focusedId).toBe('ALBUM_REMINDFUL_ONE_FC');
    harness.controller.moveFocus('down');
    expect(harness.loaded().collection.focusedId).toBe('ALBUM_REMINDFUL_TWO_FC');
    harness.controller.moveFocus('up');
    harness.controller.moveFocus('up');
    expect(harness.loaded().collection.focusedId).toBe('ALBUM_NOSTALZIA_FC');
  });

  it('stacks the zodiac rows by mark under the same constellation', async () => {
    const harness = await loadedHarness();
    harness.controller.select('zodiac');

    harness.controller.moveFocus('down');
    expect(harness.loaded().collection.focusedId).toBe('ZODIAC_ARIES_S');
    harness.controller.moveFocus('down');
    expect(harness.loaded().collection.focusedId).toBe('ZODIAC_ARIES_FC');
  });

  it('plays the focus sound only when a move changes the focus', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.select();
    const before = harness.focusSoundCount();

    harness.controller.moveFocus('left');
    harness.controller.moveFocus('right');

    expect(harness.focusSoundCount()).toBe(before + 1);
  });

  it('switches summary tabs without the focus sound', async () => {
    const harness = await loadedHarness();

    harness.controller.moveFocus('right');
    harness.controller.moveFocus('left');

    expect(harness.loaded().summaryTab).toBe('stats');
    expect(harness.focusSoundCount()).toBe(0);
  });

  it('switches set tabs with wrap-around and focuses the first achievement', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.select();

    harness.controller.switchSet(-1);

    expect(harness.loaded().collection.set).toBe('discography');
    expect(harness.loaded().collection.focusedId).toBe('ALBUM_REMINDFUL_ONE_CLEAR');

    harness.controller.switchSet(1);

    expect(harness.loaded().collection).toEqual({
      set: 'rhythm',
      focusedId: 'FIRST_CLEAR',
    });
  });

  it('shows a pointed set tab and focuses its first achievement', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.select();

    harness.controller.selectSet('zodiac');
    expect(harness.loaded().collection.set).toBe('zodiac');
    expect(harness.loaded().collection.focusedId).toBe('ZODIAC_ARIES');

    const count = harness.rendered.length;
    harness.controller.selectSet('zodiac');
    expect(harness.rendered).toHaveLength(count);
  });

  it('ignores input and requests after close', async () => {
    const harness = await loadedHarness();
    const count = harness.rendered.length;
    harness.controller.close();

    harness.controller.moveFocus('down');
    harness.controller.select();
    harness.controller.back();

    expect(harness.rendered).toHaveLength(count);
    expect(harness.leaveCount()).toBe(0);
    expect(harness.loads).toHaveLength(1);
  });

  it('focuses a pointed achievement of the shown set only, with the focus sound', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.select();

    const sounds = harness.focusSoundCount();
    harness.controller.focusAchievement('PLAY_10');
    expect(harness.loaded().collection.focusedId).toBe('PLAY_10');
    expect(harness.focusSoundCount()).toBe(sounds + 1);

    const count = harness.rendered.length;
    harness.controller.focusAchievement('PLAY_10');
    expect(harness.rendered).toHaveLength(count);
    expect(harness.focusSoundCount()).toBe(sounds + 1);
  });

  it('leaves to the previous screen from the summary, guest and failure screens', async () => {
    const summary = await loadedHarness();
    summary.controller.back();
    expect(summary.leaveCount()).toBe(1);

    const guest = createHarness(false);
    guest.controller.start();
    guest.controller.back();
    expect(guest.leaveCount()).toBe(1);
  });
});

describe('ProfileController nickname', () => {
  it('starts editing from the nickname focus and cancels with back', async () => {
    const harness = await editingHarness();
    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: '과즙이4829',
      error: null,
    });

    harness.controller.back();

    expect(harness.loaded().nickname).toEqual({ kind: 'idle' });
    expect(harness.leaveCount()).toBe(0);
  });

  it('takes every key while editing and none otherwise', async () => {
    const harness = await loadedHarness();
    expect(harness.controller.captureNicknameKey('down', '')).toBe(false);

    harness.controller.select('nickname');

    expect(harness.controller.captureNicknameKey(null, '')).toBe(true);
    expect(harness.controller.captureNicknameKey('down', '')).toBe(true);
    expect(harness.loaded().summaryFocus).toBe('nickname');
    expect(harness.controller.captureNicknameKey('back', '')).toBe(true);
    expect(harness.loaded().nickname).toEqual({ kind: 'idle' });
    expect(harness.controller.captureNicknameKey('down', '')).toBe(false);
  });

  it('starts editing from the pointed nickname while a set is focused', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');

    harness.controller.select('nickname');

    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: '과즙이4829',
      error: null,
    });
    expect(harness.loaded().summaryFocus).toBe('nickname');
  });

  it.each(['a', 'abcdefghijklmnopq', 'star!'])(
    'reports %s as invalid without a request',
    async (input) => {
      const harness = await editingHarness();

      harness.controller.captureNicknameKey('confirm', input);

      expect(harness.loaded().nickname).toEqual({
        kind: 'editing',
        input: input,
        error: 'invalid',
      });
      expect(harness.nicknames).toHaveLength(0);
    },
  );

  it('does not render again for the same invalid nickname', async () => {
    const harness = await editingHarness();
    harness.controller.captureNicknameKey('confirm', 'a');
    const count = harness.rendered.length;

    harness.controller.captureNicknameKey('confirm', 'a');

    expect(harness.rendered).toHaveLength(count);
  });

  it('ends editing without a request when the nickname is unchanged', async () => {
    const harness = await editingHarness();

    harness.controller.captureNicknameKey('confirm', ' 과즙이4829 ');

    expect(harness.loaded().nickname).toEqual({ kind: 'idle' });
    expect(harness.nicknames).toHaveLength(0);
  });

  it('saves the normalized nickname and shows the stored value', async () => {
    const harness = await editingHarness();

    harness.controller.captureNicknameKey('confirm', '  별빛_01  ');
    expect(harness.loaded().nickname).toEqual({
      kind: 'saving',
      input: '  별빛_01  ',
    });
    expect(harness.nicknames.map(({ nickname }) => nickname)).toEqual(['별빛_01']);

    harness.nicknames[0]?.response.resolve(nickname('별빛_01'));
    await flush();

    expect(harness.loaded().nickname).toEqual({ kind: 'idle' });
    expect(harness.loaded().profile.nickname).toBe('별빛_01');
  });

  it('ignores select while saving', async () => {
    const harness = await editingHarness();
    harness.controller.captureNicknameKey('confirm', '별빛');
    const count = harness.rendered.length;

    harness.controller.select();

    expect(harness.rendered).toHaveLength(count);
  });

  it.each([
    ['nicknameTaken', 'taken'],
    ['invalidNickname', 'invalid'],
    ['failed', 'failed'],
    ['unauthorized', 'failed'],
  ] as const)('shows a %s rejection as %s', async (kind, error) => {
    const harness = await editingHarness();
    harness.controller.captureNicknameKey('confirm', '별빛');

    harness.nicknames[0]?.response.reject(requestError(kind));
    await flush();

    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: '별빛',
      error,
    });
    expect(harness.loaded().profile.nickname).toBe('과즙이4829');
  });

  it('ignores a nickname response that arrives after close', async () => {
    const harness = await editingHarness();
    harness.controller.captureNicknameKey('confirm', '별빛');
    const count = harness.rendered.length;
    harness.controller.close();

    harness.nicknames[0]?.response.resolve(nickname('별빛'));
    await flush();

    expect(harness.rendered).toHaveLength(count);
  });
});

describe('ProfileController nickname availability', () => {
  it('asks once typing pauses and shows a taken nickname', async () => {
    const harness = await editingHarness();

    harness.controller.changeNicknameInput(' 별빛 ');
    expect(harness.waits.map(({ delayMs }) => delayMs)).toEqual([300]);
    expect(harness.checks).toHaveLength(0);

    harness.waits[0]?.done.resolve();
    await flush();
    expect(harness.checks.map(({ nickname }) => nickname)).toEqual(['별빛']);

    harness.checks[0]?.response.resolve(false);
    await flush();
    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: ' 별빛 ',
      error: 'taken',
    });
  });

  it('keeps editing without an error for an available nickname', async () => {
    const harness = await editingHarness();
    harness.controller.changeNicknameInput('별빛');
    harness.waits[0]?.done.resolve();
    await flush();
    const count = harness.rendered.length;

    harness.checks[0]?.response.resolve(true);
    await flush();

    expect(harness.rendered).toHaveLength(count);
    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: '별빛',
      error: null,
    });
  });

  it('asks only for the latest input', async () => {
    const harness = await editingHarness();
    harness.controller.changeNicknameInput('별빛');
    harness.controller.changeNicknameInput('별빛2');

    harness.waits.forEach(({ done }) => done.resolve());
    await flush();

    expect(harness.checks.map(({ nickname }) => nickname)).toEqual(['별빛2']);
  });

  it('drops an answer for input typed over', async () => {
    const harness = await editingHarness();
    harness.controller.changeNicknameInput('별빛');
    harness.waits[0]?.done.resolve();
    await flush();
    harness.controller.changeNicknameInput('별빛2');

    harness.checks[0]?.response.resolve(false);
    await flush();

    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: '별빛2',
      error: null,
    });
  });

  it.each([
    ['an invalid nickname', 'a'],
    ['the own nickname', ' 과즙이4829 '],
  ])('does not ask for %s', async (_case, input) => {
    const harness = await editingHarness();

    harness.controller.changeNicknameInput(input);

    expect(harness.waits).toHaveLength(0);
  });

  it('clears the previous error as typing resumes', async () => {
    const harness = await editingHarness();
    harness.controller.captureNicknameKey('confirm', 'a');

    harness.controller.changeNicknameInput('ab');

    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: 'ab',
      error: null,
    });
  });

  it('ignores an answer that arrives after the nickname is submitted', async () => {
    const harness = await editingHarness();
    harness.controller.changeNicknameInput('별빛');
    harness.waits[0]?.done.resolve();
    await flush();
    harness.controller.captureNicknameKey('confirm', '별빛');

    harness.checks[0]?.response.resolve(false);
    await flush();

    expect(harness.loaded().nickname).toEqual({
      kind: 'saving',
      input: '별빛',
    });
  });

  it('keeps editing without an error when the check fails', async () => {
    const harness = await editingHarness();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    harness.controller.changeNicknameInput('별빛');
    harness.waits[0]?.done.resolve();
    await flush();

    harness.checks[0]?.response.reject(requestError('failed'));
    await flush();

    expect(harness.loaded().nickname).toEqual({
      kind: 'editing',
      input: '별빛',
      error: null,
    });
    warn.mockRestore();
  });
});

describe('ProfileController featured achievement', () => {
  async function collectionHarness(profile?: Profile): Promise<Harness> {
    const harness = await loadedHarness(profile);
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.select();
    return harness;
  }

  it('features an earned achievement and shows it on the profile', async () => {
    const harness = await collectionHarness();

    harness.controller.select();
    expect(harness.loaded().featuredSave).toBe('saving');
    expect(harness.featured.map(({ id }) => id)).toEqual(['FIRST_CLEAR']);
    expect(harness.featuredSounds()).toEqual([]);

    harness.featured[0]?.response.resolve(FIRST_CLEAR.id);
    await flush();

    expect(harness.loaded().featuredSave).toBe('idle');
    expect(harness.loaded().profile.featuredAchievement).toBe(FIRST_CLEAR);
    expect(harness.featuredSounds()).toEqual(['equip']);
  });

  it('unequips the featured achievement when it is selected again', async () => {
    const harness = await collectionHarness(createProfile({ featuredAchievement: FIRST_CLEAR }));

    harness.controller.select();
    expect(harness.featured.map(({ id }) => id)).toEqual([null]);

    harness.featured[0]?.response.resolve(null);
    await flush();

    expect(harness.loaded().profile.featuredAchievement).toBeNull();
    expect(harness.featuredSounds()).toEqual(['unequip']);
  });

  it('does not request for a locked achievement', async () => {
    const harness = await collectionHarness();

    harness.controller.moveFocus('right');
    harness.controller.select();

    expect(harness.featured).toHaveLength(0);
  });

  it('shows the failure and keeps the previous featured achievement', async () => {
    const harness = await collectionHarness();
    harness.controller.select();

    harness.featured[0]?.response.reject(requestError('notEarned'));
    await flush();

    expect(harness.loaded().featuredSave).toBe('failed');
    expect(harness.loaded().profile.featuredAchievement).toBeNull();
    expect(harness.featuredSounds()).toEqual([]);
  });

  it('ignores selections while a featured save is pending', async () => {
    const harness = await collectionHarness();
    harness.controller.select();
    harness.controller.moveFocus('down');
    harness.controller.select();

    expect(harness.featured.map(({ id }) => id)).toEqual(['FIRST_CLEAR']);
  });

  it('ignores a featured response that arrives after close', async () => {
    const harness = await collectionHarness();
    harness.controller.select();
    const count = harness.rendered.length;
    harness.controller.close();

    harness.featured[0]?.response.resolve(FIRST_CLEAR.id);
    await flush();

    expect(harness.rendered).toHaveLength(count);
  });
});

describe('ProfileController hover', () => {
  it('passes null as the first previous state and then the state rendered before', async () => {
    const harness = createHarness();
    harness.controller.start();
    harness.loads[0]?.resolve(createProfile());
    await flush();
    harness.controller.selectTab('collection');

    expect(harness.previous).toEqual([null, harness.rendered[0], harness.rendered[1]]);
    expect(harness.previous[2]).toBe(harness.rendered[1]);
  });

  it('passes null as the previous state of the first guest screen', () => {
    const harness = createHarness(false);

    harness.controller.start();

    expect(harness.previous).toEqual([null]);
  });

  it('renders the hovered summary tab, set row and collection tab', async () => {
    const harness = await loadedHarness();

    harness.controller.hover({
      kind: 'summaryTab',
      tab: 'collection',
    });
    expect(harness.hover()).toEqual({
      kind: 'summaryTab',
      tab: 'collection',
    });
    harness.controller.unhover({
      kind: 'summaryTab',
      tab: 'collection',
    });
    expect(harness.hover()).toBeNull();

    harness.controller.selectTab('collection');
    harness.controller.hover({
      kind: 'setRow',
      set: 'zodiac',
    });
    expect(harness.hover()).toEqual({
      kind: 'setRow',
      set: 'zodiac',
    });
    harness.controller.unhover({
      kind: 'setRow',
      set: 'zodiac',
    });
    expect(harness.hover()).toBeNull();

    harness.controller.select('zodiac');
    harness.controller.hover({
      kind: 'collectionTab',
      set: 'discography',
    });
    expect(harness.hover()).toEqual({
      kind: 'collectionTab',
      set: 'discography',
    });
    harness.controller.unhover({
      kind: 'collectionTab',
      set: 'discography',
    });
    expect(harness.hover()).toBeNull();
  });

  it('does not render for the same hover or an unhover of another target', async () => {
    const harness = await loadedHarness();
    harness.controller.hover({
      kind: 'summaryTab',
      tab: 'stats',
    });
    const count = harness.rendered.length;

    harness.controller.hover({
      kind: 'summaryTab',
      tab: 'stats',
    });
    harness.controller.unhover({
      kind: 'summaryTab',
      tab: 'collection',
    });
    harness.controller.unhover({
      kind: 'setRow',
      set: 'zodiac',
    });

    expect(harness.rendered).toHaveLength(count);
  });

  it('does not play the focus sound on hover', async () => {
    const harness = await loadedHarness();

    harness.controller.hover({
      kind: 'summaryTab',
      tab: 'collection',
    });
    harness.controller.hover({
      kind: 'setRow',
      set: 'zodiac',
    });
    harness.controller.unhover({
      kind: 'setRow',
      set: 'zodiac',
    });

    expect(harness.focusSoundCount()).toBe(0);
  });

  it('releases the hover when opening a collection and when going back', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.hover({
      kind: 'setRow',
      set: 'zodiac',
    });

    harness.controller.select('zodiac');
    expect(harness.loaded().view).toBe('collection');
    expect(harness.hover()).toBeNull();

    harness.controller.hover({
      kind: 'collectionTab',
      set: 'discography',
    });
    harness.controller.back();
    expect(harness.loaded().view).toBe('summary');
    expect(harness.hover()).toBeNull();
  });

  it('releases a set row hover when the summary tab changes', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.hover({
      kind: 'setRow',
      set: 'zodiac',
    });

    harness.controller.selectTab('stats');

    expect(harness.loaded().summaryTab).toBe('stats');
    expect(harness.hover()).toBeNull();
  });

  it('keeps a summary tab hover when that tab is selected', async () => {
    const harness = await loadedHarness();
    harness.controller.hover({
      kind: 'summaryTab',
      tab: 'collection',
    });

    harness.controller.selectTab('collection');

    expect(harness.loaded().summaryTab).toBe('collection');
    expect(harness.hover()).toEqual({
      kind: 'summaryTab',
      tab: 'collection',
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

describe('ProfileController summary tab sound', () => {
  it('plays the click sound instead of the focus sound when a click or a key switches the tab', async () => {
    const harness = await loadedHarness();

    harness.controller.selectTab('collection');
    harness.controller.moveFocus('left');
    harness.controller.moveFocus('right');

    expect(harness.loaded().summaryTab).toBe('collection');
    expect(harness.clickSoundCount()).toBe(3);
    expect(harness.focusSoundCount()).toBe(0);
  });

  it('ignores a tab click while editing the nickname', async () => {
    const harness = await editingHarness();

    harness.controller.selectTab('collection');

    expect(harness.loaded().summaryTab).toBe('stats');
    expect(harness.clickSoundCount()).toBe(0);
  });

  it('stays silent when the tab does not change', async () => {
    const harness = await loadedHarness();

    harness.controller.selectTab('stats');
    harness.controller.selectTab('collection');

    expect(harness.loaded().summaryTab).toBe('collection');
    expect(harness.clickSoundCount()).toBe(1);
  });
});

describe('ProfileController set tab sound', () => {
  it('plays the click sound when a click or Q/E switches the set and stays silent otherwise', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.select('rhythm');
    const clicksBefore = harness.clickSoundCount();
    const focusesBefore = harness.focusSoundCount();

    harness.controller.switchSet(1);
    harness.controller.selectSet('rhythm');
    harness.controller.selectSet('rhythm');

    expect(harness.loaded().collection.set).toBe('rhythm');
    expect(harness.clickSoundCount() - clicksBefore).toBe(2);
    expect(harness.focusSoundCount()).toBe(focusesBefore);
  });
});

describe('ProfileController controls', () => {
  it('plays the click sound when H opens the controls', () => {
    const harness = createHarness(false);
    harness.controller.start();

    harness.controller.handleControlsKey(H_KEY);

    expect(harness.clickSoundCount()).toBe(1);
  });
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = createHarness(false);
    harness.controller.start();

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(true);
    expect(harness.last()).toEqual({ kind: 'guest' });
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(false);
    harness.controller.openControls();
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(harness.controlsOpen.at(-1)).toBe(false);
  });
});

describe('ProfileController button pointer', () => {
  async function collectionHarness(): Promise<Harness> {
    const harness = await loadedHarness();
    harness.controller.selectTab('collection');
    harness.controller.moveFocus('down');
    harness.controller.select();
    return harness;
  }

  it('runs a button once for over, down and up on it', async () => {
    const harness = await loadedHarness();

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerUp('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(1);
  });

  it('does not run a button for an up that was pressed elsewhere', async () => {
    const harness = await loadedHarness();

    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(0);
  });

  it('releases the press when the pointer leaves the button', async () => {
    const harness = await loadedHarness();

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerOut('back');
    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(0);
  });

  it('features the focused achievement with the equip button', async () => {
    const harness = await collectionHarness();

    harness.controller.pointerOver('equip');
    harness.controller.pointerDown('equip');
    harness.controller.pointerUp('equip');

    expect(harness.featured.map(({ id }) => id)).toEqual(['FIRST_CLEAR']);
  });

  it('releases the equip button hover when it hides after saving', async () => {
    const harness = await collectionHarness();
    harness.controller.pointerOver('equip');
    harness.controller.pointerDown('equip');
    harness.controller.pointerUp('equip');

    harness.featured[0]?.response.resolve(FIRST_CLEAR.id);
    await flush();

    expect(harness.hover()).toBeNull();
  });

  it('opens with the entry, closes with the backdrop and releases the close button hover', async () => {
    const harness = await loadedHarness();

    harness.controller.pointerDown('controlsEntry');
    harness.controller.pointerUp('controlsEntry');
    expect(harness.controlsOpen.at(-1)).toBe(true);

    harness.controller.pointerOver('controlsClose');
    harness.controller.handleControlsKey(ESCAPE_KEY);
    expect(harness.controlsOpen.at(-1)).toBe(false);
    expect(harness.hover()).toBeNull();

    harness.controller.openControls();
    harness.controller.pointerDown('controlsBackdrop');
    harness.controller.pointerUp('controlsBackdrop');
    expect(harness.controlsOpen.at(-1)).toBe(false);
  });
});

describe('ProfileController account deletion', () => {
  function press(harness: Harness, button: ProfileButton): void {
    harness.controller.pointerOver(button);
    harness.controller.pointerDown(button);
    harness.controller.pointerUp(button);
  }

  async function confirmingHarness(): Promise<Harness> {
    const harness = await loadedHarness();
    press(harness, 'deleteEntry');
    return harness;
  }

  async function deletingHarness(): Promise<Harness> {
    const harness = await confirmingHarness();
    harness.controller.captureDeletionKey('right');
    harness.controller.captureDeletionKey('confirm');
    return harness;
  }

  it('opens from the summary entry with the cancel focus and the click sound', async () => {
    const harness = await loadedHarness();
    const clicks = harness.clickSoundCount();

    press(harness, 'deleteEntry');

    expect(harness.loaded().accountDeletion).toEqual({
      kind: 'confirming',
      focus: 'cancel',
    });
    expect(harness.clickSoundCount()).toBe(clicks + 1);
  });

  it('does not open on the collection, while editing the nickname or before the profile loads', async () => {
    const collection = await loadedHarness();
    collection.controller.selectTab('collection');
    collection.controller.moveFocus('down');
    collection.controller.select();
    const editing = await editingHarness();
    const guest = createHarness(false);
    guest.controller.start();
    const loading = createHarness();
    loading.controller.start();
    const failed = createHarness();
    failed.controller.start();
    failed.loads[0]?.reject(new Error('offline'));
    await flush();

    for (const harness of [collection, editing]) {
      const clicks = harness.clickSoundCount();
      press(harness, 'deleteEntry');
      expect(harness.loaded().accountDeletion).toEqual({ kind: 'closed' });
      expect(harness.clickSoundCount()).toBe(clicks);
    }
    for (const harness of [guest, loading, failed]) {
      const page = harness.last();
      press(harness, 'deleteEntry');
      expect(harness.last()).toBe(page);
      expect(harness.clickSoundCount()).toBe(0);
    }
  });

  it.each([
    ['the cancel button', (harness: Harness) => press(harness, 'deleteCancel')],
    ['back', (harness: Harness) => harness.controller.captureDeletionKey('back')],
    [
      'confirm on the cancel focus',
      (harness: Harness) => harness.controller.captureDeletionKey('confirm'),
    ],
  ])('closes with %s without a request', async (_name, cancel) => {
    const harness = await confirmingHarness();

    cancel(harness);

    expect(harness.loaded().accountDeletion).toEqual({ kind: 'closed' });
    expect(harness.sounds.at(-1)).toBe('close');
    expect(harness.deletions).toHaveLength(0);
  });

  it('moves the focus sideways and requests once on accept', async () => {
    const harness = await confirmingHarness();
    const focusSounds = harness.focusSoundCount();

    expect(harness.controller.captureDeletionKey('right')).toBe(true);
    expect(harness.loaded().accountDeletion).toEqual({
      kind: 'confirming',
      focus: 'accept',
    });
    expect(harness.focusSoundCount()).toBe(focusSounds + 1);

    const count = harness.rendered.length;
    harness.controller.captureDeletionKey('right');
    expect(harness.rendered).toHaveLength(count);
    expect(harness.focusSoundCount()).toBe(focusSounds + 1);

    harness.controller.captureDeletionKey('left');
    expect(harness.loaded().accountDeletion).toEqual({
      kind: 'confirming',
      focus: 'cancel',
    });

    harness.controller.captureDeletionKey('right');
    harness.controller.captureDeletionKey('confirm');
    expect(harness.loaded().accountDeletion).toEqual({ kind: 'deleting' });
    expect(harness.deletions).toHaveLength(1);

    const deleting = harness.last();
    expect(harness.controller.captureDeletionKey('confirm')).toBe(true);
    expect(harness.controller.captureDeletionKey('back')).toBe(true);
    expect(harness.controller.captureDeletionKey('left')).toBe(true);
    press(harness, 'deleteAccept');
    expect(harness.deletions).toHaveLength(1);
    expect(harness.last()).toBe(deleting);
  });

  it('takes the profile keys while open and none after closing', async () => {
    const harness = await confirmingHarness();

    for (const action of ['up', 'down', 'nextTab', 'previousTab', null] as const) {
      expect(harness.controller.captureDeletionKey(action)).toBe(true);
    }
    expect(harness.loaded().summaryFocus).toBe('nickname');
    expect(harness.loaded().summaryTab).toBe('stats');

    harness.controller.captureDeletionKey('back');
    expect(harness.controller.captureDeletionKey('down')).toBe(false);
  });

  it('leaves to the main screen once the deletion succeeds', async () => {
    const harness = await deletingHarness();

    harness.deletions[0]?.resolve();
    await flush();

    expect(harness.mainLeaveCount()).toBe(1);
  });

  it('ignores a deletion result that arrives after close', async () => {
    const harness = await deletingHarness();
    const count = harness.rendered.length;
    harness.controller.close();

    harness.deletions[0]?.resolve();
    await flush();

    expect(harness.leaveCount()).toBe(0);
    expect(harness.rendered).toHaveLength(count);
  });

  it.each([
    ['a failed', new AccountDeletionError('failed', undefined), 'failed'],
    ['an unknown', new AccountDeletionError('unknown', undefined), 'unknown'],
    ['any other', new Error('broken'), 'failed'],
  ] as const)('shows %s deletion error with the cancel focus', async (_name, error, kind) => {
    const harness = await deletingHarness();

    harness.deletions[0]?.reject(error);
    await flush();

    expect(harness.loaded().accountDeletion).toEqual({
      kind,
      focus: 'cancel',
    });
    expect(harness.leaveCount()).toBe(0);
  });

  it('shows the guest page when the session is no longer valid', async () => {
    const harness = await deletingHarness();

    harness.deletions[0]?.reject(new AccountDeletionError('unauthorized', undefined));
    await flush();

    expect(harness.last()).toEqual({ kind: 'guest' });
  });

  it('requests again when retrying after a failure', async () => {
    const harness = await deletingHarness();
    harness.deletions[0]?.reject(new AccountDeletionError('failed', undefined));
    await flush();

    press(harness, 'deleteAccept');

    expect(harness.loaded().accountDeletion).toEqual({ kind: 'deleting' });
    expect(harness.deletions).toHaveLength(2);
  });
});

describe('ProfileController ranking tab', () => {
  function getRankedChartIds(harness: Harness): readonly string[] {
    const { rankings } = harness.loaded();
    return rankings.kind === 'loaded' ? rankings.items.map(({ chartId }) => chartId) : [];
  }

  async function rankingHarness(
    items: readonly RankedChart[],
    next: RankedChartCursor | null = null,
  ): Promise<Harness> {
    const harness = await loadedHarness();
    harness.controller.selectTab('ranking');
    harness.rankings[0]?.resolve({
      items,
      next,
    });
    await flush();
    return harness;
  }

  it('requests the rankings only the first time the tab opens and shows them', async () => {
    const harness = await loadedHarness();
    expect(harness.rankings).toHaveLength(0);

    harness.controller.selectTab('ranking');
    expect(harness.loaded().rankings).toEqual({ kind: 'loading' });
    const items = [rankedChart(1), rankedChart(4)];
    harness.rankings[0]?.resolve({
      items,
      next: null,
    });
    await flush();
    expect(harness.loaded().rankings).toEqual({
      kind: 'loaded',
      items,
      more: { kind: 'end' },
      topRow: 0,
    });

    harness.controller.selectTab('stats');
    harness.controller.moveFocus('right');
    harness.controller.moveFocus('right');

    expect(harness.loaded().summaryTab).toBe('ranking');
    expect(harness.rankings).toHaveLength(1);
  });

  it('moves one tab at a time with left and right and stops at the edges', async () => {
    const harness = await loadedHarness();

    const tabs = [1, 2, 3].map(() => {
      harness.controller.moveFocus('right');
      return harness.loaded().summaryTab;
    });
    harness.controller.moveFocus('left');

    expect(tabs).toEqual(['collection', 'ranking', 'ranking']);
    expect(harness.loaded().summaryTab).toBe('collection');
    expect(harness.clickSoundCount()).toBe(3);
    expect(harness.focusSoundCount()).toBe(0);
  });

  it('shows an empty list as loaded with no items', async () => {
    const harness = await rankingHarness([]);

    expect(harness.loaded().rankings).toEqual({
      kind: 'loaded',
      items: [],
      more: { kind: 'end' },
      topRow: 0,
    });
  });

  it('shows the failure and requests again on retry', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('ranking');
    harness.rankings[0]?.reject(new RankingRequestError('failed', undefined));
    await flush();
    expect(harness.loaded().rankings).toEqual({ kind: 'failed' });

    harness.controller.confirm();
    expect(harness.loaded().nickname).toEqual({ kind: 'idle' });
    expect(harness.loaded().rankings).toEqual({ kind: 'loading' });
    harness.rankings[1]?.resolve({
      items: [rankedChart(2)],
      next: null,
    });
    await flush();

    expect(harness.loaded().rankings).toEqual({
      kind: 'loaded',
      items: [rankedChart(2)],
      more: { kind: 'end' },
      topRow: 0,
    });
    expect(harness.loads).toHaveLength(1);
  });

  it('does not retry the rankings while another tab is shown', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('ranking');
    harness.rankings[0]?.reject(new RankingRequestError('failed', undefined));
    await flush();
    harness.controller.selectTab('stats');

    harness.controller.confirm();

    expect(harness.rankings).toHaveLength(1);
    expect(harness.loaded().rankings).toEqual({ kind: 'failed' });
  });

  it('shows the guest screen when the session expired', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('ranking');
    harness.rankings[0]?.reject(new RankingRequestError('unauthorized', undefined));
    await flush();

    expect(harness.last()).toEqual({ kind: 'guest' });
  });

  it('requests the rankings again from the RETRY button', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('ranking');
    harness.rankings[0]?.reject(new RankingRequestError('failed', undefined));
    await flush();

    harness.controller.pointerOver('retry');
    harness.controller.pointerDown('retry');
    harness.controller.pointerUp('retry');

    expect(harness.loaded().rankings).toEqual({ kind: 'loading' });
    expect(harness.rankings).toHaveLength(2);
  });

  it('scrolls the list with up and down keys without the focus sound', async () => {
    const harness = await rankingHarness([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(rankedChart));

    harness.controller.moveFocus('down');
    harness.controller.moveFocus('down');
    harness.controller.moveFocus('down');
    expect(getRankingTopRow(harness)).toBe(2);

    harness.controller.moveFocus('up');
    expect(getRankingTopRow(harness)).toBe(1);
    expect(harness.loaded().summaryFocus).toBe('nickname');
    expect(harness.focusSoundCount()).toBe(0);
  });

  it('asks for the best scores of every difficulty first and reloads from the top when the sort changes', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(rankedChart);
    const harness = await rankingHarness(items);
    expect(harness.rankingQueries).toEqual([
      {
        sort: 'score',
        laneCount: null,
        difficulty: null,
        cursor: null,
      },
    ]);
    harness.controller.moveFocus('down');

    harness.controller.toggleRankingSort();

    expect(harness.loaded().rankings).toEqual({ kind: 'loading' });
    expect(harness.loaded().rankings.kind).toBe('loading');
    expect(harness.rankingQueries.at(-1)).toEqual({
      sort: 'achieved',
      laneCount: null,
      difficulty: null,
      cursor: null,
    });
  });

  it('turns a difficulty off when it is picked again and clears both filters with ALL', async () => {
    const harness = await rankingHarness([rankedChart(1)]);

    harness.controller.selectRankingDifficulty('hard');
    expect(harness.loaded().rankingDifficulty).toBe('hard');
    expect(harness.rankingQueries.at(-1)).toMatchObject({ difficulty: 'hard' });

    harness.controller.selectRankingDifficulty('hard');
    expect(harness.loaded().rankingDifficulty).toBe('all');
    expect(harness.rankingQueries.at(-1)).toMatchObject({ difficulty: null });

    harness.controller.selectRankingLane(5);
    harness.controller.selectRankingDifficulty('expert');
    harness.controller.clearRankingFilters();
    expect(harness.rankingQueries.at(-1)).toMatchObject({
      laneCount: null,
      difficulty: null,
    });

    const requestCount = harness.rankings.length;
    harness.controller.clearRankingFilters();
    expect(harness.rankings).toHaveLength(requestCount);
  });

  it('ignores the answer of the previous difficulty after another is picked', async () => {
    const harness = await rankingHarness([rankedChart(1)]);

    harness.controller.selectRankingDifficulty('hard');
    harness.controller.selectRankingDifficulty('easy');
    harness.rankings.at(-2)?.resolve({
      items: [rankedChart(2)],
      next: null,
    });
    await flush();
    expect(harness.loaded().rankings).toEqual({ kind: 'loading' });

    const items = [rankedChart(3)];
    harness.rankings.at(-1)?.resolve({
      items,
      next: null,
    });
    await flush();
    expect(harness.loaded().rankings).toMatchObject({ items });
  });

  it('turns the difficulty with the tab keys only on the ranking tab', async () => {
    const harness = await rankingHarness([rankedChart(1)]);

    harness.controller.switchTab(1);
    expect(harness.loaded().rankingDifficulty).toBe('easy');
    harness.controller.switchTab(-1);
    expect(harness.loaded().rankingDifficulty).toBe('all');

    harness.controller.selectTab('stats');
    const requestCount = harness.rankings.length;
    harness.controller.switchTab(1);
    expect(harness.loaded().rankingDifficulty).toBe('all');
    expect(harness.rankings).toHaveLength(requestCount);
  });

  it('filters by lane count together with the difficulty and reloads from the top', async () => {
    const harness = await rankingHarness([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(rankedChart));
    harness.controller.selectRankingDifficulty('hard');
    harness.rankings.at(-1)?.resolve({
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(rankedChart),
      next: null,
    });
    await flush();
    harness.controller.moveFocus('down');

    harness.controller.selectRankingLane(5);

    expect(harness.loaded().rankings.kind).toBe('loading');
    expect(harness.rankingQueries.at(-1)).toEqual({
      sort: 'score',
      laneCount: 5,
      difficulty: 'hard',
      cursor: null,
    });
    harness.controller.selectRankingLane(5);
    expect(harness.loaded().rankingLane).toBe('all');
  });

  it('does not scroll a list that fits', async () => {
    const harness = await rankingHarness([1, 2, 3].map(rankedChart));
    const count = harness.rendered.length;

    harness.controller.moveFocus('down');
    harness.controller.scrollByWheel(WHEEL_STEP_PX * 2, 0);

    expect(harness.rendered).toHaveLength(count);
  });

  it('requests the next page near the end of the list and keeps the list when it fails', async () => {
    const cursor = {
      value: 20,
      chartId: 'chart20',
    };
    const firstPage = Array.from({ length: 20 }, (_, index) => rankedChart(index + 1));
    const harness = await rankingHarness(firstPage, cursor);

    harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);
    expect(harness.rankings).toHaveLength(1);

    harness.controller.scrollByWheel(WHEEL_STEP_PX * 2, 1000);
    expect(harness.rankingCursors).toEqual([null, cursor]);
    harness.controller.scrollByWheel(WHEEL_STEP_PX, 2000);
    expect(harness.rankings).toHaveLength(2);

    harness.rankings[1]?.reject(new RankingRequestError('failed', undefined));
    await flush();
    expect(getRankedChartIds(harness)).toHaveLength(20);

    harness.controller.scrollByWheel(WHEEL_STEP_PX, 3000);
    expect(harness.rankingCursors).toEqual([null, cursor, cursor]);

    const topRow = getRankingTopRow(harness);
    harness.rankings[2]?.resolve({
      items: [rankedChart(21)],
      next: null,
    });
    await flush();
    expect(getRankedChartIds(harness).at(-1)).toBe('chart21');
    expect(getRankingTopRow(harness)).toBe(topRow);
    expect(harness.loaded().rankings).toMatchObject({ more: { kind: 'end' } });
  });

  it('scrolls the list with the wheel only on the ranking tab', async () => {
    const harness = await rankingHarness([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(rankedChart));

    harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);
    expect(getRankingTopRow(harness)).toBe(1);

    harness.controller.selectTab('stats');
    const count = harness.rendered.length;
    harness.controller.scrollByWheel(WHEEL_STEP_PX, 1000);

    expect(harness.rendered).toHaveLength(count);
    expect(getRankingTopRow(harness)).toBe(1);
  });

  it('does not scroll the list behind the controls', async () => {
    const harness = await rankingHarness([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(rankedChart));
    harness.controller.openControls();
    const count = harness.rendered.length;

    harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);

    expect(harness.rendered).toHaveLength(count);
    expect(getRankingTopRow(harness)).toBe(0);
  });

  it('does not scroll the list behind the account deletion dialog', async () => {
    const harness = await rankingHarness([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(rankedChart));
    harness.controller.pointerOver('deleteEntry');
    harness.controller.pointerDown('deleteEntry');
    harness.controller.pointerUp('deleteEntry');
    expect(harness.loaded().accountDeletion.kind).toBe('confirming');
    const count = harness.rendered.length;

    harness.controller.scrollByWheel(WHEEL_STEP_PX, 0);

    expect(harness.rendered).toHaveLength(count);
    expect(getRankingTopRow(harness)).toBe(0);
  });

  it('ignores rankings that arrive after close', async () => {
    const harness = await loadedHarness();
    harness.controller.selectTab('ranking');
    const count = harness.rendered.length;
    harness.controller.close();

    harness.rankings[0]?.resolve({
      items: [rankedChart(1)],
      next: null,
    });
    await flush();

    expect(harness.rendered).toHaveLength(count);
  });

  it('signs out to the main screen from the account card', async () => {
    const harness = await loadedHarness();

    harness.controller.pointerDown('accountSignOut');
    harness.controller.pointerUp('accountSignOut');

    expect(harness.signOutCount()).toBe(1);
    expect(harness.mainLeaveCount()).toBe(1);
    expect(harness.leaveCount()).toBe(0);
  });
});
