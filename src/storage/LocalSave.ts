import { parseLanguage } from '../i18n/language.js';
import type { Language } from '../i18n/language.js';
import type { Difficulty, FinishedGameplayResult } from '../rhythm/types.js';

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
  /** null이면 사용자가 고르지 않은 상태로, 브라우저 언어를 따른다. */
  language: Language | null;
}

export interface ChartRecord {
  score: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
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
  volume: { min: 0, max: 1, step: 0.1 },
  inputOffsetMs: { min: -300, max: 300, step: 5 },
  scrollSpeedPxPerSecond: { min: 200, max: 2000, step: 50 },
} as const;

const SETTINGS_KEY = 'dazbeat:settings:v1';
const RECORDS_KEY = 'dazbeat:records:v1';

interface Range {
  min: number;
  max: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
  if (new Set(keys).size !== keys.length) {
    return undefined;
  }
  return [lane0, lane1, lane2, lane3];
}

/** 필드마다 따로 파싱해 손상된 필드만 기본값으로 되돌린다. undefined 가 손상이다. */
const SETTINGS_PARSERS: {
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

function recordKey(songId: string, difficulty: Difficulty): string {
  return `${songId}/${difficulty}`;
}

function parseChartRecord(value: unknown): ChartRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { score, accuracy, maxCombo, cleared } = value;
  return isFiniteNumber(score) &&
    isFiniteNumber(accuracy) &&
    isFiniteNumber(maxCombo) &&
    typeof cleared === 'boolean'
    ? { score, accuracy, maxCombo, cleared }
    : undefined;
}

/** 항목마다 더 좋은 값을 남긴다. 한 번이라도 클리어했으면 클리어로 본다. */
function mergeBestRecord(
  existing: ChartRecord | undefined,
  result: FinishedGameplayResult,
): ChartRecord {
  if (existing === undefined) {
    const { score, accuracy, maxCombo, cleared } = result;
    return { score, accuracy, maxCombo, cleared };
  }
  return {
    score: Math.max(existing.score, result.score),
    accuracy: Math.max(existing.accuracy, result.accuracy),
    maxCombo: Math.max(existing.maxCombo, result.maxCombo),
    cleared: existing.cleared || result.cleared,
  };
}

export class LocalSave {
  constructor(private readonly storage: Storage) {}

  loadSettings(): Settings {
    const saved = this.readObject(SETTINGS_KEY, 'settings', 'using defaults');
    if (saved === null) {
      return { ...DEFAULT_SETTINGS };
    }
    let recovered = false;
    const read = <K extends keyof Settings>(field: K): Settings[K] => {
      const value = SETTINGS_PARSERS[field](saved[field]);
      if (value !== undefined) {
        return value;
      }
      recovered = true;
      return DEFAULT_SETTINGS[field];
    };
    const settings: Settings = {
      masterVolume: read('masterVolume'),
      musicVolume: read('musicVolume'),
      effectVolume: read('effectVolume'),
      inputOffsetMs: read('inputOffsetMs'),
      scrollSpeedPxPerSecond: read('scrollSpeedPxPerSecond'),
      keyBindings: read('keyBindings'),
      mvMode: read('mvMode'),
      language: read('language'),
    };
    if (recovered) {
      console.warn('Saved settings had invalid fields; replaced them with defaults');
    }
    return settings;
  }

  saveSettings(settings: Settings): void {
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  loadRecord(songId: string, difficulty: Difficulty): ChartRecord | null {
    return this.readRecords()[recordKey(songId, difficulty)] ?? null;
  }

  saveResult(songId: string, difficulty: Difficulty, result: FinishedGameplayResult): void {
    const records = this.readRecords();
    const key = recordKey(songId, difficulty);
    records[key] = mergeBestRecord(records[key], result);
    this.storage.setItem(RECORDS_KEY, JSON.stringify(records));
  }

  private readRecords(): Record<string, ChartRecord> {
    const records: Record<string, ChartRecord> = {};
    const saved = this.readObject(RECORDS_KEY, 'records', 'ignoring them');
    if (saved === null) {
      return records;
    }
    for (const [key, value] of Object.entries(saved)) {
      const record = parseChartRecord(value);
      if (record !== undefined) {
        records[key] = record;
      }
    }
    return records;
  }

  /** 저장값이 없거나 객체 JSON이 아니면 null. 손상된 경우에만 `fallback` 문구로 경고한다. */
  private readObject(key: string, label: string, fallback: string): Record<string, unknown> | null {
    const raw = this.storage.getItem(key);
    if (raw === null) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`Saved ${label} are not valid JSON; ${fallback}`);
      return null;
    }
    if (!isRecord(parsed)) {
      console.warn(`Saved ${label} are not an object; ${fallback}`);
      return null;
    }
    return parsed;
  }
}
