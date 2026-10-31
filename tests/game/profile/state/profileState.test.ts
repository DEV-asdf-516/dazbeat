import { describe, expect, it } from 'vitest';
import type {
  AchievementDefinition,
  AchievementRule,
  NamedAchievementDefinition,
} from '../../../../src/data/achievements.js';
import { parseNickname } from '../../../../src/data/nickname.js';
import type { Profile } from '../../../../src/data/profile.js';
import { withControlsOpen } from '../../../../src/game/app/controlsGuide.js';
import {
  createProfileScreen,
  focusAchievement,
  getAchievementCondition,
  getChangedRegions,
  getEarnedProgress,
  getEarnedSummary,
  getFeaturedAction,
  getFeaturedIdentity,
  getFocusedEarning,
  getProfileNotice,
  hoverProfileButton,
  isFocusedFeatured,
  loadedState,
  pressProfileButton,
  selectFocused,
  selectSummaryTab,
  setHover,
  withPage,
} from '../../../../src/game/profile/state/profileState.js';
import type {
  LoadedProfileState,
  ProfileScreenState,
  ProfileState,
} from '../../../../src/game/profile/state/profileState.js';
import { requireDefined } from '../../../../src/invariant.js';

function playsOf(id: string, target: number): NamedAchievementDefinition {
  return {
    id,
    set: 'rhythm',
    category: 'play',
    rule: {
      kind: 'plays',
      target,
    },
    isRetired: false,
    names: {
      ko: id,
      ja: id,
      en: id,
    },
  };
}

const FIRST_FINISH = playsOf('FIRST_FINISH', 1);
const PLAY_3 = playsOf('PLAY_3', 3);
const EARNED_AT_MS = Date.parse('2026-10-21T09:12:33.000Z');

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    nickname: requireDefined(parseNickname('과즙이4829'), 'Invalid test nickname'),
    featuredAchievement: null,
    stats: {
      playCount: 3,
      clearedSongCount: 1,
      sChartCount: 0,
      fullComboChartCount: 0,
      allPerfectChartCount: 0,
    },
    achievements: [
      {
        definition: FIRST_FINISH,
        earnedAtMs: EARNED_AT_MS,
        current: 1,
        target: 1,
      },
      {
        definition: PLAY_3,
        earnedAtMs: null,
        current: 1,
        target: 3,
      },
    ],
    newAchievements: new Set(),
    catalog: {
      definitions: [FIRST_FINISH, PLAY_3],
      albumNames: new Map(),
    },
    ...overrides,
  };
}

const SUMMARY = loadedState(createProfile());

function screenOf(page: ProfileState, isControlsOpen = false): ProfileScreenState {
  return withControlsOpen(createProfileScreen(page), isControlsOpen);
}

function openRhythm(state: LoadedProfileState): LoadedProfileState {
  const selection = selectFocused(selectSummaryTab(state, 'collection'), 'rhythm');
  if (selection.kind !== 'state') {
    throw new Error(`expected a state, got ${selection.kind}`);
  }
  return selection.state;
}

describe('getChangedRegions', () => {
  it('draws every page region and every region of the shown section first', () => {
    expect(getChangedRegions(null, screenOf(SUMMARY))).toEqual({
      profile: [
        'pages',
        'title',
        'notice',
        'nicknameInput',
        'controls',
        'backButton',
        'controlsEntry',
        'controlsClose',
      ],
      summary: [
        'labels',
        'identity',
        'pen',
        'nicknameCount',
        'stats',
        'summaryTab',
        'tabs',
        'summaryFocus',
        'setNodes',
      ],
      collection: [],
    });
  });

  it('draws only the section regions that read the hover in the same view', () => {
    expect(
      getChangedRegions(
        screenOf(SUMMARY),
        setHover(screenOf(SUMMARY), {
          kind: 'summaryTab',
          tab: 'collection',
        }),
      ),
    ).toEqual({
      profile: [],
      summary: ['tabs'],
      collection: [],
    });
  });

  it('draws every region of the new section and none of the other when the view changes', () => {
    const collection = openRhythm(SUMMARY);

    expect(getChangedRegions(screenOf(SUMMARY), screenOf(collection))).toEqual({
      profile: ['pages', 'title', 'notice'],
      summary: [],
      collection: [
        'tabs',
        'tabStar',
        'grid',
        'halo',
        'detail',
        'featured',
        'featuredSave',
        'equipButton',
        'unequipButton',
      ],
    });
  });

  it('draws no section before the profile loads', () => {
    expect(getChangedRegions(null, screenOf({ kind: 'loading' }))).toEqual({
      profile: [
        'pages',
        'title',
        'notice',
        'nicknameInput',
        'controls',
        'backButton',
        'controlsEntry',
        'controlsClose',
      ],
      summary: [],
      collection: [],
    });
  });
});

