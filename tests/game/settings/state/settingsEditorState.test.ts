import { describe, expect, it } from 'vitest';
import type { SettingsRow } from '../../../../src/game/settings/state/settingsAdjust.js';
import type { SettingsEditorState } from '../../../../src/game/settings/state/settingsEditorState.js';
import {
  adjustRow,
  applyPointer,
  bindWaitingKey,
  cancelPrompt,
  confirmReset,
  createSettingsEditorState,
  focusRow,
  getChangedRegions,
  getKeyBoxButton,
  getRowAppearance,
  getSettingsEffects,
  hoverRow,
  hoverSettingsButton,
  isRowShown,
  moveFocus,
  pressBack,
  pressSettingsButton,
  readSettingsKey,
  requestReset,
  startWaiting,
  unhoverRow,
  withDisplayedLanguage,
} from '../../../../src/game/settings/state/settingsEditorState.js';
import { getLanes } from '../../../../src/rhythm/lanes.js';
import { DEFAULT_SETTINGS } from '../../../../src/storage/settings.js';

const ROWS: readonly SettingsRow[] = [
  {
    kind: 'volume',
    field: 'masterVolume',
  },
  {
    kind: 'key',
    lane: 0,
  },
  {
    kind: 'key',
    lane: 1,
  },
];

// 0: 레인 모드, 1~6: 키 lane 0~5, 7: 노트 속도
const LANE_MODE_ROWS: readonly SettingsRow[] = [
  { kind: 'laneMode' },
  ...getLanes(6).map((lane): SettingsRow => ({
    kind: 'key',
    lane,
  })),
  { kind: 'scrollSpeed' },
];
const LANE_MODE_INDEX = 0;
const SCROLL_SPEED_INDEX = 7;

function initial() {
  return createSettingsEditorState(ROWS, DEFAULT_SETTINGS, 'ko');
}

function laneModeInitial() {
  return createSettingsEditorState(LANE_MODE_ROWS, DEFAULT_SETTINGS, 'ko');
}

function keyRowIndex(lane: number): number {
  return lane + 1;
}

function toSixLanes(state: SettingsEditorState): SettingsEditorState {
  return adjustRow(adjustRow(state, LANE_MODE_INDEX, 1), LANE_MODE_INDEX, 1);
}

function toFourLanes(state: SettingsEditorState): SettingsEditorState {
  return adjustRow(adjustRow(state, LANE_MODE_INDEX, -1), LANE_MODE_INDEX, -1);
}

describe('moveFocus', () => {
  it('moves between rows', () => {
    expect(moveFocus(initial(), 1).rowIndex).toBe(1);
  });

  it('wraps around at both ends', () => {
    const first = initial();
    const last = focusRow(first, ROWS.length - 1);
    expect(moveFocus(first, -1).rowIndex).toBe(ROWS.length - 1);
    expect(moveFocus(last, 1).rowIndex).toBe(0);
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
    const state = adjustRow(focusRow(initial(), 1), 0, -1);
    expect(state.rowIndex).toBe(0);
    expect(state.settings.masterVolume).toBe(0.9);
  });

  it('returns the same state when nothing can change', () => {
    const state = initial();
    expect(adjustRow(state, 0, 1)).toBe(state);
  });

  it('only moves focus on a key row', () => {
    const state = adjustRow(initial(), 1, 1);
    expect(state.rowIndex).toBe(1);
    expect(state.settings).toBe(DEFAULT_SETTINGS);
  });
});

describe('startWaiting', () => {
  it('waits for the lane of a key row', () => {
    const state = startWaiting(initial(), 2);
    expect(state.mode).toEqual({
      kind: 'waitingKey',
      lane: 1,
    });
    expect(state.mode.kind).toBe('waitingKey');
  });

  it('only focuses a non-key row', () => {
    const state = initial();
    expect(startWaiting(state, 0)).toBe(state);
  });
});

