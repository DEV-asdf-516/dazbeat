import type { Language } from '../../i18n/language.js';
import type { Lane } from '../../rhythm/types.js';
import type { Settings } from '../../storage/LocalSave.js';
import { clamp } from '../range.js';
import { adjustSetting, assignKey } from './settingsAdjust.js';
import type { SettingsRow } from './settingsAdjust.js';

export interface SettingsEditorState {
  readonly rows: readonly SettingsRow[];
  readonly settings: Settings;
  readonly rowIndex: number;
  /** null 이 아니면 이 레인에 바인딩할 키를 기다리는 중이다. */
  readonly waitingLane: Lane | null;
}

export function createSettingsEditorState(
  rows: readonly SettingsRow[],
  settings: Settings,
): SettingsEditorState {
  return { rows, settings, rowIndex: 0, waitingLane: null };
}

export function isWaitingKey(state: SettingsEditorState): boolean {
  return state.waitingLane !== null;
}

export function focusRow(state: SettingsEditorState, index: number): SettingsEditorState {
  getRow(state, index);
  return index === state.rowIndex ? state : { ...state, rowIndex: index };
}

export function moveFocus(state: SettingsEditorState, delta: 1 | -1): SettingsEditorState {
  return focusRow(state, clamp(state.rowIndex + delta, 0, state.rows.length - 1));
}

/** `language`는 설정에서 언어를 고르지 않았을 때 화면에 표시 중인 언어다. */
export function adjustRow(
  state: SettingsEditorState,
  index: number,
  direction: 1 | -1,
  language: Language,
): SettingsEditorState {
  const settings = adjustSetting(state.settings, getRow(state, index), direction, language);
  if (settings === state.settings && index === state.rowIndex) {
    return state;
  }
  return { ...state, rowIndex: index, settings };
}

/** 키 행이 아니면 포커스만 옮긴다. */
export function startWaiting(state: SettingsEditorState, index: number): SettingsEditorState {
  const row = getRow(state, index);
  if (row.kind !== 'key') {
    return focusRow(state, index);
  }
  return { ...state, rowIndex: index, waitingLane: row.lane };
}

/** Escape 는 바인딩 없이 대기만 끝낸다. */
export function bindWaitingKey(state: SettingsEditorState, code: string): SettingsEditorState {
  const lane = state.waitingLane;
  if (lane === null) {
    throw new Error('No lane is waiting for a key');
  }
  const { keyBindings } = state.settings;
  if (code === 'Escape' || keyBindings[lane] === code) {
    return { ...state, waitingLane: null };
  }
  return {
    ...state,
    waitingLane: null,
    settings: { ...state.settings, keyBindings: assignKey(keyBindings, lane, code) },
  };
}

export function cancelWaiting(state: SettingsEditorState): SettingsEditorState {
  return state.waitingLane === null ? state : { ...state, waitingLane: null };
}

/** 키 대기 중의 포인터 입력은 원래 동작 대신 대기를 취소한다. */
export function applyPointer(
  state: SettingsEditorState,
  transition: (state: SettingsEditorState) => SettingsEditorState,
): SettingsEditorState {
  return isWaitingKey(state) ? cancelWaiting(state) : transition(state);
}

function getRow(state: SettingsEditorState, index: number): SettingsRow {
  const row = state.rows[index];
  if (row === undefined) {
    throw new Error(`Invalid settings row index: ${index}`);
  }
  return row;
}
