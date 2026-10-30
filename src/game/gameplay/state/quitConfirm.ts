import type { GameplayCommand } from './gameplayCommand.js';

export type QuitConfirmReason = 'userPaused' | 'resyncFailed';

export const QUIT_CONFIRM_TEXTS = {
  userPaused: {
    titleKey: 'gameplay.quitTitle',
    bodyKey: 'gameplay.quitConfirm',
  },
  resyncFailed: {
    titleKey: 'gameplay.resyncFailedTitle',
    bodyKey: 'gameplay.resyncFailedBody',
  },
} as const satisfies Record<QuitConfirmReason, { titleKey: string; bodyKey: string }>;

export type QuitConfirmAction = 'open' | 'quit' | 'cancel' | 'ignore' | 'pass';

export function getQuitConfirmAction(
  isOpen: boolean,
  command: GameplayCommand | null,
): QuitConfirmAction {
  if (!isOpen) {
    return command === 'back' ? 'open' : 'pass';
  }
  switch (command) {
    case 'confirm':
      return 'quit';
    case 'back':
      return 'cancel';
    default:
      return 'ignore';
  }
}
