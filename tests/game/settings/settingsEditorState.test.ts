import { describe, expect, it } from 'vitest';
import type { SettingsRow } from '../../../src/game/settings/settingsAdjust.js';
import {
  adjustRow,
  applyPointer,
  bindWaitingKey,
  cancelWaiting,
  createSettingsEditorState,
  focusRow,
  isWaitingKey,
  moveFocus,
  startWaiting,
} from '../../../src/game/settings/settingsEditorState.js';
import { DEFAULT_SETTINGS } from '../../../src/storage/LocalSave.js';

const ROWS: readonly SettingsRow[] = [
  { kind: 'volume', field: 'masterVolume' },
  { kind: 'key', lane: 0 },
  { kind: 'key', lane: 1 },
];

function initial() {
  return createSettingsEditorState(ROWS, DEFAULT_SETTINGS);
}

describe('moveFocus', () => {
  it('moves between rows', () => {
    expect(moveFocus(initial(), 1).rowIndex).toBe(1);
  });

  it('returns the same state at both ends', () => {
    const first = initial();
    expect(moveFocus(first, -1)).toBe(first);
    const last = focusRow(first, ROWS.length - 1);
    expect(moveFocus(last, 1)).toBe(last);
  });
});

describe('focusRow', () => {
  it('returns the same state when the row is already focused', () => {
    const state = initial();
    expect(focusRow(state, 0)).toBe(state);
  });

  it('throws for an index outside the rows', () => {
    expect(() => focusRow(initial(), ROWS.length)).toThrow('Invalid settings row index');
  });
});

describe('adjustRow', () => {
  it('focuses the adjusted row and changes its setting', () => {
    const state = adjustRow(focusRow(initial(), 1), 0, -1, 'ko');
    expect(state.rowIndex).toBe(0);
    expect(state.settings.masterVolume).toBe(0.9);
  });

  it('returns the same state when nothing can change', () => {
    const state = initial();
    expect(adjustRow(state, 0, 1, 'ko')).toBe(state);
  });

  it('only moves focus on a key row', () => {
    const state = adjustRow(initial(), 1, 1, 'ko');
    expect(state.rowIndex).toBe(1);
    expect(state.settings).toBe(DEFAULT_SETTINGS);
  });
});

describe('startWaiting', () => {
  it('waits for the lane of a key row', () => {
    const state = startWaiting(initial(), 2);
    expect(state.waitingLane).toBe(1);
    expect(isWaitingKey(state)).toBe(true);
  });

  it('only focuses a non-key row', () => {
    const state = initial();
    expect(startWaiting(state, 0)).toBe(state);
  });
});

describe('bindWaitingKey', () => {
  it('binds the key and stops waiting', () => {
    const state = bindWaitingKey(startWaiting(initial(), 1), 'KeyA');
    expect(state.settings.keyBindings).toEqual(['KeyA', 'KeyF', 'KeyJ', 'KeyK']);
    expect(isWaitingKey(state)).toBe(false);
  });

  it('swaps with the lane that already uses the key', () => {
    const state = bindWaitingKey(startWaiting(initial(), 1), 'KeyF');
    expect(state.settings.keyBindings).toEqual(['KeyF', 'KeyD', 'KeyJ', 'KeyK']);
  });

  it.each([['Escape'], ['KeyD']])('keeps settings for %s and stops waiting', (code) => {
    const state = bindWaitingKey(startWaiting(initial(), 1), code);
    expect(state.settings).toBe(DEFAULT_SETTINGS);
    expect(isWaitingKey(state)).toBe(false);
  });

  it('throws when no lane is waiting', () => {
    expect(() => bindWaitingKey(initial(), 'KeyA')).toThrow('No lane is waiting');
  });
});

describe('cancelWaiting', () => {
  it('returns the same state when not waiting', () => {
    const state = initial();
    expect(cancelWaiting(state)).toBe(state);
  });
});

describe('applyPointer', () => {
  it('applies the transition when not waiting', () => {
    expect(applyPointer(initial(), (state) => focusRow(state, 2)).rowIndex).toBe(2);
  });

  it('only cancels waiting instead of applying the transition', () => {
    const state = applyPointer(startWaiting(initial(), 1), (current) => focusRow(current, 2));
    expect(isWaitingKey(state)).toBe(false);
    expect(state.rowIndex).toBe(1);
  });
});
