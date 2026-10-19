import { describe, expect, it } from 'vitest';
import type { SettingsRow } from '../../../src/game/settings/settingsAdjust.js';
import { formatRowValue, isChoiceRow } from '../../../src/game/settings/settingsRowView.js';
import { DEFAULT_SETTINGS } from '../../../src/storage/settings.js';
import type { Settings } from '../../../src/storage/settings.js';

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  musicVolume: 0.7000001,
  inputOffsetMs: -15,
  scrollSpeedPxPerSecond: 650,
  keyBindings: ['KeyD', 'Space', 'Digit7', 'ArrowLeft'],
  mvMode: 'blur',
};

describe('isChoiceRow', () => {
  it.each<[SettingsRow, boolean]>([
    [{ kind: 'mvMode' }, true],
    [{ kind: 'language' }, true],
    [
      {
        kind: 'volume',
        field: 'masterVolume',
      },
      false,
    ],
    [{ kind: 'inputOffset' }, false],
    [{ kind: 'scrollSpeed' }, false],
    [
      {
        kind: 'key',
        lane: 0,
      },
      false,
    ],
  ])('is %s for %o', (row, expected) => {
    expect(isChoiceRow(row)).toBe(expected);
  });
});

describe('formatRowValue', () => {
  it.each<[SettingsRow, string]>([
    [
      {
        kind: 'volume',
        field: 'musicVolume',
      },
      '70%',
    ],
    [
      {
        kind: 'volume',
        field: 'masterVolume',
      },
      '100%',
    ],
    [{ kind: 'inputOffset' }, '-15ms'],
    [{ kind: 'scrollSpeed' }, '650px/s'],
    [{ kind: 'mvMode' }, 'BLUR'],
    [
      {
        kind: 'key',
        lane: 0,
      },
      'D',
    ],
    [
      {
        kind: 'key',
        lane: 1,
      },
      'SPACE',
    ],
    [
      {
        kind: 'key',
        lane: 2,
      },
      '7',
    ],
    [
      {
        kind: 'key',
        lane: 3,
      },
      'ArrowLeft',
    ],
  ])('formats %o as %s', (row, expected) => {
    expect(formatRowValue(row, SETTINGS, 'en', null)).toBe(expected);
  });

  it('shows the displayed language name', () => {
    expect(formatRowValue({ kind: 'language' }, SETTINGS, 'ja', null)).toBe('日本語');
  });

  it('shows a waiting mark only for the lane waiting for a key', () => {
    expect(
      formatRowValue(
        {
          kind: 'key',
          lane: 1,
        },
        SETTINGS,
        'en',
        1,
      ),
    ).toBe('...');
    expect(
      formatRowValue(
        {
          kind: 'key',
          lane: 0,
        },
        SETTINGS,
        'en',
        1,
      ),
    ).toBe('D');
  });
});
