import { LANGUAGES } from '../../i18n/language.js';
import type { Language } from '../../i18n/language.js';
import type { Lane } from '../../rhythm/types.js';
import { MV_MODES, SETTINGS_LIMITS } from '../../storage/LocalSave.js';
import type { Settings } from '../../storage/LocalSave.js';
import { clamp, stepItem } from '../range.js';

export type VolumeField = 'masterVolume' | 'musicVolume' | 'effectVolume';

export type SettingsRow =
  | { kind: 'volume'; field: VolumeField }
  | { kind: 'inputOffset' }
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

/**
 * 바꿀 수 없으면 같은 `settings` 객체를 그대로 돌려준다.
 * `language`는 설정에서 언어를 고르지 않았을 때 화면에 표시 중인 언어다.
 */
export function adjustSetting(
  settings: Settings,
  row: SettingsRow,
  direction: 1 | -1,
  language: Language,
): Settings {
  switch (row.kind) {
    case 'volume': {
      const volume = stepInRange(settings[row.field], SETTINGS_LIMITS.volume, direction);
      return volume === settings[row.field] ? settings : { ...settings, [row.field]: volume };
    }
    case 'inputOffset': {
      const inputOffsetMs = stepInRange(
        settings.inputOffsetMs,
        SETTINGS_LIMITS.inputOffsetMs,
        direction,
      );
      return inputOffsetMs === settings.inputOffsetMs ? settings : { ...settings, inputOffsetMs };
    }
    case 'scrollSpeed': {
      const scrollSpeedPxPerSecond = stepInRange(
        settings.scrollSpeedPxPerSecond,
        SETTINGS_LIMITS.scrollSpeedPxPerSecond,
        direction,
      );
      return scrollSpeedPxPerSecond === settings.scrollSpeedPxPerSecond
        ? settings
        : { ...settings, scrollSpeedPxPerSecond };
    }
    case 'mvMode': {
      const mvMode = stepItem(MV_MODES, settings.mvMode, direction);
      return mvMode === settings.mvMode ? settings : { ...settings, mvMode };
    }
    case 'language': {
      const next = stepItem(LANGUAGES, language, direction);
      return next === language ? settings : { ...settings, language: next };
    }
    case 'key':
      return settings;
  }
}

export function canAdjust(
  settings: Settings,
  row: SettingsRow,
  direction: 1 | -1,
  language: Language,
): boolean {
  return adjustSetting(settings, row, direction, language) !== settings;
}

/** 이미 다른 레인에 쓰인 키면 두 레인의 키를 맞바꾼다. */
export function assignKey(
  keyBindings: Settings['keyBindings'],
  lane: Lane,
  code: string,
): Settings['keyBindings'] {
  const next: [string, string, string, string] = [...keyBindings];
  const otherLane = next.indexOf(code);
  if (otherLane !== -1) {
    next[otherLane] = next[lane];
  }
  next[lane] = code;
  return next;
}
