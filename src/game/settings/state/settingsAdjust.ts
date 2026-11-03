import { LANGUAGES } from '../../../i18n/language.js';
import type { Language } from '../../../i18n/language.js';
import { LANE_COUNTS } from '../../../rhythm/lanes.js';
import type { Lane } from '../../../rhythm/types.js';
import { MV_MODES, SETTINGS_LIMITS } from '../../../storage/settings.js';
import type { Settings, VolumeField } from '../../../storage/settings.js';
import { clamp, stepItem } from '../../../range.js';
import { requireDefined } from '../../../invariant.js';
import { isShallowEqual } from '../../../shallowEqual.js';

export type SettingsRow =
  | { kind: 'volume'; field: VolumeField }
  | { kind: 'inputOffset' }
  | { kind: 'laneMode' }
  | { kind: 'scrollSpeed' }
  | { kind: 'mvMode' }
  | { kind: 'language' }
  | { kind: 'key'; lane: Lane };

// 0.1 같은 소수 step 을 더할 때 생기는 부동소수 오차(0.7 + 0.1 = 0.7999…)를 지운다.
const STEP_PRECISION = 1e6;

function stepInRange(
  value: number,
  { min, max, step }: { min: number; max: number; step: number },
  direction: 1 | -1,
): number {
  return Math.round(clamp(value + direction * step, min, max) * STEP_PRECISION) / STEP_PRECISION;
}

function withChange(settings: Settings, change: Partial<Settings>): Settings {
  const next = {
    ...settings,
    ...change,
  };
  return isShallowEqual(next, settings) ? settings : next;
}

export function adjustSetting(
  settings: Settings,
  row: SettingsRow,
  direction: 1 | -1,
  language: Language,
): Settings {
  switch (row.kind) {
    case 'volume': {
      const volume = stepInRange(settings[row.field], SETTINGS_LIMITS.volume, direction);
      // 음소거 중에 크기를 바꾸면 들으면서 맞추려는 것이므로 음소거를 함께 푼다.
      const isMuted = settings.mutedVolumes.includes(row.field);
      if (volume === settings[row.field] && !isMuted) {
        return settings;
      }
      const adjusted = {
        ...settings,
        [row.field]: volume,
      };
      return isMuted ? toggleMute(adjusted, row.field) : adjusted;
    }
    case 'inputOffset':
      return withChange(settings, {
        inputOffsetMs: stepInRange(
          settings.inputOffsetMs,
          SETTINGS_LIMITS.inputOffsetMs,
          direction,
        ),
      });
    case 'scrollSpeed':
      return withChange(settings, {
        scrollSpeedPxPerSecond: stepInRange(
          settings.scrollSpeedPxPerSecond,
          SETTINGS_LIMITS.scrollSpeedPxPerSecond,
          direction,
        ),
      });
    case 'laneMode':
      return withChange(settings, {
        laneMode: stepItem(LANE_COUNTS, settings.laneMode, direction),
      });
    case 'mvMode':
      return withChange(settings, { mvMode: stepItem(MV_MODES, settings.mvMode, direction) });
    case 'language': {
      const next = stepItem(LANGUAGES, language, direction);
      return next === language
        ? settings
        : {
            ...settings,
            language: next,
          };
    }
    case 'key':
      return settings;
  }
}

export function toggleMute(settings: Settings, field: VolumeField): Settings {
  const { mutedVolumes } = settings;
  return {
    ...settings,
    mutedVolumes: mutedVolumes.includes(field)
      ? mutedVolumes.filter((muted) => muted !== field)
      : [...mutedVolumes, field],
  };
}

export function canAdjust(
  settings: Settings,
  row: SettingsRow,
  direction: 1 | -1,
  language: Language,
): boolean {
  return adjustSetting(settings, row, direction, language) !== settings;
}

export function assignKey(keys: readonly string[], lane: Lane, code: string): readonly string[] {
  const next = [...keys];
  const otherLane = next.indexOf(code);
  if (otherLane !== -1) {
    next[otherLane] = requireDefined(next[lane], 'Invalid key lane', lane);
  }
  next[lane] = code;
  return next;
}
