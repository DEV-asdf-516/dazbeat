import { getButtonView, isButtonHovered, unhoverButton } from '../ui/state/buttonPointer.js';
import type { ButtonView } from '../ui/state/buttonPointer.js';
import type { Messages } from '../../i18n/messages/ko.js';
import type { Settings } from '../../storage/settings.js';
import { formatKeyCode } from '../ui/state/format.js';
import { readMenuAction } from '../ui/state/menuAction.js';

export type ControlsKeyAction = 'open' | 'close' | 'block' | 'pass';

// 막도 버튼 항목으로 다뤄, 진입 클릭의 pointer up 이 열자마자 막을 닫지 않게 막에서 누른 경우만 닫는다.
export type ControlsButton = 'controlsEntry' | 'controlsClose' | 'controlsBackdrop';

export interface ControlsRow {
  readonly keys: readonly string[];
  readonly label: string;
}

export interface ControlsGroup {
  readonly title: string;
  readonly rows: readonly ControlsRow[];
}

const TOGGLE_CODE = 'KeyH';
const MOVE_KEYS = '↑↓';
const SELECT_KEY = 'Enter';
const BACK_KEY = 'Esc';
const ADJUST_KEYS = '←→';
const CATEGORY_KEYS = 'Q/E';
const RANDOM_KEY = 'R';
const TAB_KEY = 'Tab';

export function readControlsKey(
  isOpen: boolean,
  event: Pick<KeyboardEvent, 'code' | 'repeat'>,
): ControlsKeyAction {
  if (!isOpen) {
    return event.code === TOGGLE_CODE && !event.repeat ? 'open' : 'pass';
  }
  return (event.code === TOGGLE_CODE && !event.repeat) || readMenuAction(event) === 'back'
    ? 'close'
    : 'block';
}

export function isControlsButtonEnabled(button: ControlsButton, isOpen: boolean): boolean {
  return button === 'controlsEntry' || isOpen;
}

// Phaser 는 숨긴 대상에 POINTER_OUT 을 보내지 않으므로 팝업을 닫을 때 그 안 버튼의 hover 를 푼다.
export function withControlsOpen<
  S extends { readonly isControlsOpen: boolean; readonly hover: { readonly kind: string } | null },
>(state: S, isControlsOpen: boolean): S {
  if (state.isControlsOpen === isControlsOpen) {
    return state;
  }
  return {
    ...state,
    isControlsOpen,
    hover: isControlsOpen
      ? state.hover
      : unhoverButton(unhoverButton(state.hover, 'controlsClose'), 'controlsBackdrop'),
  };
}

export function getControlsCloseView(
  hover: { readonly kind: string } | null,
  isOpen: boolean,
): ButtonView {
  return getButtonView(hover, 'controlsClose', isOpen, false);
}

export function isControlsEntryHovered(hover: { readonly kind: string } | null): boolean {
  return isButtonHovered(hover, 'controlsEntry');
}

export function getControlsGuide(
  messages: Messages['controls'],
  { keyBindings, laneMode }: Pick<Settings, 'keyBindings' | 'laneMode'>,
): readonly ControlsGroup[] {
  return [
    {
      title: messages.gameplay.title,
      rows: [
        {
          keys: keyBindings[laneMode].map(formatKeyCode),
          label: messages.gameplay.hitNotes,
        },
        {
          keys: [TAB_KEY],
          label: messages.gameplay.switchMvMode,
        },
      ],
    },
    {
      title: messages.menu.title,
      rows: [
        {
          keys: [MOVE_KEYS],
          label: messages.menu.move,
        },
        {
          keys: [SELECT_KEY],
          label: messages.menu.select,
        },
        {
          keys: [BACK_KEY],
          label: messages.menu.back,
        },
        {
          keys: [ADJUST_KEYS],
          label: messages.menu.adjust,
        },
        {
          keys: [CATEGORY_KEYS],
          label: messages.menu.switchCategory,
        },
        {
          keys: [RANDOM_KEY],
          label: messages.menu.randomSong,
        },
        {
          keys: [TAB_KEY],
          label: messages.menu.openSettings,
        },
      ],
    },
  ];
}
