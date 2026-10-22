import { parseLanguage } from '../i18n/language.js';
import type { Language } from '../i18n/language.js';
import { INPUT_OFFSET_RANGE_MS } from '../rhythm/playTiming.js';
import { isFiniteNumber } from '../typeGuards.js';

export type MvMode = 'normal' | 'dim' | 'blur' | 'off';

export const MV_MODES: readonly MvMode[] = ['normal', 'dim', 'blur', 'off'];

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  effectVolume: number;
  inputOffsetMs: number;
  scrollSpeedPxPerSecond: number;
  keyBindings: readonly [string, string, string, string];
  mvMode: MvMode;
  language: Language | null;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 1,
  musicVolume: 1,
  effectVolume: 1,
  inputOffsetMs: 0,
  scrollSpeedPxPerSecond: 800,
  keyBindings: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
  mvMode: 'dim',
  language: null,
};

export const SETTINGS_LIMITS = {
  volume: {
    min: 0,
    max: 1,
    step: 0.1,
  },
  inputOffsetMs: {
    ...INPUT_OFFSET_RANGE_MS,
    step: 5,
  },
  scrollSpeedPxPerSecond: {
    min: 200,
    max: 2000,
    step: 50,
  },
} as const;

interface Range {
  min: number;
  max: number;
}

function parseInRange(value: unknown, { min, max }: Range): number | undefined {
  return isFiniteNumber(value) && value >= min && value <= max ? value : undefined;
}

function isKeyCode(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function parseKeyBindings(value: unknown): Settings['keyBindings'] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const keys: unknown[] = value;
  const [lane0, lane1, lane2, lane3] = keys;
  if (!isKeyCode(lane0) || !isKeyCode(lane1) || !isKeyCode(lane2) || !isKeyCode(lane3)) {
    return undefined;
  }
  if (new Set(keys).size !== keys.length || keys.includes('Tab')) {
    return undefined;
  }
  return [lane0, lane1, lane2, lane3];
}

export const SETTINGS_PARSERS: {
  readonly [K in keyof Settings]: (value: unknown) => Settings[K] | undefined;
} = {
  masterVolume: (value) => parseInRange(value, SETTINGS_LIMITS.volume),
  musicVolume: (value) => parseInRange(value, SETTINGS_LIMITS.volume),
  effectVolume: (value) => parseInRange(value, SETTINGS_LIMITS.volume),
  inputOffsetMs: (value) => parseInRange(value, SETTINGS_LIMITS.inputOffsetMs),
  scrollSpeedPxPerSecond: (value) => parseInRange(value, SETTINGS_LIMITS.scrollSpeedPxPerSecond),
  keyBindings: parseKeyBindings,
  mvMode: (value) => MV_MODES.find((mode) => mode === value),
  // 언어 필드가 생기기 전에 저장된 설정에는 값이 없으므로 미선택으로 본다.
  language: (value) => (value === undefined || value === null ? null : parseLanguage(value)),
};
