import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { LANGUAGES } from '../../src/i18n/language.js';
import { DEFAULT_SETTINGS, LocalSave, MV_MODES } from '../../src/storage/LocalSave.js';
import type { Settings } from '../../src/storage/LocalSave.js';
import type { FinishedGameplayResult } from '../../src/rhythm/types.js';

const SETTINGS_KEY = 'dazbeat:settings:v1';
const RECORDS_KEY = 'dazbeat:records:v1';

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
    counts: { perfect: 1, great: 0, good: 0, bad: 0, miss: 1 },
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
        keyBindings: ['KeyA', 'KeyS', 'KeyK', 'KeyL'],
      }),
    );
    expect(save.loadSettings()).toEqual({
      masterVolume: 0.4,
      musicVolume: DEFAULT_SETTINGS.musicVolume,
      effectVolume: 0.3,
      inputOffsetMs: DEFAULT_SETTINGS.inputOffsetMs,
      scrollSpeedPxPerSecond: DEFAULT_SETTINGS.scrollSpeedPxPerSecond,
      keyBindings: ['KeyA', 'KeyS', 'KeyK', 'KeyL'],
      mvMode: DEFAULT_SETTINGS.mvMode,
      language: DEFAULT_SETTINGS.language,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('replaces a non-finite volume with the default', () => {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, masterVolume: 0.5 }).replace(
        '"masterVolume":0.5',
        '"masterVolume":1e999',
      ),
    );
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['three keys', ['KeyA', 'KeyS', 'KeyD']],
    ['five keys', ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG']],
    ['an empty key', ['KeyA', '', 'KeyD', 'KeyF']],
    ['a duplicate key', ['KeyA', 'KeyS', 'KeyA', 'KeyF']],
  ])('replaces key bindings with %s by the defaults, warning once', (_label, keyBindings) => {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, keyBindings }));
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('round-trips saved settings', () => {
    const settings: Settings = {
      masterVolume: 0.7,
      musicVolume: 0.2,
      effectVolume: 0,
      inputOffsetMs: -45,
      scrollSpeedPxPerSecond: 1250,
      keyBindings: ['KeyQ', 'KeyW', 'KeyO', 'KeyP'],
      mvMode: 'blur',
      language: 'ja',
    };
    save.saveSettings(settings);
    expect(save.loadSettings()).toEqual(settings);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each(MV_MODES)('loads saved MV mode %s without warning', (mvMode) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, mvMode };
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
      keyBindings: ['KeyQ', 'KeyW', 'KeyO', 'KeyP'],
      mvMode,
    };
    storage.setItem(SETTINGS_KEY, JSON.stringify(saved));
    expect(save.loadSettings()).toEqual({ ...saved, mvMode: 'dim', language: null });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it.each(LANGUAGES)('loads saved language %s without warning', (language) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, language };
    save.saveSettings(settings);
    expect(save.loadSettings()).toEqual(settings);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing language', undefined],
    ['a null language', null],
  ])('treats %s as not chosen without warning', (_label, language) => {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, language }));
    expect(save.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['an unsupported language', 'fr'],
    ['a non-string language', 1],
  ])('replaces %s with null, warning once', (_label, language) => {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, language }));
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
  it('returns null when there is no record', () => {
    expect(save.loadRecord('song-a', 'easy')).toBeNull();
  });

  it('loads a saved result', () => {
    save.saveResult('song-a', 'hard', makeResult({ score: 5000, accuracy: 0.8, cleared: true }));
    expect(save.loadRecord('song-a', 'hard')).toEqual({
      score: 5000,
      accuracy: 0.8,
      maxCombo: 10,
      cleared: true,
    });
    expect(save.loadRecord('song-a', 'easy')).toBeNull();
  });

  it('merges each field with its best value and ORs cleared', () => {
    save.saveResult(
      'song-a',
      'normal',
      makeResult({ score: 9000, accuracy: 0.75, maxCombo: 5, cleared: true }),
    );
    save.saveResult(
      'song-a',
      'normal',
      makeResult({ score: 7000, accuracy: 0.6, maxCombo: 30, cleared: false }),
    );
    expect(save.loadRecord('song-a', 'normal')).toEqual({
      score: 9000,
      accuracy: 0.75,
      maxCombo: 30,
      cleared: true,
    });
  });

  it('returns null and warns when the records JSON is broken', () => {
    storage.setItem(RECORDS_KEY, '{oops');
    expect(save.loadRecord('song-a', 'easy')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('ignores only malformed entries and discards them on the next save', () => {
    storage.setItem(
      RECORDS_KEY,
      JSON.stringify({
        'song-a/easy': { score: '100', accuracy: 0.5, maxCombo: 1, cleared: false },
        'song-b/easy': { score: 200, accuracy: 0.9, maxCombo: 4, cleared: true },
      }),
    );
    expect(save.loadRecord('song-a', 'easy')).toBeNull();
    expect(save.loadRecord('song-b', 'easy')).toEqual({
      score: 200,
      accuracy: 0.9,
      maxCombo: 4,
      cleared: true,
    });

    save.saveResult('song-c', 'expert', makeResult({ score: 300 }));
    const stored: unknown = JSON.parse(storage.getItem(RECORDS_KEY) ?? '');
    expect(stored).toEqual({
      'song-b/easy': { score: 200, accuracy: 0.9, maxCombo: 4, cleared: true },
      'song-c/expert': { score: 300, accuracy: 0.5, maxCombo: 10, cleared: false },
    });
  });

  it('propagates setItem errors', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => save.saveResult('song-a', 'easy', makeResult({}))).toThrow('quota');
  });
});