describe('bindWaitingKey', () => {
  it('binds the key and stops waiting', () => {
    const state = bindWaitingKey(startWaiting(initial(), 1), 'KeyA');
    expect(state.settings.keyBindings[4]).toEqual(['KeyA', 'KeyF', 'KeyJ', 'KeyK']);
    expect(state.mode.kind).not.toBe('waitingKey');
  });

  it('swaps with the lane that already uses the key', () => {
    const state = bindWaitingKey(startWaiting(initial(), 1), 'KeyF');
    expect(state.settings.keyBindings[4]).toEqual(['KeyF', 'KeyD', 'KeyJ', 'KeyK']);
  });

  it.each([['Escape'], ['KeyD']])('keeps settings for %s and stops waiting', (code) => {
    const state = bindWaitingKey(startWaiting(initial(), 1), code);
    expect(state.settings).toBe(DEFAULT_SETTINGS);
    expect(state.mode.kind).not.toBe('waitingKey');
  });

  it('ignores Tab and keeps waiting', () => {
    const waiting = startWaiting(initial(), 1);
    const state = bindWaitingKey(waiting, 'Tab');
    expect(state).toBe(waiting);
    expect(state.mode.kind).toBe('waitingKey');
    expect(state.settings.keyBindings).toBe(DEFAULT_SETTINGS.keyBindings);
  });

  it('throws when no lane is waiting', () => {
    expect(() => bindWaitingKey(initial(), 'KeyA')).toThrow('No lane is waiting');
  });
});

describe('readSettingsKey', () => {
  function readState(
    state: SettingsEditorState,
    code: string,
    repeat = false,
  ): SettingsEditorState {
    const result = readSettingsKey(state, {
      code,
      repeat,
    });
    if (result.kind !== 'state') {
      throw new Error('expected a state');
    }
    return result.state;
  }

  it('binds a new key to the waiting lane and goes back to browsing', () => {
    const state = readState(startWaiting(initial(), 1), 'KeyA');
    expect(state.settings.keyBindings[4]).toEqual(['KeyA', 'KeyF', 'KeyJ', 'KeyK']);
    expect(state.mode).toEqual({ kind: 'browsing' });
  });

  it('takes a repeated key while waiting without changing the state', () => {
    const waiting = startWaiting(initial(), 1);
    expect(readState(waiting, 'KeyA', true)).toBe(waiting);
  });

  it('stops waiting on Escape without binding', () => {
    const state = readState(startWaiting(initial(), 1), 'Escape');
    expect(state.settings).toBe(DEFAULT_SETTINGS);
    expect(state.mode).toEqual({ kind: 'browsing' });
  });

  it('takes Tab while waiting without changing the state', () => {
    const waiting = startWaiting(initial(), 1);
    expect(readState(waiting, 'Tab')).toBe(waiting);
  });

  it('resets to the defaults but keeps the language on Enter while confirming', () => {
    const changed = bindWaitingKey(startWaiting(adjustRow(initial(), 0, -1), 1), 'KeyA');
    const confirming = requestReset({
      ...changed,
      settings: {
        ...changed.settings,
        language: 'ja',
      },
    });
    const state = readState(confirming, 'Enter');
    expect(state.settings).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'ja',
    });
    expect(state.mode).toEqual({ kind: 'browsing' });
  });

  it('keeps the settings on Escape while confirming', () => {
    const confirming = requestReset(adjustRow(initial(), 0, -1));
    const state = readState(confirming, 'Escape');
    expect(state.settings).toBe(confirming.settings);
    expect(state.mode).toEqual({ kind: 'browsing' });
  });

  it('takes other keys while confirming without changing the state', () => {
    const confirming = requestReset(initial());
    expect(readState(confirming, 'KeyA')).toBe(confirming);
  });

  it('passes keys while browsing', () => {
    expect(
      readSettingsKey(initial(), {
        code: 'Enter',
        repeat: false,
      }),
    ).toEqual({ kind: 'pass' });
  });
});

describe('getRowAppearance', () => {
  it('emphasizes the focused and hovered rows only', () => {
    const state = hoverRow(focusRow(initial(), 1), 2);
    expect(getRowAppearance(state, 1)).toBe('emphasized');
    expect(getRowAppearance(state, 2)).toBe('emphasized');
    expect(getRowAppearance(state, 0)).toBe('normal');
  });
});

describe('applyPointer', () => {
  it('applies the transition when not waiting', () => {
    expect(applyPointer(initial(), (state) => focusRow(state, 2)).rowIndex).toBe(2);
  });

  it('only cancels waiting instead of applying the transition', () => {
    const state = applyPointer(startWaiting(initial(), 1), (current) => focusRow(current, 2));
    expect(state.mode.kind).not.toBe('waitingKey');
    expect(state.rowIndex).toBe(1);
  });
});

