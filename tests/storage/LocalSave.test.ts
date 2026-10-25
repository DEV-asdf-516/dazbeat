import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { LANGUAGES } from '../../src/i18n/language.js';
import { LANE_COUNTS } from '../../src/rhythm/lanes.js';
import { getChartRecord } from '../../src/storage/chartRecords.js';
import { LocalSave } from '../../src/storage/LocalSave.js';
import { DEFAULT_SETTINGS, MV_MODES } from '../../src/storage/settings.js';
import type { KeyBindings, Settings } from '../../src/storage/settings.js';
import type { FinishedGameplayResult } from '../../src/rhythm/types.js';

const SETTINGS_KEY = 'dazbeat:settings:v1';
const RECORDS_KEY = 'dazbeat:records:v2';
const CUSTOM_KEY_BINDINGS: KeyBindings = {
  4: ['KeyQ', 'KeyW', 'KeyO', 'KeyP'],
  5: ['KeyQ', 'KeyW', 'Space', 'KeyO', 'KeyP'],
  6: ['KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL'],
};

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function makeResult(overrides: Partial<FinishedGameplayResult>): FinishedGameplayResult {
  return {
    score: 1000,
    accuracy: 0.5,
    maxCombo: 10,
    counts: {
      perfect: 1,
      great: 0,
      good: 0,
      bad: 0,
      miss: 1,
    },
    outcome: 'finished',
    cleared: false,
    ...overrides,
  };
}

