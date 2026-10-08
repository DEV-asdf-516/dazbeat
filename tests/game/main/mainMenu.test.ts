import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../../src/backend/auth.js';
import { createAccountState, startSignIn } from '../../../src/game/accountState.js';
import { getMainMenuItems } from '../../../src/game/main/mainMenu.js';

const PLAYER: AuthUser = {
  id: 'user-1',
  email: 'player@example.com',
  name: 'Player',
  isEditor: false,
};
const EDITOR: AuthUser = { ...PLAYER, id: 'user-2', isEditor: true };

describe('getMainMenuItems', () => {
  it('shows the player menu to a guest', () => {
    expect(getMainMenuItems(createAccountState(null))).toEqual(['play', 'settings', 'credits']);
  });

  it('shows the player menu while signing in', () => {
    expect(getMainMenuItems(startSignIn())).toEqual(['play', 'settings', 'credits']);
  });

  it('shows the player menu to a signed-in user who is not an editor', () => {
    expect(getMainMenuItems(createAccountState(PLAYER))).toEqual(['play', 'settings', 'credits']);
  });

  it('puts the chart editor right after play for an editor', () => {
    expect(getMainMenuItems(createAccountState(EDITOR))).toEqual([
      'play',
      'chartEditor',
      'settings',
      'credits',
    ]);
  });

  it('removes the chart editor after an editor signs out', () => {
    getMainMenuItems(createAccountState(EDITOR));

    expect(getMainMenuItems(createAccountState(null))).not.toContain('chartEditor');
  });
});
