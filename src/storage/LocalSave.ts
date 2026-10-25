import type { Difficulty, FinishedGameplayResult, LaneCount } from '../rhythm/types.js';
import { mergeBestRecord, parseChartRecord, recordKey } from './chartRecords.js';
import type { ChartRecord, ChartRecords } from './chartRecords.js';
import { DEFAULT_SETTINGS, SETTINGS_PARSERS } from './settings.js';
import type { Settings } from './settings.js';
import { parseJson } from '../json.js';
import { isRecord } from '../typeGuards.js';

const SETTINGS_KEY = 'dazbeat:settings:v1';
const RECORDS_KEY = 'dazbeat:records:v2';

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
      laneMode: read('laneMode'),
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

  loadRecords(): ChartRecords {
    return new Map(Object.entries(this.readRecords()));
  }

  saveResult(
    songId: string,
    laneCount: LaneCount,
    difficulty: Difficulty,
    result: FinishedGameplayResult,
  ): void {
    const records = this.readRecords();
    const key = recordKey(songId, laneCount, difficulty);
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

  private readObject(key: string, label: string, fallback: string): Record<string, unknown> | null {
    const raw = this.storage.getItem(key);
    if (raw === null) {
      return null;
    }
    const parsed = parseJson(raw);
    if (parsed === undefined) {
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
