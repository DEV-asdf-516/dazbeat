import type PocketBase from 'pocketbase';
import { z } from 'zod';
import {
  InvalidAchievementDefinitionError,
  parseAchievementDefinition,
} from '../data/achievements.js';
import type { AchievementCatalog, NamedAchievementDefinition } from '../data/achievements.js';
import { toParseIssue } from '../data/parseIssue.js';
import { ACHIEVEMENTS, ALBUMS } from '../pbCollections.js';
import { relation, select } from '../pbQuery.js';
import { isBoolean, isFiniteNumber, isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';
import { requireDefined } from '../invariant.js';

const ACHIEVEMENT_ALBUM = relation(ACHIEVEMENTS, 'album', ALBUMS, ['name']);

// album 이 빈 행은 PocketBase 가 expand 를 빼고 보낸다.
const albumExpand = z
  .object({ [ACHIEVEMENT_ALBUM.name]: z.object({ name: z.string() }).optional() })
  .optional();

export async function loadAchievementCatalog(pb: PocketBase): Promise<AchievementCatalog> {
  const records = await pb.collection(ACHIEVEMENTS.name).getFullList({
    ...select(
      ACHIEVEMENTS,
      [
        'id',
        'key',
        'achievementSet',
        'category',
        'kind',
        'target',
        'mark',
        'difficulty',
        'zodiac',
        'album',
        'retired',
        'nameKo',
        'nameJa',
        'nameEn',
      ],
      [ACHIEVEMENT_ALBUM],
    ),
  });
  const definitions: NamedAchievementDefinition[] = [];
  const albumNames = new Map<string, string>();
  for (const record of records) {
    const field = <T>(name: string, guard: (value: unknown) => value is T): T =>
      readRecordField(record, ACHIEVEMENTS.name, name, guard);
    const fields = {
      key: field('key', isString),
      achievementSet: field('achievementSet', isString),
      category: field('category', isString),
      kind: field('kind', isString),
      target: field('target', isFiniteNumber),
      mark: field('mark', isString),
      difficulty: field('difficulty', isString),
      zodiac: field('zodiac', isString),
      album: field('album', isString),
      retired: field('retired', isBoolean),
    };
    const names = {
      ko: field('nameKo', isString),
      ja: field('nameJa', isString),
      en: field('nameEn', isString),
    };
    let definition;
    try {
      definition = parseAchievementDefinition(fields);
    } catch (error) {
      if (error instanceof InvalidAchievementDefinitionError) {
        console.warn(
          `Skipping invalid achievement ${fields.key}: ${error.field} ${error.code} (${error.message})`,
        );
        continue;
      }
      throw error;
    }
    if (definition.rule.kind === 'album') {
      const expand = albumExpand.safeParse(record.expand);
      if (!expand.success) {
        const { path, reason } = toParseIssue(expand.error, 'expand');
        throw new Error(`Invalid ${ACHIEVEMENTS.name} record ${record.id}: ${path} ${reason}`);
      }
      const album = requireDefined(
        expand.data?.album,
        'Invalid achievements record expand.album',
        record.id,
      );
      albumNames.set(definition.rule.album, album.name);
    }
    definitions.push({
      ...definition,
      names,
    });
  }
  return {
    definitions,
    albumNames,
  };
}