describe('pressBack', () => {
  it('leaves when not waiting', () => {
    expect(pressBack(initial())).toEqual({ kind: 'leave' });
  });

  it('stays and only cancels waiting while waiting for a key', () => {
    const waiting = startWaiting(initial(), 1);
    const outcome = pressBack(waiting);
    if (outcome.kind !== 'stay') {
      throw new Error('expected to stay');
    }
    expect(outcome.state.mode.kind).not.toBe('waitingKey');
    expect(outcome.state.rowIndex).toBe(1);
    expect(outcome.state.settings).toBe(waiting.settings);
  });
});

describe('reset', () => {
  const changed = () => bindWaitingKey(startWaiting(adjustRow(initial(), 0, -1), 1), 'KeyA');

  it('asks for confirmation without changing settings', () => {
    const state = changed();
    const confirming = requestReset(state);
    expect(confirming.mode).toEqual({ kind: 'confirmingReset' });
    expect(confirming.settings).toBe(state.settings);
    expect(requestReset(confirming)).toBe(confirming);
  });

  it('restores the defaults but keeps the language when confirmed', () => {
    const state = {
      ...changed(),
      settings: {
        ...changed().settings,
        language: 'ja' as const,
      },
    };
    const reset = confirmReset(requestReset(state));
    expect(reset.settings).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'ja',
    });
    expect(reset.mode).toEqual({ kind: 'browsing' });
  });

  it.each([
    ['cancel', cancelPrompt],
    [
      'back',
      (state: SettingsEditorState) => {
        const outcome = pressBack(state);
        if (outcome.kind !== 'stay') {
          throw new Error('expected to stay');
        }
        return outcome.state;
      },
    ],
  ])('keeps the settings on %s', (_, close) => {
    const state = changed();
    const closed = close(requestReset(state));
    expect(closed.settings).toBe(state.settings);
    expect(closed.mode).toEqual({ kind: 'browsing' });
  });

  it('throws when reset is not being confirmed', () => {
    expect(() => confirmReset(initial())).toThrow('Reset is not being confirmed');
  });
});

