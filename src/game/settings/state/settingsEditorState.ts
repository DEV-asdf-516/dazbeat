import type { Language } from '../../i18n/language.js';
import type { Lane } from '../../rhythm/types.js';
import { DEFAULT_SETTINGS } from '../../storage/settings.js';
import type { Settings } from '../../storage/settings.js';
import { adjustSetting, assignKey } from './settingsAdjust.js';
import type { SettingsRow } from './settingsAdjust.js';
import { requireDefined } from '../../invariant.js';
import { cycleItem } from '../../range.js';
import { readMenuAction } from '../ui/menuInput.js';
import { readKeyCapture } from './keyCapture.js';

export type SettingsMode =
  | { readonly kind: 'browsing' }
  | { readonly kind: 'waitingKey'; readonly lane: Lane }
  | { readonly kind: 'confirmingReset' };

export interface SettingsEditorState {
  readonly rows: readonly SettingsRow[];
  readonly settings: Settings;
  readonly rowIndex: number;
  readonly mode: SettingsMode;
  readonly hoveredRowIndex: number | null;
}

const BROWSING: SettingsMode = { kind: 'browsing' };

export function createSettingsEditorState(
  rows: readonly SettingsRow[],
  settings: Settings,
): SettingsEditorState {
  return {
    rows,
    settings,
    rowIndex: 0,
    mode: BROWSING,
    hoveredRowIndex: null,
  };
}

export function isRowShown(row: SettingsRow, settings: Settings): boolean {
  return row.kind !== 'key' || row.lane < settings.laneMode;
}

export type SettingsRowAppearance = 'emphasized' | 'normal';

export function getRowAppearance(state: SettingsEditorState, index: number): SettingsRowAppearance {
  return index === state.rowIndex || index === state.hoveredRowIndex ? 'emphasized' : 'normal';
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

export function hoverRow(state: SettingsEditorState, index: number): SettingsEditorState {
  return index === state.hoveredRowIndex
    ? state
    : {
        ...state,
        hoveredRowIndex: index,
      };
}

export function unhoverRow(state: SettingsEditorState, index: number): SettingsEditorState {
  return index === state.hoveredRowIndex
    ? {
        ...state,
        hoveredRowIndex: null,
      }
    : state;
}

export function moveFocus(state: SettingsEditorState, delta: 1 | -1): SettingsEditorState {
  const shownIndexes = state.rows.flatMap((row, index) =>
    isRowShown(row, state.settings) ? [index] : [],
  );
  return focusRow(state, cycleItem(shownIndexes, state.rowIndex, delta));
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
  return releaseHiddenHover({
    ...state,
    rowIndex: index,
    settings,
  });
}

export function startWaiting(state: SettingsEditorState, index: number): SettingsEditorState {
  const row = getShownRow(state, index);
  if (row.kind !== 'key') {
    return focusRow(state, index);
  }
  return {
    ...state,
    rowIndex: index,
    mode: {
      kind: 'waitingKey',
      lane: row.lane,
    },
  };
}

export function requestReset(state: SettingsEditorState): SettingsEditorState {
  return state.mode.kind === 'confirmingReset'
    ? state
    : {
        ...state,
        mode: { kind: 'confirmingReset' },
      };
}

export function bindWaitingKey(state: SettingsEditorState, code: string): SettingsEditorState {
  const { mode } = state;
  if (mode.kind !== 'waitingKey') {
    throw new Error('No lane is waiting for a key');
  }
  const { lane } = mode;
  // 플레이 중 Tab 은 항상 MV 모드 전환이어야 하므로 레인 키로 받지 않는다.
  if (code === 'Tab') {
    return state;
  }
  const { keyBindings, laneMode } = state.settings;
  const keys = keyBindings[laneMode];
  if (code === 'Escape' || keys[lane] === code) {
    return {
      ...state,
      mode: BROWSING,
    };
  }
  return releaseHiddenHover({
    ...state,
    mode: BROWSING,
    settings: {
      ...state.settings,
      keyBindings: {
        ...keyBindings,
        [laneMode]: assignKey(keys, lane, code),
      },
    },
  });
}

// 언어까지 기본값(브라우저 언어)으로 돌리면 읽지 못하는 언어로 바뀔 수 있어 언어는 남긴다.
export function confirmReset(state: SettingsEditorState): SettingsEditorState {
  if (state.mode.kind !== 'confirmingReset') {
    throw new Error('Reset is not being confirmed');
  }
  return releaseHiddenHover({
    ...state,
    mode: BROWSING,
    settings: {
      ...DEFAULT_SETTINGS,
      language: state.settings.language,
    },
  });
}

export function cancelPrompt(state: SettingsEditorState): SettingsEditorState {
  return state.mode.kind === 'browsing'
    ? state
    : {
        ...state,
        mode: BROWSING,
      };
}

export type SettingsKeyResult =
  { readonly kind: 'pass' } | { readonly kind: 'state'; readonly state: SettingsEditorState };

export function readSettingsKey(
  state: SettingsEditorState,
  event: Pick<KeyboardEvent, 'code' | 'repeat'>,
): SettingsKeyResult {
  switch (state.mode.kind) {
    case 'waitingKey': {
      const code = readKeyCapture(event);
      return {
        kind: 'state',
        state: code === null ? state : bindWaitingKey(state, code),
      };
    }
    case 'confirmingReset':
      switch (readMenuAction(event)) {
        case 'confirm':
          return {
            kind: 'state',
            state: confirmReset(state),
          };
        case 'back':
          return {
            kind: 'state',
            state: cancelPrompt(state),
          };
        default:
          return {
            kind: 'state',
            state,
          };
      }
    case 'browsing':
      return { kind: 'pass' };
  }
}

export type BackOutcome = { kind: 'leave' } | { kind: 'stay'; state: SettingsEditorState };

export function pressBack(state: SettingsEditorState): BackOutcome {
  return state.mode.kind === 'browsing'
    ? { kind: 'leave' }
    : {
        kind: 'stay',
        state: cancelPrompt(state),
      };
}

export function applyPointer(
  state: SettingsEditorState,
  transition: (state: SettingsEditorState) => SettingsEditorState,
): SettingsEditorState {
  return state.mode.kind === 'browsing' ? transition(state) : cancelPrompt(state);
}

// 숨긴 행은 POINTER_OUT 을 받지 못하므로 설정을 바꾸는 전이에서 hover 를 직접 해제한다.
function releaseHiddenHover(state: SettingsEditorState): SettingsEditorState {
  const { hoveredRowIndex } = state;
  if (hoveredRowIndex === null || isRowShown(getRow(state, hoveredRowIndex), state.settings)) {
    return state;
  }
  return {
    ...state,
    hoveredRowIndex: null,
  };
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
