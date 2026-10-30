import type { Language } from '../../../i18n/language.js';
import type { Lane } from '../../../rhythm/types.js';
import { DEFAULT_SETTINGS } from '../../../storage/settings.js';
import type { Settings } from '../../../storage/settings.js';
import { adjustSetting, assignKey, canAdjust } from './settingsAdjust.js';
import type { SettingsRow } from './settingsAdjust.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { requireDefined } from '../../../invariant.js';
import { cycleItem } from '../../../range.js';
import {
  getButtonView,
  hoverButton,
  isButtonHovered,
  isButtonPressed,
  pressButton,
  releaseButton,
  releaseDisabledButton,
  unhoverButton,
} from '../../ui/state/buttonPointer.js';
import type { ButtonHover, ButtonView } from '../../ui/state/buttonPointer.js';
import {
  getControlsCloseView,
  isControlsButtonEnabled,
  isControlsEntryHovered,
  releaseControlsHover,
} from '../../app/controlsGuide.js';
import type { ControlsButton } from '../../app/controlsGuide.js';
import { readMenuAction } from '../../ui/view/input/menuInput.js';
import { readKeyCapture } from './keyCapture.js';
import { formatRowValue } from './settingsRowView.js';

export type SettingsMode =
  | { readonly kind: 'browsing' }
  | { readonly kind: 'waitingKey'; readonly lane: Lane }
  | { readonly kind: 'confirmingReset' };

type StepDirection = 1 | -1;

export type SettingsButton =
  | 'back'
  | 'resetEntry'
  | 'resetCancel'
  | 'resetAccept'
  | ControlsButton
  | `keyBox:${number}`
  | `step:${number}:${StepDirection}`;

export type SettingsHover =
  { readonly kind: 'row'; readonly index: number } | ButtonHover<SettingsButton>;

export interface SettingsEditorState {
  readonly rows: readonly SettingsRow[];
  readonly settings: Settings;
  readonly rowIndex: number;
  readonly mode: SettingsMode;
  readonly hover: SettingsHover | null;
  readonly displayedLanguage: Language;
  readonly isControlsOpen: boolean;
}

const BROWSING: SettingsMode = { kind: 'browsing' };
const STEP_DIRECTIONS: readonly StepDirection[] = [-1, 1];

type RowButton =
  | { readonly kind: 'keyBox'; readonly index: number }
  | { readonly kind: 'step'; readonly index: number; readonly direction: StepDirection };

export function getKeyBoxButton(index: number): SettingsButton {
  return `keyBox:${index}`;
}

export function getStepButton(index: number, direction: StepDirection): SettingsButton {
  return `step:${index}:${direction}`;
}

export function createSettingsEditorState(
  rows: readonly SettingsRow[],
  settings: Settings,
  displayedLanguage: Language,
): SettingsEditorState {
  return {
    rows,
    settings,
    rowIndex: 0,
    mode: BROWSING,
    hover: null,
    displayedLanguage,
    isControlsOpen: false,
  };
}

export function isRowShown(row: SettingsRow, settings: Settings): boolean {
  return row.kind !== 'key' || row.lane < settings.laneMode;
}

export type SettingsRowAppearance = 'emphasized' | 'normal';

export function getRowAppearance(state: SettingsEditorState, index: number): SettingsRowAppearance {
  return index === state.rowIndex || index === getHoveredRowIndex(state) ? 'emphasized' : 'normal';
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
  return index === getHoveredRowIndex(state)
    ? state
    : {
        ...state,
        hover: {
          kind: 'row',
          index,
        },
      };
}

export function unhoverRow(state: SettingsEditorState, index: number): SettingsEditorState {
  return index === getHoveredRowIndex(state)
    ? {
        ...state,
        hover: null,
      }
    : state;
}

export function hoverSettingsButton(
  state: SettingsEditorState,
  button: SettingsButton,
): SettingsEditorState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverSettingsButton(
  state: SettingsEditorState,
  button: SettingsButton,
): SettingsEditorState {
  return withHover(state, unhoverButton(state.hover, button));
}

