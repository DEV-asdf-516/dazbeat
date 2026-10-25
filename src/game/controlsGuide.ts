import type { Messages } from '../i18n/messages/ko.js';
import type { Settings } from '../storage/settings.js';
import { formatKeyCode } from './ui/format.js';

export type ControlsKeyAction = 'open' | 'close' | 'block' | 'pass';

export interface ControlsRow {
  readonly keys: readonly string[];
  readonly label: string;
}

export interface ControlsGroup {
  readonly title: string;
  readonly rows: readonly ControlsRow[];
}

const TOGGLE_CODE = 'KeyH';
const CLOSE_CODES: readonly string[] = [TOGGLE_CODE, 'Escape'];
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
  return CLOSE_CODES.includes(event.code) && !event.repeat ? 'close' : 'block';
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
