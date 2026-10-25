import { parseLanguage } from '../i18n/language.js';
import type { Language } from '../i18n/language.js';
import { LANE_COUNTS } from '../rhythm/lanes.js';
import { INPUT_OFFSET_RANGE_MS } from '../rhythm/playTiming.js';
import type { LaneCount } from '../rhythm/types.js';
import { isFiniteNumber, isOneOf, isRecord } from '../typeGuards.js';

export type MvMode = 'normal' | 'dim' | 'blur' | 'off';

export const MV_MODES: readonly MvMode[] = ['normal', 'dim', 'blur', 'off'];

export type KeyBindings = Readonly<Record<LaneCount, readonly string[]>>;

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  effectVolume: number;
  inputOffsetMs: number;
  scrollSpeedPxPerSecond: number;
  laneMode: LaneCount;
  keyBindings: KeyBindings;
  mvMode: MvMode;
  language: Language | null;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 1,
  musicVolume: 1,
  effectVolume: 1,
  inputOffsetMs: 0,
  scrollSpeedPxPerSecond: 800,
  laneMode: 4,
  keyBindings: {
    4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    5: ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'],
    6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
  },
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

const isLaneCount = isOneOf(LANE_COUNTS);

function isKeyCode(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function parseLaneKeys(value: unknown, laneCount: LaneCount): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length !== laneCount) {
    return undefined;
  }
  const keys: unknown[] = value;
  if (!keys.every(isKeyCode) || new Set(keys).size !== keys.length || keys.includes('Tab')) {
    return undefined;
  }
  return keys;
}

// 모드 사이에는 같은 키를 써도 되므로 중복은 모드 안에서만 본다.
function parseKeyBindings(value: unknown): KeyBindings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const four = parseLaneKeys(value[4], 4);
  const five = parseLaneKeys(value[5], 5);
  const six = parseLaneKeys(value[6], 6);
  if (four === undefined || five === undefined || six === undefined) {
    return undefined;
  }
  return {
    4: four,
    5: five,
    6: six,
  };
}

export const SETTINGS_PARSERS: {
  readonly [K in keyof Settings]: (value: unknown) => Settings[K] | undefined;
} = {
  masterVolume: (value) => parseInRange(value, SETTINGS_LIMITS.volume),
  musicVolume: (value) => parseInRange(value, SETTINGS_LIMITS.volume),
  effectVolume: (value) => parseInRange(value, SETTINGS_LIMITS.volume),
  inputOffsetMs: (value) => parseInRange(value, SETTINGS_LIMITS.inputOffsetMs),
  scrollSpeedPxPerSecond: (value) => parseInRange(value, SETTINGS_LIMITS.scrollSpeedPxPerSecond),
  laneMode: (value) => (isLaneCount(value) ? value : undefined),
  keyBindings: parseKeyBindings,
  mvMode: (value) => MV_MODES.find((mode) => mode === value),
  // 언어 필드가 생기기 전에 저장된 설정에는 값이 없으므로 미선택으로 본다.
  language: (value) => (value === undefined || value === null ? null : parseLanguage(value)),
};
