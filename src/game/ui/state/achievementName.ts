import type { i18n as I18n } from 'i18next';
import type { NamedAchievementDefinition } from '../../../data/achievements.js';
import { parseLanguage } from '../../../i18n/language.js';
import { requireDefined } from '../../../invariant.js';

export function getAchievementName(i18n: I18n, definition: NamedAchievementDefinition): string {
  return definition.names[
    requireDefined(parseLanguage(i18n.language), 'Unsupported language', i18n.language)
  ];
}