describe('lane mode', () => {
  it('steps the lane mode from 4 to 6 and stops at 6', () => {
    const five = adjustRow(laneModeInitial(), LANE_MODE_INDEX, 1);
    expect(five.settings.laneMode).toBe(5);
    const six = adjustRow(five, LANE_MODE_INDEX, 1);
    expect(six.settings.laneMode).toBe(6);
    expect(adjustRow(six, LANE_MODE_INDEX, 1)).toBe(six);
  });

  it.each([
    [4, 0],
    [5, 1],
    [6, 2],
  ])('shows %s key rows', (laneCount, steps) => {
    let state = laneModeInitial();
    for (let step = 0; step < steps; step += 1) {
      state = adjustRow(state, LANE_MODE_INDEX, 1);
    }
    const keyRows = state.rows.filter(
      (row) => row.kind === 'key' && isRowShown(row, state.settings),
    );
    expect(keyRows).toHaveLength(laneCount);
  });

  it('keeps focus on the lane mode row when the mode changes', () => {
    expect(toSixLanes(laneModeInitial()).rowIndex).toBe(LANE_MODE_INDEX);
  });

  it('skips hidden key rows when moving focus', () => {
    const lastKey = focusRow(laneModeInitial(), keyRowIndex(3));
    const next = moveFocus(lastKey, 1);
    expect(next.rowIndex).toBe(SCROLL_SPEED_INDEX);
    expect(moveFocus(next, -1).rowIndex).toBe(keyRowIndex(3));
  });

  it('wraps past hidden rows to the first row when only hidden rows follow', () => {
    const rows: readonly SettingsRow[] = LANE_MODE_ROWS.slice(0, SCROLL_SPEED_INDEX);
    const lastKey = focusRow(
      createSettingsEditorState(rows, DEFAULT_SETTINGS, 'ko'),
      keyRowIndex(3),
    );
    expect(moveFocus(lastKey, 1).rowIndex).toBe(0);
  });

  it('throws for a hidden row index', () => {
    const state = laneModeInitial();
    expect(() => focusRow(state, keyRowIndex(4))).toThrow('Invalid settings row index');
    expect(() => adjustRow(state, keyRowIndex(4), 1)).toThrow('Invalid settings row index');
    expect(() => startWaiting(state, keyRowIndex(5))).toThrow('Invalid settings row index');
  });

  it('binds the sixth lane key in 6K and keeps the other modes', () => {
    const six = toSixLanes(laneModeInitial());
    const state = bindWaitingKey(startWaiting(six, keyRowIndex(5)), 'KeyA');
    expect(state.settings.keyBindings[6]).toEqual(['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyA']);
    expect(state.settings.keyBindings[4]).toBe(DEFAULT_SETTINGS.keyBindings[4]);
    expect(state.settings.keyBindings[5]).toBe(DEFAULT_SETTINGS.keyBindings[5]);
  });

  it('swaps with the lane that already uses the key within the mode', () => {
    const six = toSixLanes(laneModeInitial());
    const state = bindWaitingKey(startWaiting(six, keyRowIndex(5)), 'KeyS');
    expect(state.settings.keyBindings[6]).toEqual(['KeyL', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyS']);
  });

  it('accepts a key used by another mode without swapping', () => {
    const six = toSixLanes(laneModeInitial());
    const state = bindWaitingKey(startWaiting(six, keyRowIndex(0)), 'Space');
    expect(state.settings.keyBindings[6]).toEqual([
      'Space',
      'KeyD',
      'KeyF',
      'KeyJ',
      'KeyK',
      'KeyL',
    ]);
  });

  it('keeps the keys of each mode after switching 4K to 6K and back', () => {
    const four = bindWaitingKey(startWaiting(laneModeInitial(), keyRowIndex(0)), 'KeyQ');
    const six = bindWaitingKey(startWaiting(toSixLanes(four), keyRowIndex(5)), 'KeyP');
    const back = toFourLanes(six);
    expect(back.settings.laneMode).toBe(4);
    expect(back.settings.keyBindings[4]).toEqual(['KeyQ', 'KeyF', 'KeyJ', 'KeyK']);
    expect(back.settings.keyBindings[6]).toEqual(['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyP']);
  });

  it('cancels with Escape and ignores Tab in 6K', () => {
    const waiting = startWaiting(toSixLanes(laneModeInitial()), keyRowIndex(5));
    expect(bindWaitingKey(waiting, 'Tab')).toBe(waiting);
    const cancelled = bindWaitingKey(waiting, 'Escape');
    expect(cancelled.mode.kind).not.toBe('waitingKey');
    expect(cancelled.settings).toBe(waiting.settings);
  });
});

describe('hover', () => {
  it('hovers a row without changing focus or mode', () => {
    const waiting = startWaiting(initial(), 1);
    const state = hoverRow(waiting, 2);
    expect(state.hover).toEqual({
      kind: 'row',
      index: 2,
    });
    expect(state.rowIndex).toBe(1);
    expect(state.mode).toBe(waiting.mode);
  });

  it('returns the same state for the hovered row and for unhovering another row', () => {
    const state = hoverRow(initial(), 2);
    expect(hoverRow(state, 2)).toBe(state);
    expect(unhoverRow(state, 1)).toBe(state);
    expect(unhoverRow(state, 2).hover).toBeNull();
  });

  it('releases the hover of a key row hidden by fewer lanes', () => {
    const six = hoverRow(toSixLanes(laneModeInitial()), keyRowIndex(5));
    const five = adjustRow(six, LANE_MODE_INDEX, -1);
    expect(five.settings.laneMode).toBe(5);
    expect(five.hover).toBeNull();
  });

  it('releases the hover of the key box of a row hidden by fewer lanes', () => {
    const six = hoverSettingsButton(toSixLanes(laneModeInitial()), getKeyBoxButton(keyRowIndex(5)));
    expect(adjustRow(six, LANE_MODE_INDEX, -1).hover).toBeNull();
  });

  it('keeps the hover of a row that stays shown', () => {
    const six = hoverRow(toSixLanes(laneModeInitial()), keyRowIndex(4));
    expect(adjustRow(six, LANE_MODE_INDEX, -1).hover).toBe(six.hover);
  });
});

// 0: 마스터 볼륨, 1: 언어
const LANGUAGE_ROWS: readonly SettingsRow[] = [
  {
    kind: 'volume',
    field: 'masterVolume',
  },
  { kind: 'language' },
];
const LANGUAGE_INDEX = 1;

function languageInitial() {
  return createSettingsEditorState(LANGUAGE_ROWS, DEFAULT_SETTINGS, 'ko');
}

describe('getSettingsEffects', () => {
  it('has no effects when only the hover changes', () => {
    const state = initial();
    expect(getSettingsEffects(state, hoverRow(state, 1))).toEqual([]);
  });

  it('saves and then plays the focus sound when another row is adjusted', () => {
    const state = focusRow(initial(), 1);
    const next = adjustRow(state, 0, -1);
    expect(getSettingsEffects(state, next)).toEqual([
      {
        kind: 'save',
        settings: next.settings,
      },
      {
        kind: 'focusSound',
        settings: next.settings,
      },
    ]);
  });

  it('saves and changes the language when the language changes', () => {
    const state = focusRow(languageInitial(), LANGUAGE_INDEX);
    const next = adjustRow(state, LANGUAGE_INDEX, 1);
    expect(getSettingsEffects(state, next)).toEqual([
      {
        kind: 'save',
        settings: next.settings,
      },
      {
        kind: 'changeLanguage',
        language: 'ja',
      },
    ]);
  });

  it('does not change the language that is already displayed', () => {
    const state = focusRow(languageInitial(), LANGUAGE_INDEX);
    const next = withDisplayedLanguage(adjustRow(state, LANGUAGE_INDEX, 1), 'ja');
    expect(getSettingsEffects(state, next).map(({ kind }) => kind)).toEqual(['save']);
  });
});

describe('getChangedRegions', () => {
  it('redraws every region for the first render', () => {
    expect(getChangedRegions(null, initial())).toEqual([
      'title',
      'groups',
      'rowLabels',
      'rowControls',
      'focusStar',
      'waitingText',
      'controlsEntry',
      'resetDialog',
      'controls',
      'rowButtons',
      'backButton',
      'resetEntry',
      'resetButtons',
      'controlsClose',
    ]);
  });

  it('redraws only the controls when only the controls open', () => {
    const state = initial();
    expect(
      getChangedRegions(state, {
        ...state,
        isControlsOpen: true,
      }),
    ).toEqual(['controls', 'controlsClose']);
  });

  it('redraws only the row labels when the hover changes', () => {
    const state = initial();
    expect(getChangedRegions(state, hoverRow(state, 1))).toEqual(['rowLabels']);
  });

  it('redraws the rows, and the focus star only when the adjusted row was not focused', () => {
    expect(getChangedRegions(initial(), adjustRow(initial(), 0, -1))).toEqual([
      'rowLabels',
      'rowControls',
      'rowButtons',
    ]);
    const state = focusRow(initial(), 1);
    expect(getChangedRegions(state, adjustRow(state, 0, -1))).toEqual([
      'rowLabels',
      'rowControls',
      'focusStar',
      'rowButtons',
    ]);
  });

  it('redraws the controls and the waiting text while waiting for a key', () => {
    const state = focusRow(initial(), 1);
    expect(getChangedRegions(state, startWaiting(state, 1))).toEqual([
      'rowControls',
      'waitingText',
      'controlsEntry',
    ]);
  });

  it('redraws every text region but the reset dialog when the displayed language changes', () => {
    const state = initial();
    expect(getChangedRegions(state, withDisplayedLanguage(state, 'ja'))).toEqual([
      'title',
      'groups',
      'rowLabels',
      'rowControls',
      'waitingText',
      'rowButtons',
    ]);
  });

  it('redraws only the hovered button when the hover changes between buttons', () => {
    const state = hoverSettingsButton(initial(), 'back');
    expect(getChangedRegions(initial(), state)).toEqual(['backButton']);
    expect(getChangedRegions(state, hoverSettingsButton(state, getKeyBoxButton(1)))).toEqual([
      'rowButtons',
      'backButton',
    ]);
    expect(getChangedRegions(state, pressSettingsButton(state, 'back'))).toEqual(['backButton']);
  });

  it('redraws the reset dialog when it opens and closes', () => {
    const state = initial();
    const confirming = requestReset(state);
    expect(getChangedRegions(state, confirming)).toContain('resetDialog');
    expect(getChangedRegions(confirming, cancelPrompt(confirming))).toContain('resetDialog');
  });

  it('does not redraw the reset dialog when only the displayed language changes while confirming', () => {
    const confirming = requestReset(initial());
    expect(getChangedRegions(confirming, withDisplayedLanguage(confirming, 'ja'))).not.toContain(
      'resetDialog',
    );
  });
});