let storage: MemoryStorage;
let save: LocalSave;
let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  storage = new MemoryStorage();
  save = new LocalSave(storage);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LocalSave settings', () => {
  it('returns defaults without warning when nothing is saved', () => {
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each(['{not json', '[1, 2]', '42', 'null'])(
    'returns defaults and warns once for %s',
    (raw) => {
      storage.setItem(SETTINGS_KEY, raw);
      expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps valid fields and replaces invalid ones with defaults, warning once', () => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        masterVolume: 0.4,
        musicVolume: 'NaN',
        effectVolume: 0.3,
        inputOffsetMs: 301,
        scrollSpeedPxPerSecond: '900',
        laneMode: 6,
        keyBindings: CUSTOM_KEY_BINDINGS,
      }),
    );
    expect(save.loadSettings()).toEqual({
      masterVolume: 0.4,
      musicVolume: DEFAULT_SETTINGS.musicVolume,
      effectVolume: 0.3,
      inputOffsetMs: DEFAULT_SETTINGS.inputOffsetMs,
      scrollSpeedPxPerSecond: DEFAULT_SETTINGS.scrollSpeedPxPerSecond,
      laneMode: 6,
      keyBindings: CUSTOM_KEY_BINDINGS,
      mvMode: DEFAULT_SETTINGS.mvMode,
      language: DEFAULT_SETTINGS.language,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('replaces a non-finite volume with the default', () => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        masterVolume: 0.5,
      }).replace('"masterVolume":0.5', '"masterVolume":1e999'),
    );
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns lane mode 4 and the default keys of every mode when nothing is saved', () => {
    const settings = save.loadSettings();
    expect(settings.laneMode).toBe(4);
    expect(settings.keyBindings).toEqual({
      4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
      5: ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'],
      6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
    });
  });

  it.each(LANE_COUNTS)('loads saved lane mode %s without warning', (laneMode) => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      laneMode,
    };
    save.saveSettings(settings);
    expect(save.loadSettings()).toEqual(settings);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['3', 3],
    ['7', 7],
    ['a string', '4'],
    ['a missing value', undefined],
  ])('replaces lane mode %s by 4, warning once', (_label, laneMode) => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        laneMode,
      }),
    );
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the old four-key array', ['KeyA', 'KeyS', 'KeyD', 'KeyF']],
    [
      'a missing mode',
      {
        4: ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
        5: ['KeyA', 'KeyS', 'Space', 'KeyD', 'KeyF'],
      },
    ],
    [
      'three keys for 4K',
      {
        ...DEFAULT_SETTINGS.keyBindings,
        4: ['KeyA', 'KeyS', 'KeyD'],
      },
    ],
    [
      'four keys for 5K',
      {
        ...DEFAULT_SETTINGS.keyBindings,
        5: ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
      },
    ],
    [
      'seven keys for 6K',
      {
        ...DEFAULT_SETTINGS.keyBindings,
        6: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ'],
      },
    ],
    [
      'an empty key',
      {
        ...DEFAULT_SETTINGS.keyBindings,
        5: ['KeyA', '', 'Space', 'KeyD', 'KeyF'],
      },
    ],
    [
      'a duplicate key within a mode',
      {
        ...DEFAULT_SETTINGS.keyBindings,
        6: ['KeyA', 'KeyS', 'KeyA', 'KeyF', 'KeyG', 'KeyH'],
      },
    ],
    [
      'Tab',
      {
        ...DEFAULT_SETTINGS.keyBindings,
        4: ['KeyA', 'Tab', 'KeyD', 'KeyF'],
      },
    ],
  ])('replaces key bindings with %s by the defaults, warning once', (_label, keyBindings) => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        keyBindings,
      }),
    );
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('allows the same key in different modes', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      keyBindings: {
        4: ['KeyA', 'KeyS', 'KeyK', 'KeyL'],
        5: ['KeyA', 'KeyS', 'Space', 'KeyK', 'KeyL'],
        6: ['KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL'],
      },
    };
    save.saveSettings(settings);
    expect(save.loadSettings()).toEqual(settings);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('round-trips saved settings', () => {
    const settings: Settings = {
      masterVolume: 0.7,
      musicVolume: 0.2,
      effectVolume: 0,
      inputOffsetMs: -45,
      scrollSpeedPxPerSecond: 1250,
      laneMode: 5,
      keyBindings: CUSTOM_KEY_BINDINGS,
      mvMode: 'blur',
      language: 'ja',
    };
    save.saveSettings(settings);
    expect(save.loadSettings()).toEqual(settings);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each(MV_MODES)('loads saved MV mode %s without warning', (mvMode) => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      mvMode,
    };
    save.saveSettings(settings);
    expect(save.loadSettings()).toEqual(settings);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing MV mode', undefined],
    ['an unknown MV mode', 'bright'],
    ['a non-string MV mode', 3],
  ])('replaces %s with dim and keeps the other fields, warning once', (_label, mvMode) => {
    const saved = {
      masterVolume: 0.7,
      musicVolume: 0.2,
      effectVolume: 0,
      inputOffsetMs: -45,
      scrollSpeedPxPerSecond: 1250,
      laneMode: 5,
      keyBindings: CUSTOM_KEY_BINDINGS,
      mvMode,
    };
    storage.setItem(SETTINGS_KEY, JSON.stringify(saved));
    expect(save.loadSettings()).toEqual({
      ...saved,
      mvMode: 'dim',
      language: null,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it.each(LANGUAGES)('loads saved language %s without warning', (language) => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      language,
    };
    save.saveSettings(settings);
    expect(save.loadSettings()).toEqual(settings);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing language', undefined],
    ['a null language', null],
  ])('treats %s as not chosen without warning', (_label, language) => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        language,
      }),
    );
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['an unsupported language', 'fr'],
    ['a non-string language', 1],
  ])('replaces %s with null, warning once', (_label, language) => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        language,
      }),
    );
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates setItem errors', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => save.saveSettings(DEFAULT_SETTINGS)).toThrow('quota');
  });
});

