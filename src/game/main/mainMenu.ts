import { canOpenChartEditor } from '../accountState.js';
import type { AccountState } from '../accountState.js';

export type MainMenuItem = 'play' | 'practice' | 'chartEditor' | 'settings' | 'credits';

export function getMainMenuItems(account: AccountState): MainMenuItem[] {
  if (account.kind === 'signedIn' && canOpenChartEditor(account.user)) {
    return ['play', 'practice', 'chartEditor', 'settings', 'credits'];
  }
  return ['play', 'practice', 'settings', 'credits'];
}