export function pressSettingsButton(
  state: SettingsEditorState,
  button: SettingsButton,
): SettingsEditorState {
  return withHover(state, pressButton(state.hover, button, isSettingsButtonEnabled(state, button)));
}

export function releaseSettingsButton(
  state: SettingsEditorState,
  button: SettingsButton,
): SettingsEditorState {
  return withHover(state, releaseButton(state.hover, button));
}

export function pointRowButton(
  state: SettingsEditorState,
  button: SettingsButton,
): SettingsEditorState {
  const rowButton = requireDefined(
    findRowButton(state, button),
    'Not a settings row button',
    button,
  );
  switch (rowButton.kind) {
    case 'keyBox':
      return startWaiting(state, rowButton.index);
    case 'step':
      return adjustRow(state, rowButton.index, rowButton.direction);
  }
}

export function withControlsOpen(
  state: SettingsEditorState,
  isControlsOpen: boolean,
): SettingsEditorState {
  if (state.isControlsOpen === isControlsOpen) {
    return state;
  }
  return {
    ...state,
    isControlsOpen,
    hover: isControlsOpen ? state.hover : releaseControlsHover(state.hover),
  };
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
): SettingsEditorState {
  const settings = adjustSetting(
    state.settings,
    getShownRow(state, index),
    direction,
    state.displayedLanguage,
  );
  if (settings === state.settings && index === state.rowIndex) {
    return state;
  }
  return settleHover({
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
  return settleHover({
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
  return settleHover({
    ...state,
    mode: BROWSING,
    hover: releaseResetDialogHover(state.hover),
    settings: {
      ...DEFAULT_SETTINGS,
      language: state.settings.language,
    },
  });
}

export function cancelPrompt(state: SettingsEditorState): SettingsEditorState {
  return {
    ...state,
    mode: BROWSING,
    hover: releaseResetDialogHover(state.hover),
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

export function withDisplayedLanguage(
  state: SettingsEditorState,
  language: Language,
): SettingsEditorState {
  return language === state.displayedLanguage
    ? state
    : settleHover({
        ...state,
        displayedLanguage: language,
      });
}

export type SettingsEffect =
  | { readonly kind: 'save'; readonly settings: Settings }
  | { readonly kind: 'changeLanguage'; readonly language: Language }
  | { readonly kind: 'focusSound'; readonly settings: Settings };

export function getSettingsEffects(
  previous: SettingsEditorState,
  next: SettingsEditorState,
): readonly SettingsEffect[] {
  const effects: SettingsEffect[] = [];
  if (next.settings !== previous.settings) {
    effects.push({
      kind: 'save',
      settings: next.settings,
    });
    const { language } = next.settings;
    if (language !== null && language !== next.displayedLanguage) {
      effects.push({
        kind: 'changeLanguage',
        language,
      });
    }
  }
  // 키 이동과 클릭 모두 줄 포커스가 바뀌면 같은 효과음을 낸다.
  if (next.rowIndex !== previous.rowIndex) {
    effects.push({
      kind: 'focusSound',
      settings: next.settings,
    });
  }
  return effects;
}

export function getWaitingLane(state: SettingsEditorState): Lane | null {
  return state.mode.kind === 'waitingKey' ? state.mode.lane : null;
}

export function isRowShownAt(state: SettingsEditorState, index: number): boolean {
  return isRowShown(getRow(state, index), state.settings);
}

export function getRowValue(state: SettingsEditorState, index: number): string {
  return formatRowValue(
    getRow(state, index),
    state.settings,
    state.displayedLanguage,
    getWaitingLane(state),
  );
}

export function canAdjustRow(
  state: SettingsEditorState,
  index: number,
  direction: 1 | -1,
): boolean {
  return canAdjust(state.settings, getRow(state, index), direction, state.displayedLanguage);
}

export function getKeyBoxView(state: SettingsEditorState, index: number): ButtonView {
  return getButtonView(state.hover, getKeyBoxButton(index), true, false);
}

export function getStepView(
  state: SettingsEditorState,
  index: number,
  direction: StepDirection,
): ButtonView {
  return getButtonView(
    state.hover,
    getStepButton(index, direction),
    canAdjustRow(state, index, direction),
    false,
  );
}

export function getBackButtonView(state: SettingsEditorState): ButtonView {
  return getButtonView(state.hover, 'back', true, false);
}

export function getResetDialogButtonViews(state: SettingsEditorState): {
  readonly cancel: ButtonView;
  readonly accept: ButtonView;
} {
  const isConfirming = state.mode.kind === 'confirmingReset';
  return {
    cancel: getButtonView(state.hover, 'resetCancel', isConfirming, false),
    accept: getButtonView(state.hover, 'resetAccept', isConfirming, false),
  };
}

export function isResetEntryHovered(state: SettingsEditorState): boolean {
  return isButtonHovered(state.hover, 'resetEntry');
}

export function isSettingsControlsEntryHovered(state: SettingsEditorState): boolean {
  return isControlsEntryHovered(state.hover);
}

export function getSettingsControlsCloseView(state: SettingsEditorState): ButtonView {
  return getControlsCloseView(state.hover, state.isControlsOpen);
}

export type SettingsRegion =
  | 'title'
  | 'groups'
  | 'rowLabels'
  | 'rowControls'
  | 'focusStar'
  | 'waitingText'
  | 'controlsEntry'
  | 'resetDialog'
  | 'controls'
  | 'rowButtons'
  | 'backButton'
  | 'resetEntry'
  | 'resetButtons'
  | 'controlsClose';

type SettingsReader = StateReader<SettingsEditorState>;

const readSettings: SettingsReader = (state) => state.settings;
const readRowIndex: SettingsReader = (state) => state.rowIndex;
const readHoveredRowIndex: SettingsReader = getHoveredRowIndex;
// hover 는 state 안 참조라 행 버튼 hover 가 바뀔 때만 다른 값이 된다.
const readRowButtonHover: SettingsReader = (state) =>
  state.hover?.kind === 'button' && findRowButton(state, state.hover.button) !== undefined
    ? state.hover
    : null;
const readBackHovered: SettingsReader = (state) => isButtonHovered(state.hover, 'back');
const readBackPressed: SettingsReader = (state) => isButtonPressed(state.hover, 'back');
const readResetEntryHovered: SettingsReader = (state) => isButtonHovered(state.hover, 'resetEntry');
const readCancelHovered: SettingsReader = (state) => isButtonHovered(state.hover, 'resetCancel');
const readCancelPressed: SettingsReader = (state) => isButtonPressed(state.hover, 'resetCancel');
const readAcceptHovered: SettingsReader = (state) => isButtonHovered(state.hover, 'resetAccept');
const readAcceptPressed: SettingsReader = (state) => isButtonPressed(state.hover, 'resetAccept');
const readEntryHovered: SettingsReader = (state) => isButtonHovered(state.hover, 'controlsEntry');
const readCloseHovered: SettingsReader = (state) => isButtonHovered(state.hover, 'controlsClose');
const readClosePressed: SettingsReader = (state) => isButtonPressed(state.hover, 'controlsClose');
const readMode: SettingsReader = (state) => state.mode;
const readDisplayedLanguage: SettingsReader = (state) => state.displayedLanguage;
const readControlsOpen: SettingsReader = (state) => state.isControlsOpen;
const readIsConfirmingReset: SettingsReader = (state) => state.mode.kind === 'confirmingReset';

const REGION_SOURCES: Readonly<Record<SettingsRegion, readonly SettingsReader[]>> = {
  title: [readDisplayedLanguage],
  groups: [readDisplayedLanguage],
  rowLabels: [readSettings, readRowIndex, readHoveredRowIndex, readDisplayedLanguage],
  rowControls: [readSettings, readDisplayedLanguage, readMode],
  focusStar: [readRowIndex],
  waitingText: [readMode, readDisplayedLanguage],
  controlsEntry: [readMode, readEntryHovered],
  // 열림이 바뀔 때만 골라져야 확인 창 페이드가 열고 닫을 때만 돈다. 문구는 칠할 때의 언어로 번역한다.
  resetDialog: [readIsConfirmingReset],
  controls: [readControlsOpen],
  // 조정 버튼의 활성은 설정과 표시 언어로 정해진다.
  rowButtons: [readRowButtonHover, readSettings, readDisplayedLanguage],
  backButton: [readBackHovered, readBackPressed],
  resetEntry: [readResetEntryHovered],
  resetButtons: [
    readCancelHovered,
    readCancelPressed,
    readAcceptHovered,
    readAcceptPressed,
    readIsConfirmingReset,
  ],
  controlsClose: [readCloseHovered, readClosePressed, readControlsOpen],
};

export function getChangedRegions(
  previous: SettingsEditorState | null,
  next: SettingsEditorState,
): readonly SettingsRegion[] {
  return filterChangedRegions(REGION_SOURCES, previous, next);
}

// 숨긴 행은 POINTER_OUT 을 받지 못하므로 설정을 바꾸는 전이에서 그 행과 행 버튼의 hover 를 직접 해제한다.
// 설정이 바뀌어 비활성이 된 조정 버튼의 눌림도 함께 푼다.
function settleHover(state: SettingsEditorState): SettingsEditorState {
  let { hover } = state;
  for (const [index, row] of state.rows.entries()) {
    if (!isRowShown(row, state.settings)) {
      if (index === getHoveredRowIndex(state)) {
        hover = null;
      }
      hover = unhoverButton(hover, getKeyBoxButton(index));
      continue;
    }
    if (row.kind === 'key') {
      continue;
    }
    for (const direction of STEP_DIRECTIONS) {
      hover = releaseDisabledButton(
        hover,
        getStepButton(index, direction),
        canAdjust(state.settings, row, direction, state.displayedLanguage),
      );
    }
  }
  return withHover(state, hover);
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 확인 창을 닫을 때 그 안 버튼의 hover 를 푼다.
function releaseResetDialogHover(hover: SettingsHover | null): SettingsHover | null {
  return unhoverButton(unhoverButton(hover, 'resetCancel'), 'resetAccept');
}

function withHover(state: SettingsEditorState, hover: SettingsHover | null): SettingsEditorState {
  return hover === state.hover
    ? state
    : {
        ...state,
        hover,
      };
}

function getHoveredRowIndex(state: SettingsEditorState): number | null {
  return state.hover?.kind === 'row' ? state.hover.index : null;
}

function findRowButton(state: SettingsEditorState, button: SettingsButton): RowButton | undefined {
  for (const index of state.rows.keys()) {
    if (button === getKeyBoxButton(index)) {
      return {
        kind: 'keyBox',
        index,
      };
    }
    for (const direction of STEP_DIRECTIONS) {
      if (button === getStepButton(index, direction)) {
        return {
          kind: 'step',
          index,
          direction,
        };
      }
    }
  }
  return undefined;
}

function isSettingsButtonEnabled(state: SettingsEditorState, button: SettingsButton): boolean {
  switch (button) {
    case 'back':
    case 'resetEntry':
      return true;
    case 'resetCancel':
    case 'resetAccept':
      return state.mode.kind === 'confirmingReset';
    case 'controlsEntry':
    case 'controlsClose':
    case 'controlsBackdrop':
      return isControlsButtonEnabled(button, state.isControlsOpen);
  }
  const rowButton = requireDefined(findRowButton(state, button), 'Not a settings button', button);
  switch (rowButton.kind) {
    case 'keyBox':
      return true;
    case 'step':
      return canAdjustRow(state, rowButton.index, rowButton.direction);
  }
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
