import { describe, expect, it } from 'vitest';
import { adjustSetting, assignKey, canAdjust } from '../../../src/game/settings/settingsAdjust.js';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from '../../../src/storage/LocalSave.js';
import type { Settings } from '../../../src/storage/LocalSave.js';

function settingsWith(overrides: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('adjustSetting volume', () => {
  const row = { kind: 'volume', field: 'musicVolume' } as const;

  it('steps by 0.1 without floating point drift', () => {
    expect(adjustSetting(settingsWith({ musicVolume: 0.7 }), row, 1, 'ko').musicVolume).toBe(0.8);
    expect(adjustSetting(settingsWith({ musicVolume: 0.3 }), row, -1, 'ko').musicVolume).toBe(0.2);
  });

  it('returns the same settings at the bounds', () => {
    const atMax = settingsWith({ musicVolume: SETTINGS_LIMITS.volume.max });
    const atMin = settingsWith({ musicVolume: SETTINGS_LIMITS.volume.min });
    expect(adjustSetting(atMax, row, 1, 'ko')).toBe(atMax);
    expect(adjustSetting(atMin, row, -1, 'ko')).toBe(atMin);
  });

  it('moves away from a bound', () => {
    const atMax = settingsWith({ musicVolume: SETTINGS_LIMITS.volume.max });
    expect(adjustSetting(atMax, row, -1, 'ko').musicVolume).toBe(0.9);
  });

  it('changes only the adjusted field', () => {
    const next = adjustSetting(settingsWith({ musicVolume: 0.5 }), row, 1, 'ko');
    expect(next).toEqual(settingsWith({ musicVolume: 0.6 }));
  });
});

describe('adjustSetting inputOffset', () => {
  const row = { kind: 'inputOffset' } as const;
  const { min, max, step } = SETTINGS_LIMITS.inputOffsetMs;

  it('steps by the configured step', () => {
    expect(adjustSetting(settingsWith({ inputOffsetMs: 0 }), row, 1, 'ko').inputOffsetMs).toBe(
      step,
    );
  });

  it('clamps one step short of the bound to the bound', () => {
    const nearMax = settingsWith({ inputOffsetMs: max - 1 });
    expect(adjustSetting(nearMax, row, 1, 'ko').inputOffsetMs).toBe(max);
  });

  it('returns the same settings at the bounds', () => {
    const atMin = settingsWith({ inputOffsetMs: min });
    expect(adjustSetting(atMin, row, -1, 'ko')).toBe(atMin);
  });
});

describe('adjustSetting scrollSpeed', () => {
  const row = { kind: 'scrollSpeed' } as const;
  const { max, step } = SETTINGS_LIMITS.scrollSpeedPxPerSecond;

  it('steps by the configured step', () => {
    const next = adjustSetting(settingsWith({ scrollSpeedPxPerSecond: 800 }), row, -1, 'ko');
    expect(next.scrollSpeedPxPerSecond).toBe(800 - step);
  });

  it('returns the same settings at the max', () => {
    const atMax = settingsWith({ scrollSpeedPxPerSecond: max });
    expect(adjustSetting(atMax, row, 1, 'ko')).toBe(atMax);
  });
});

describe('adjustSetting mvMode', () => {
  const row = { kind: 'mvMode' } as const;

  it('moves to the neighboring mode', () => {
    expect(adjustSetting(settingsWith({ mvMode: 'dim' }), row, 1, 'ko').mvMode).toBe('blur');
  });

  it('does not wrap at either end', () => {
    const first = settingsWith({ mvMode: 'normal' });
    const last = settingsWith({ mvMode: 'off' });
    expect(adjustSetting(first, row, -1, 'ko')).toBe(first);
    expect(adjustSetting(last, row, 1, 'ko')).toBe(last);
  });
});

describe('adjustSetting language', () => {
  const row = { kind: 'language' } as const;

  it('starts from the displayed language when none is chosen', () => {
    expect(adjustSetting(settingsWith({ language: null }), row, 1, 'ja').language).toBe('en');
  });

  it('does not wrap at either end', () => {
    const settings = settingsWith({ language: null });
    expect(adjustSetting(settings, row, -1, 'ko')).toBe(settings);
    expect(adjustSetting(settings, row, 1, 'en')).toBe(settings);
  });
});

describe('adjustSetting key', () => {
  it('never changes settings', () => {
    expect(adjustSetting(DEFAULT_SETTINGS, { kind: 'key', lane: 0 }, 1, 'ko')).toBe(
      DEFAULT_SETTINGS,
    );
  });
});

describe('assignKey', () => {
  const bindings = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'] as const;

  it('assigns an unused key to the lane', () => {
    expect(assignKey(bindings, 1, 'KeyG')).toEqual(['KeyD', 'KeyG', 'KeyJ', 'KeyK']);
  });

  it('swaps with the lane that already uses the key', () => {
    expect(assignKey(bindings, 0, 'KeyK')).toEqual(['KeyK', 'KeyF', 'KeyJ', 'KeyD']);
  });

  it('does not mutate the input', () => {
    assignKey(bindings, 0, 'KeyK');
    expect(bindings).toEqual(['KeyD', 'KeyF', 'KeyJ', 'KeyK']);
  });
});

describe('canAdjust', () => {
  const row = { kind: 'volume', field: 'musicVolume' } as const;

  it('is false only in the direction blocked by a bound', () => {
    const atMax = settingsWith({ musicVolume: SETTINGS_LIMITS.volume.max });
    expect(canAdjust(atMax, row, 1, 'ko')).toBe(false);
    expect(canAdjust(atMax, row, -1, 'ko')).toBe(true);
  });

  it('is false for key rows', () => {
    expect(canAdjust(DEFAULT_SETTINGS, { kind: 'key', lane: 0 }, 1, 'ko')).toBe(false);
  });
});
