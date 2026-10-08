import { canOpenChartEditor } from '../accountState.js';
import type { AccountState } from '../accountState.js';

export type MainMenuItem = 'play' | 'chartEditor' | 'settings' | 'credits';

export function getMainMenuItems(account: AccountState): MainMenuItem[] {
  if (account.kind === 'signedIn' && canOpenChartEditor(account.user)) {
    return ['play', 'chartEditor', 'settings', 'credits'];
  }
  return ['play', 'settings', 'credits'];
}
