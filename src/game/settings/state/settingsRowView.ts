import { LANGUAGE_NAMES } from '../../../i18n/language.js';
import type { Language } from '../../../i18n/language.js';
import type { Lane } from '../../../rhythm/types.js';
import type { Settings } from '../../../storage/settings.js';
import { formatKeyCode } from '../../ui/state/format.js';
import { requireDefined } from '../../../invariant.js';
import type { SettingsRow } from './settingsAdjust.js';

export function isChoiceRow(row: SettingsRow): boolean {
  return row.kind === 'laneMode' || row.kind === 'mvMode' || row.kind === 'language';
}

export function formatRowValue(
  row: SettingsRow,
  settings: Settings,
  language: Language,
  waitingLane: Lane | null,
): string {
  switch (row.kind) {
    case 'volume':
      return `${Math.round(settings[row.field] * 100)}%`;
    case 'inputOffset':
      return `${settings.inputOffsetMs}ms`;
    case 'scrollSpeed':
      return `${settings.scrollSpeedPxPerSecond}px/s`;
    case 'laneMode':
      return `${settings.laneMode}K`;
    case 'mvMode':
      return settings.mvMode.toUpperCase();
    case 'language':
      return LANGUAGE_NAMES[language];
    case 'key':
      return waitingLane === row.lane
        ? ''
        : formatKeyCode(
            requireDefined(
              settings.keyBindings[settings.laneMode][row.lane],
              'No key for the settings lane',
              row.lane,
            ),
          );
  }
}