describe('LocalSave records', () => {
  it('reads storage once per loadRecords and answers lookups from that snapshot', () => {
    save.saveResult('song-a', 4, 'easy', makeResult({ score: 100 }));
    save.saveResult('song-b', 4, 'hard', makeResult({ score: 200 }));
    const getItemSpy = vi.spyOn(storage, 'getItem');
    const records = save.loadRecords();
    expect(getChartRecord(records, 'song-a', 4, 'easy')?.score).toBe(100);
    expect(getChartRecord(records, 'song-b', 4, 'hard')?.score).toBe(200);
    expect(getChartRecord(records, 'song-b', 4, 'easy')).toBeNull();
    expect(getItemSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null when there is no record', () => {
    expect(getChartRecord(save.loadRecords(), 'song-a', 4, 'easy')).toBeNull();
  });

  it('loads a saved result', () => {
    save.saveResult(
      'song-a',
      4,
      'hard',
      makeResult({
        score: 5000,
        accuracy: 0.8,
        cleared: true,
      }),
    );
    expect(getChartRecord(save.loadRecords(), 'song-a', 4, 'hard')).toEqual({
      score: 5000,
      accuracy: 0.8,
      maxCombo: 10,
      cleared: true,
    });
    expect(getChartRecord(save.loadRecords(), 'song-a', 4, 'easy')).toBeNull();
  });

  it('merges each field with its best value and ORs cleared', () => {
    save.saveResult(
      'song-a',
      4,
      'normal',
      makeResult({
        score: 9000,
        accuracy: 0.75,
        maxCombo: 5,
        cleared: true,
      }),
    );
    save.saveResult(
      'song-a',
      4,
      'normal',
      makeResult({
        score: 7000,
        accuracy: 0.6,
        maxCombo: 30,
        cleared: false,
      }),
    );
    expect(getChartRecord(save.loadRecords(), 'song-a', 4, 'normal')).toEqual({
      score: 9000,
      accuracy: 0.75,
      maxCombo: 30,
      cleared: true,
    });
  });

  it('returns null and warns when the records JSON is broken', () => {
    storage.setItem(RECORDS_KEY, '{oops');
    expect(getChartRecord(save.loadRecords(), 'song-a', 4, 'easy')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('ignores only malformed entries and discards them on the next save', () => {
    storage.setItem(
      RECORDS_KEY,
      JSON.stringify({
        'song-a/4k/easy': {
          score: '100',
          accuracy: 0.5,
          maxCombo: 1,
          cleared: false,
        },
        'song-b/4k/easy': {
          score: 200,
          accuracy: 0.9,
          maxCombo: 4,
          cleared: true,
        },
      }),
    );
    expect(getChartRecord(save.loadRecords(), 'song-a', 4, 'easy')).toBeNull();
    expect(getChartRecord(save.loadRecords(), 'song-b', 4, 'easy')).toEqual({
      score: 200,
      accuracy: 0.9,
      maxCombo: 4,
      cleared: true,
    });

    save.saveResult('song-c', 4, 'expert', makeResult({ score: 300 }));
    const stored: unknown = JSON.parse(storage.getItem(RECORDS_KEY) ?? '');
    expect(stored).toEqual({
      'song-b/4k/easy': {
        score: 200,
        accuracy: 0.9,
        maxCombo: 4,
        cleared: true,
      },
      'song-c/4k/expert': {
        score: 300,
        accuracy: 0.5,
        maxCombo: 10,
        cleared: false,
      },
    });
  });

  it('keeps the records of each lane count of a song and difficulty apart', () => {
    save.saveResult(
      'song-a',
      4,
      'hard',
      makeResult({
        score: 4000,
        cleared: true,
      }),
    );
    save.saveResult('song-a', 6, 'hard', makeResult({ score: 6000 }));

    const records = save.loadRecords();
    expect(getChartRecord(records, 'song-a', 4, 'hard')).toMatchObject({
      score: 4000,
      cleared: true,
    });
    expect(getChartRecord(records, 'song-a', 6, 'hard')).toMatchObject({
      score: 6000,
      cleared: false,
    });
    expect(getChartRecord(records, 'song-a', 5, 'hard')).toBeNull();
    const stored: unknown = JSON.parse(storage.getItem(RECORDS_KEY) ?? '');
    expect(stored).toEqual({
      'song-a/4k/hard': getChartRecord(records, 'song-a', 4, 'hard'),
      'song-a/6k/hard': getChartRecord(records, 'song-a', 6, 'hard'),
    });
  });

  it('propagates setItem errors', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => save.saveResult('song-a', 4, 'easy', makeResult({}))).toThrow('quota');
  });
});