describe('getChangedRegions for the controls', () => {
  it('draws only the controls when only the controls open', () => {
    expect(getChangedRegions(screenOf(SUMMARY), screenOf(SUMMARY, true))).toEqual({
      profile: ['controls', 'controlsClose'],
      summary: [],
      collection: [],
    });
  });
});

describe('getChangedRegions for the buttons', () => {
  it('draws only the hovered button when only a button hover changes', () => {
    const summary = screenOf(SUMMARY);
    const hovered = hoverProfileButton(summary, 'back');

    expect(getChangedRegions(summary, hovered)).toEqual({
      profile: ['backButton'],
      summary: [],
      collection: [],
    });
    expect(getChangedRegions(hovered, pressProfileButton(hovered, 'back'))).toEqual({
      profile: ['backButton'],
      summary: [],
      collection: [],
    });
  });

  it('draws only the featured button when its hover changes in the collection', () => {
    const collection = screenOf(openRhythm(SUMMARY));

    expect(getChangedRegions(collection, hoverProfileButton(collection, 'equip'))).toEqual({
      profile: [],
      summary: [],
      collection: ['equipButton'],
    });
  });

  it('releases the hover of a target the new page hides', () => {
    const hovered = setHover(screenOf(selectSummaryTab(SUMMARY, 'collection')), {
      kind: 'setRow',
      set: 'rhythm',
    });

    expect(withPage(hovered, openRhythm(SUMMARY)).hover).toBeNull();
  });
});

describe('getEarnedProgress', () => {
  it('counts the earned achievements among the given ones', () => {
    expect(getEarnedProgress(SUMMARY, [FIRST_FINISH, PLAY_3])).toEqual({
      earned: 1,
      total: 2,
    });
  });
});

describe('getEarnedSummary', () => {
  it('counts the earned achievements in all and in each set', () => {
    const zodiacStep: NamedAchievementDefinition = {
      ...playsOf('ZODIAC_STEP', 1),
      set: 'zodiac',
    };
    const state = loadedState(
      createProfile({
        achievements: [
          ...createProfile().achievements,
          {
            definition: zodiacStep,
            earnedAtMs: EARNED_AT_MS,
            current: 1,
            target: 1,
          },
        ],
      }),
    );

    expect(getEarnedSummary(state)).toEqual({
      all: {
        earned: 2,
        total: 3,
      },
      bySet: {
        rhythm: {
          earned: 1,
          total: 2,
        },
        zodiac: {
          earned: 1,
          total: 1,
        },
        discography: {
          earned: 0,
          total: 0,
        },
      },
    });
  });
});

