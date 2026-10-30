import { describe, expect, it, vi } from 'vitest';
import type {
  AchievementDefinition,
  AchievementId,
  AchievementSet,
  NamedAchievementDefinition,
} from '../../../src/data/achievements.js';
import { parseNickname } from '../../../src/data/nickname.js';
import type { Nickname } from '../../../src/data/nickname.js';
import { ProfileRequestError } from '../../../src/data/profile.js';
import type { Profile, ProfileRequestErrorKind } from '../../../src/data/profile.js';
import { ProfileController } from '../../../src/game/profile/ProfileController.js';
import type { ProfileDeps } from '../../../src/game/profile/ProfileController.js';
import type { ProfileHover, ProfileState } from '../../../src/game/profile/state/profileState.js';
import { requireDefined } from '../../../src/invariant.js';

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
      albumNames: new Map(),
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

interface Harness {
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
  leaveCount(): number;
  focusSoundCount(): number;
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
  let leaves = 0;
  let focusSounds = 0;
  const deps: ProfileDeps = {
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
  };
  const controller = new ProfileController(deps, {
    render: (previousState, next) => {
      rendered.push(next.page);
      previous.push(previousState?.page ?? null);
      controlsOpen.push(next.isControlsOpen);
      hovers.push(next.hover);
    },
    playFocusSound: () => {
      focusSounds += 1;
    },
    leaveToMain: () => {
      leaves += 1;
    },
  });
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
    leaveCount: () => leaves,
    focusSoundCount: () => focusSounds,
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

    harness.controller.retry();
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

  it('does not retry unless the load failed', async () => {
    const harness = await loadedHarness();

    harness.controller.retry();

    expect(harness.loads).toHaveLength(1);
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

    harness.controller.selectTab('stats');
    expect(harness.loaded().summaryTab).toBe('collection');
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
    harness.controller.start();

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
    harness.controller.focusAchievement('ZODIAC_ARIES');
    expect(harness.rendered).toHaveLength(count);
    expect(harness.focusSoundCount()).toBe(sounds + 1);
  });

  it('leaves to the main screen from the summary, guest and failure screens', async () => {
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

    harness.featured[0]?.response.resolve(FIRST_CLEAR.id);
    await flush();

    expect(harness.loaded().featuredSave).toBe('idle');
    expect(harness.loaded().profile.featuredAchievement).toBe(FIRST_CLEAR);
  });

  it('unequips the featured achievement when it is selected again', async () => {
    const harness = await collectionHarness(createProfile({ featuredAchievement: FIRST_CLEAR }));

    harness.controller.select();
    expect(harness.featured.map(({ id }) => id)).toEqual([null]);

    harness.featured[0]?.response.resolve(null);
    await flush();

    expect(harness.loaded().profile.featuredAchievement).toBeNull();
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

  it('ignores hover unless loaded', () => {
    const harness = createHarness();
    harness.controller.start();

    harness.controller.hover({
      kind: 'summaryTab',
      tab: 'collection',
    });
    harness.controller.unhover({
      kind: 'summaryTab',
      tab: 'collection',
    });

    expect(harness.rendered).toEqual([{ kind: 'loading' }]);
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

describe('ProfileController controls', () => {
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

  it('ignores a press on the close button while the controls are closed', async () => {
    const harness = await loadedHarness();
    const count = harness.rendered.length;

    harness.controller.pointerDown('controlsClose');

    expect(harness.rendered).toHaveLength(count);
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
