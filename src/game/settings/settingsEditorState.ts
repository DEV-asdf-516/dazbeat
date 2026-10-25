import type { Language } from '../../i18n/language.js';
import type { Lane } from '../../rhythm/types.js';
import type { Settings } from '../../storage/settings.js';
import { adjustSetting, assignKey } from './settingsAdjust.js';
import type { SettingsRow } from './settingsAdjust.js';
import { requireDefined } from '../../invariant.js';

export interface SettingsEditorState {
  readonly rows: readonly SettingsRow[];
  readonly settings: Settings;
  readonly rowIndex: number;
  readonly waitingLane: Lane | null;
}

export function createSettingsEditorState(
  rows: readonly SettingsRow[],
  settings: Settings,
): SettingsEditorState {
  return {
    rows,
    settings,
    rowIndex: 0,
    waitingLane: null,
  };
}

export function isRowShown(row: SettingsRow, settings: Settings): boolean {
  return row.kind !== 'key' || row.lane < settings.laneMode;
}

export function isWaitingKey(state: SettingsEditorState): boolean {
  return state.waitingLane !== null;
}

export function focusRow(state: SettingsEditorState, index: number): SettingsEditorState {
  getShownRow(state, index);
  return index === state.rowIndex
    ? state
    : {
        ...state,
        rowIndex: index,
      };
}

export function moveFocus(state: SettingsEditorState, delta: 1 | -1): SettingsEditorState {
  for (
    let index = state.rowIndex + delta;
    index >= 0 && index < state.rows.length;
    index += delta
  ) {
    if (isRowShown(getRow(state, index), state.settings)) {
      return focusRow(state, index);
    }
  }
  return state;
}

export function adjustRow(
  state: SettingsEditorState,
  index: number,
  direction: 1 | -1,
  language: Language,
): SettingsEditorState {
  const settings = adjustSetting(state.settings, getShownRow(state, index), direction, language);
  if (settings === state.settings && index === state.rowIndex) {
    return state;
  }
  return {
    ...state,
    rowIndex: index,
    settings,
  };
}

export function startWaiting(state: SettingsEditorState, index: number): SettingsEditorState {
  const row = getShownRow(state, index);
  if (row.kind !== 'key') {
    return focusRow(state, index);
  }
  return {
    ...state,
    rowIndex: index,
    waitingLane: row.lane,
  };
}

export function bindWaitingKey(state: SettingsEditorState, code: string): SettingsEditorState {
  const lane = state.waitingLane;
  if (lane === null) {
    throw new Error('No lane is waiting for a key');
  }
  // 플레이 중 Tab 은 항상 MV 모드 전환이어야 하므로 레인 키로 받지 않는다.
  if (code === 'Tab') {
    return state;
  }
  const { keyBindings, laneMode } = state.settings;
  const keys = keyBindings[laneMode];
  if (code === 'Escape' || keys[lane] === code) {
    return {
      ...state,
      waitingLane: null,
    };
  }
  return {
    ...state,
    waitingLane: null,
    settings: {
      ...state.settings,
      keyBindings: {
        ...keyBindings,
        [laneMode]: assignKey(keys, lane, code),
      },
    },
  };
}

function cancelWaiting(state: SettingsEditorState): SettingsEditorState {
  return state.waitingLane === null
    ? state
    : {
        ...state,
        waitingLane: null,
      };
}

export type BackOutcome = { kind: 'leave' } | { kind: 'stay'; state: SettingsEditorState };

export function pressBack(state: SettingsEditorState): BackOutcome {
  return isWaitingKey(state)
    ? {
        kind: 'stay',
        state: cancelWaiting(state),
      }
    : { kind: 'leave' };
}

export function applyPointer(
  state: SettingsEditorState,
  transition: (state: SettingsEditorState) => SettingsEditorState,
): SettingsEditorState {
  return isWaitingKey(state) ? cancelWaiting(state) : transition(state);
}

function getRow(state: SettingsEditorState, index: number): SettingsRow {
  return requireDefined(state.rows[index], 'Invalid settings row index', index);
}

function getShownRow(state: SettingsEditorState, index: number): SettingsRow {
  const row = getRow(state, index);
  if (!isRowShown(row, state.settings)) {
    throw new Error(`Invalid settings row index: ${index} is hidden`);
  }
  return row;
}