describe('getAchievementCondition', () => {
  function conditionOf(rule: AchievementRule): ReturnType<typeof getAchievementCondition> {
    const definition: AchievementDefinition =
      rule.kind === 'album'
        ? {
            id: 'TEST',
            set: 'discography',
            isRetired: false,
            category: 'album',
            rule,
          }
        : {
            id: 'TEST',
            set: 'rhythm',
            isRetired: false,
            category: 'play',
            rule,
          };
    return getAchievementCondition(definition);
  }

  it('reads plays without a mark and uses the single phrase for a target of 1', () => {
    expect(
      conditionOf({
        kind: 'plays',
        target: 1,
      }),
    ).toEqual({
      kind: 'count',
      key: 'playsOne',
      target: 1,
      mark: null,
    });
    expect(
      conditionOf({
        kind: 'plays',
        target: 5,
      }),
    ).toEqual({
      kind: 'count',
      key: 'plays',
      target: 5,
      mark: null,
    });
  });

  it('leaves the clear mark of songs out of the phrase', () => {
    expect(
      conditionOf({
        kind: 'songs',
        mark: 'clear',
        target: 10,
      }),
    ).toEqual({
      kind: 'count',
      key: 'songs',
      target: 10,
      mark: null,
    });
  });

  it('reads expert charts and charts with their mark', () => {
    expect(
      conditionOf({
        kind: 'charts',
        mark: 'fc',
        target: 3,
        difficulty: 'expert',
      }),
    ).toEqual({
      kind: 'count',
      key: 'expertCharts',
      target: 3,
      mark: 'fc',
    });
    expect(
      conditionOf({
        kind: 'charts',
        mark: 's',
        target: 1,
        difficulty: null,
      }),
    ).toEqual({
      kind: 'count',
      key: 'chartsOne',
      target: 1,
      mark: 's',
    });
  });

  it('reads song marks with their mark', () => {
    expect(
      conditionOf({
        kind: 'songMarks',
        mark: 'ap',
        target: 4,
      }),
    ).toEqual({
      kind: 'count',
      key: 'songMarks',
      target: 4,
      mark: 'ap',
    });
  });

  it('reads zodiac visits, zodiac completion and albums with their own values', () => {
    expect(
      conditionOf({
        kind: 'zodiacVisits',
        mark: 'clear',
        target: 6,
      }),
    ).toEqual({
      kind: 'zodiacVisits',
      target: 6,
      mark: 'clear',
    });
    expect(
      conditionOf({
        kind: 'zodiacComplete',
        mark: 's',
        zodiac: 'leo',
      }),
    ).toEqual({
      kind: 'zodiacComplete',
      zodiac: 'leo',
      mark: 's',
    });
    expect(
      conditionOf({
        kind: 'album',
        album: 'album-1',
        mark: 'fc',
      }),
    ).toEqual({
      kind: 'album',
      album: 'album-1',
      mark: 'fc',
    });
  });

  it('uses the single phrase for one zodiac completion', () => {
    expect(
      conditionOf({
        kind: 'zodiacCompletions',
        target: 1,
      }),
    ).toEqual({
      kind: 'count',
      key: 'zodiacCompletionsOne',
      target: 1,
      mark: null,
    });
  });
});

describe('getFocusedEarning', () => {
  it('reads the earned time of the focused achievement or tells it is locked', () => {
    const collection = openRhythm(SUMMARY);

    expect(getFocusedEarning(focusAchievement(collection, FIRST_FINISH.id))).toEqual({
      kind: 'earned',
      earnedAtMs: EARNED_AT_MS,
    });
    expect(getFocusedEarning(focusAchievement(collection, PLAY_3.id))).toEqual({
      kind: 'locked',
    });
  });
});

describe('getFeaturedIdentity', () => {
  it('has nothing without a featured achievement', () => {
    expect(getFeaturedIdentity(SUMMARY)).toEqual({ kind: 'none' });
  });

  it('shows the emblem of the featured achievement only while the nickname is idle', () => {
    const equipped = loadedState(createProfile({ featuredAchievement: FIRST_FINISH }));
    const selection = selectFocused(equipped);
    if (selection.kind !== 'state') {
      throw new Error(`expected a state, got ${selection.kind}`);
    }

    expect(getFeaturedIdentity(equipped)).toEqual({
      kind: 'equipped',
      achievement: FIRST_FINISH,
      isEmblemShown: true,
    });
    expect(getFeaturedIdentity(selection.state)).toEqual({
      kind: 'equipped',
      achievement: FIRST_FINISH,
      isEmblemShown: false,
    });
  });
});

describe('isFocusedFeatured', () => {
  it('agrees with the featured action', () => {
    const collection = focusAchievement(
      openRhythm(loadedState(createProfile({ featuredAchievement: FIRST_FINISH }))),
      FIRST_FINISH.id,
    );
    const other = focusAchievement(collection, PLAY_3.id);

    expect(isFocusedFeatured(collection)).toBe(true);
    expect(getFeaturedAction(collection)).toBe('unequip');
    expect(isFocusedFeatured(other)).toBe(false);
    expect(getFeaturedAction(other)).toBe('none');
  });
});

describe('getProfileNotice', () => {
  it('has a notice only on the guest and failed pages', () => {
    expect(getProfileNotice('guest')).toBe('guest');
    expect(getProfileNotice('failed')).toBe('failed');
    expect(getProfileNotice('loading')).toBeNull();
    expect(getProfileNotice('summary')).toBeNull();
    expect(getProfileNotice('collection')).toBeNull();
  });
});
