import type { Language } from '../i18n/language.js';
import { isOneOf } from '../typeGuards.js';
import { ZODIACS, type Zodiac } from './songs.js';

export type AchievementId = string;
export type AchievementMark = 'clear' | 's' | 'fc' | 'ap';
export const ACHIEVEMENT_MARK_KINDS: readonly AchievementMark[] = ['clear', 's', 'fc', 'ap'];
export type AchievementSet = 'rhythm' | 'zodiac' | 'discography';
export const ACHIEVEMENT_SETS: readonly AchievementSet[] = ['rhythm', 'zodiac', 'discography'];
export type AchievementCategory =
  | 'songClear'
  | 'play'
  | 'skill'
  | 'zodiacComplete'
  | 'zodiacStage'
  | 'chartPioneer'
  | 'expert'
  | 'precision'
  | 'songMaster'
  | 'zodiacPilgrimage'
  | 'zodiacAllS'
  | 'zodiacAllFullCombo'
  | 'zodiacAllPerfect'
  | 'album';
export const ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[] = [
  'songClear',
  'play',
  'skill',
  'zodiacComplete',
  'zodiacStage',
  'chartPioneer',
  'expert',
  'precision',
  'songMaster',
  'zodiacPilgrimage',
  'zodiacAllS',
  'zodiacAllFullCombo',
  'zodiacAllPerfect',
  'album',
];
export type AchievementRule =
  | { kind: 'plays'; target: number }
  | { kind: 'songs'; mark: 'clear'; target: number }
  | { kind: 'charts'; mark: AchievementMark; target: number; difficulty: 'expert' | null }
  | { kind: 'songMarks'; mark: AchievementMark; target: number }
  | { kind: 'zodiacVisits'; mark: AchievementMark; target: number }
  | { kind: 'zodiacComplete'; mark: AchievementMark; zodiac: Zodiac }
  | { kind: 'zodiacCompletions'; target: number }
  | { kind: 'album'; album: string; mark: 'clear' | 's' | 'fc' };
export const ACHIEVEMENT_RULE_KINDS: readonly AchievementRule['kind'][] = [
  'plays',
  'songs',
  'charts',
  'songMarks',
  'zodiacVisits',
  'zodiacComplete',
  'zodiacCompletions',
  'album',
];

type AlbumRule = Extract<AchievementRule, { kind: 'album' }>;
type NonAlbumRule = Exclude<AchievementRule, AlbumRule>;

export type AchievementDefinition = {
  readonly id: AchievementId;
  readonly set: AchievementSet;
  readonly isRetired: boolean;
} & (
  | { readonly category: 'album'; readonly rule: AlbumRule }
  | { readonly category: Exclude<AchievementCategory, 'album'>; readonly rule: NonAlbumRule }
);

export type NamedAchievementDefinition = AchievementDefinition & {
  readonly names: Readonly<Record<Language, string>>;
};

export interface AchievementCatalog {
  readonly definitions: readonly NamedAchievementDefinition[];
  readonly albumNames: ReadonlyMap<string, string>;
}

export interface AchievementFields {
  readonly key: string;
  readonly achievementSet: string;
  readonly category: string;
  readonly kind: string;
  readonly target: number;
  readonly mark: string;
  readonly difficulty: string;
  readonly zodiac: string;
  readonly album: string;
  readonly retired: boolean;
}

export class InvalidAchievementDefinitionError extends Error {
  override readonly name = 'InvalidAchievementDefinitionError';

  constructor(
    readonly field: keyof AchievementFields,
    readonly code: 'validation_required' | 'validation_invalid_value',
    message: string,
  ) {
    super(message);
  }
}

const isAchievementSet = isOneOf(ACHIEVEMENT_SETS);
const isAchievementCategory = isOneOf(ACHIEVEMENT_CATEGORIES);
const isAchievementRuleKind = isOneOf(ACHIEVEMENT_RULE_KINDS);
const isAchievementMark = isOneOf(ACHIEVEMENT_MARK_KINDS);
const isClearMark = isOneOf<'clear'>(['clear']);
const isAlbumMark = isOneOf<'clear' | 's' | 'fc'>(['clear', 's', 'fc']);
const isZodiac = isOneOf(ZODIACS);

export function parseAchievementDefinition(fields: AchievementFields): AchievementDefinition {
  const parseListed = <T>(
    field: 'achievementSet' | 'category' | 'kind' | 'mark' | 'zodiac',
    isListed: (value: unknown) => value is T,
  ): T => {
    const value = fields[field];
    if (value === '') {
      throw new InvalidAchievementDefinitionError(
        field,
        'validation_required',
        `The ${field} is required.`,
      );
    }
    if (!isListed(value)) {
      throw new InvalidAchievementDefinitionError(
        field,
        'validation_invalid_value',
        `The ${field} is not allowed.`,
      );
    }
    return value;
  };
  const parseTarget = (): number => {
    if (fields.target < 1) {
      throw new InvalidAchievementDefinitionError(
        'target',
        'validation_required',
        'The target must be at least 1.',
      );
    }
    return fields.target;
  };

  const set = parseListed('achievementSet', isAchievementSet);
  const category = parseListed('category', isAchievementCategory);
  const kind = parseListed('kind', isAchievementRuleKind);
  const base = {
    id: fields.key,
    set,
    isRetired: fields.retired,
  };
  const mismatch = new InvalidAchievementDefinitionError(
    'category',
    'validation_invalid_value',
    'The album category must be used with the album kind only.',
  );
  if (category === 'album') {
    if (kind !== 'album') {
      throw mismatch;
    }
    const mark = parseListed('mark', isAlbumMark);
    if (fields.album === '') {
      throw new InvalidAchievementDefinitionError(
        'album',
        'validation_required',
        'The album is required.',
      );
    }
    return {
      ...base,
      category,
      rule: {
        kind,
        album: fields.album,
        mark,
      },
    };
  }
  if (kind === 'album') {
    throw mismatch;
  }
  const rule = ((): NonAlbumRule => {
    switch (kind) {
      case 'plays':
      case 'zodiacCompletions':
        return {
          kind,
          target: parseTarget(),
        };
      case 'songs': {
        const target = parseTarget();
        return {
          kind,
          mark: parseListed('mark', isClearMark),
          target,
        };
      }
      case 'charts': {
        const target = parseTarget();
        const mark = parseListed('mark', isAchievementMark);
        if (fields.difficulty !== '' && fields.difficulty !== 'expert') {
          throw new InvalidAchievementDefinitionError(
            'difficulty',
            'validation_invalid_value',
            'The difficulty is not allowed.',
          );
        }
        return {
          kind,
          mark,
          target,
          difficulty: fields.difficulty === '' ? null : 'expert',
        };
      }
      case 'songMarks':
      case 'zodiacVisits': {
        const target = parseTarget();
        return {
          kind,
          mark: parseListed('mark', isAchievementMark),
          target,
        };
      }
      case 'zodiacComplete': {
        const mark = parseListed('mark', isAchievementMark);
        return {
          kind,
          mark,
          zodiac: parseListed('zodiac', isZodiac),
        };
      }
    }
  })();

  return {
    ...base,
    category,
    rule,
  };
}

export function findAchievement(
  catalog: AchievementCatalog,
  id: string,
): NamedAchievementDefinition | undefined {
  return catalog.definitions.find((definition) => definition.id === id);
}
