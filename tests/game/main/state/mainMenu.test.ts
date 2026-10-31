import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../../../src/data/account.js';
import { parseNickname } from '../../../../src/data/nickname.js';
import type { AccountState } from '../../../../src/game/app/accountState.js';
import { withControlsOpen } from '../../../../src/game/app/controlsGuide.js';
import {
  createMainState,
  getChangedRegions,
  hoverMainButton,
  moveMainFocus,
  pressMainButton,
  withAccount,
} from '../../../../src/game/main/state/mainMenu.js';
import { requireDefined } from '../../../../src/invariant.js';

const USER: AuthUser = {
  id: 'user1',
  email: 'player@example.com',
  nickname: requireDefined(parseNickname('Star'), 'Invalid test nickname', 'Star'),
  isEditor: false,
  featuredAchievement: null,
};

const GUEST: AccountState = {
  kind: 'guest',
  hasSignInFailed: false,
};

function signedIn(user: AuthUser): AccountState {
  return {
    kind: 'signedIn',
    user,
  };
}

const FOCUS_REGIONS = ['menuButtons', 'profileButton', 'youtubeButton'] as const;

describe('getChangedRegions', () => {
  it('draws every region and the focus motion first without hearts', () => {
    expect(getChangedRegions(null, createMainState(GUEST))).toEqual([
      'account',
      'menu',
      'menuButtons',
      'profileButton',
      'accountButton',
      'youtubeButton',
      'controls',
      'controlsEntry',
      'controlsClose',
      'menuFocusMotion',
    ]);
  });

  it('redraws only the controls and their close button when only the controls open', () => {
    const state = createMainState(GUEST);

    expect(getChangedRegions(state, withControlsOpen(state, true))).toEqual([
      'controls',
      'controlsClose',
    ]);
  });

  it('plays the focus motion and the hearts when the focus moves to YouTube', () => {
    const state = createMainState(GUEST);

    expect(getChangedRegions(state, moveMainFocus(state, -1))).toEqual([
      ...FOCUS_REGIONS,
      'menuFocusMotion',
      'youtubeHearts',
    ]);
  });

  it('plays only the focus motion when the focus moves elsewhere', () => {
    const state = createMainState(GUEST);
    const youtube = moveMainFocus(state, -1);

    expect(getChangedRegions(state, moveMainFocus(state, 1))).toEqual([
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
    expect(getChangedRegions(youtube, moveMainFocus(youtube, 1))).toEqual([
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
  });

  it('redraws the account for an account change with the same menu items', () => {
    const state = createMainState(GUEST);

    expect(getChangedRegions(state, withAccount(state, { kind: 'signingIn' }))).toEqual([
      'account',
    ]);
  });

  it('redraws the focus too when an account change moves the focus back', () => {
    const profile = moveMainFocus(moveMainFocus(createMainState(signedIn(USER)), -1), -1);

    expect(getChangedRegions(profile, withAccount(profile, GUEST))).toEqual([
      'account',
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
  });

  it('replays only the menu item motion when the editor permission changes the menu', () => {
    const state = createMainState(signedIn(USER));
    const editor = withAccount(
      state,
      signedIn({
        ...USER,
        isEditor: true,
      }),
    );

    expect(getChangedRegions(state, editor)).toEqual(['account', 'menu', 'menuItemsMotion']);
  });

  it('plays the focus motion once when the menu and the focus change together', () => {
    const editor = createMainState(
      signedIn({
        ...USER,
        isEditor: true,
      }),
    );
    const chartEditor = moveMainFocus(moveMainFocus(editor, 1), 1);

    expect(getChangedRegions(chartEditor, withAccount(chartEditor, GUEST))).toEqual([
      'account',
      'menu',
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
  });
});

describe('getChangedRegions for the buttons', () => {
  const state = createMainState(signedIn(USER));

  it('redraws only the hovered button when the hover changes', () => {
    const hovered = hoverMainButton(state, 'account');

    expect(getChangedRegions(state, hovered)).toEqual(['accountButton']);
    expect(getChangedRegions(hovered, hoverMainButton(hovered, 'settings'))).toEqual([
      'menuButtons',
      'accountButton',
    ]);
  });

  it('redraws only the pressed button when it is pressed', () => {
    const hovered = hoverMainButton(state, 'profile');

    expect(getChangedRegions(hovered, pressMainButton(hovered, 'profile'))).toEqual([
      'profileButton',
    ]);
  });

  it('plays the hearts when the hover enters YouTube', () => {
    const hovered = hoverMainButton(state, 'youtube');

    expect(getChangedRegions(state, hovered)).toEqual(['youtubeButton', 'youtubeHearts']);
    expect(getChangedRegions(hovered, pressMainButton(hovered, 'youtube'))).toEqual([
      'youtubeButton',
    ]);
  });

  it('releases the hover of buttons hidden by an account change', () => {
    const editor = createMainState(
      signedIn({
        ...USER,
        isEditor: true,
      }),
    );

    expect(withAccount(hoverMainButton(editor, 'chartEditor'), GUEST).hover).toBeNull();
    expect(withAccount(hoverMainButton(state, 'profile'), GUEST).hover).toBeNull();
    expect(withAccount(hoverMainButton(state, 'account'), GUEST).hover).toEqual({
      kind: 'button',
      button: 'account',
      isPressed: false,
    });
  });
});
