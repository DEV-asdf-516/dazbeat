import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../../../src/data/account.js';
import { parseNickname } from '../../../../src/data/nickname.js';
import type { AccountState } from '../../../../src/game/app/accountState.js';
import {
  clickControlsHelp,
  isControlsHelpShown,
  withControlsOpen,
} from '../../../../src/game/app/controlsGuide.js';
import {
  createMainState,
  getChangedRegions,
  hoverMainButton,
  moveMainFocus,
  pressMainButton,
  unhoverMainButton,
  withAccount,
} from '../../../../src/game/main/state/mainMenu.js';
import type { AccelerationNotice } from '../../../../src/game/main/state/accelerationNotice.js';
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
  signInFailure: 'none',
};

function signedIn(user: AuthUser): AccountState {
  return {
    kind: 'signedIn',
    user,
  };
}

const CLOSED_NOTICE: AccelerationNotice = { kind: 'closed' };

const FOCUS_REGIONS = ['menuButtons', 'profileButton', 'youtubeButton', 'noticeButton'] as const;

describe('getChangedRegions', () => {
  it('draws every region and the focus motion first without hearts', () => {
    expect(getChangedRegions(null, createMainState(GUEST, CLOSED_NOTICE))).toEqual([
      'account',
      'menu',
      'menuButtons',
      'profileButton',
      'accountButton',
      'youtubeButton',
      'controls',
      'controlsEntry',
      'controlsClose',
      'controlsHelpCard',
      'controlsHelpButton',
      'accelerationNotice',
      'accelerationNoticeButtons',
      'signInFailure',
      'signInFailureButtons',
      'noticeButton',
      'noticeBoard',
      'noticeBoardScroll',
      'noticeBoardButtons',
      'menuFocusMotion',
    ]);
  });

  it('redraws only the controls when only the controls open', () => {
    const state = createMainState(GUEST, CLOSED_NOTICE);

    expect(getChangedRegions(state, withControlsOpen(state, true))).toEqual(['controls']);
  });

  it('plays the focus motion and the hearts when the focus moves to YouTube', () => {
    const state = createMainState(GUEST, CLOSED_NOTICE);

    expect(getChangedRegions(state, moveMainFocus(state, 'previous'))).toEqual([
      ...FOCUS_REGIONS,
      'menuFocusMotion',
      'youtubeHearts',
    ]);
  });

  it('plays only the focus motion when the focus moves elsewhere', () => {
    const state = createMainState(GUEST, CLOSED_NOTICE);
    const youtube = moveMainFocus(state, 'previous');

    expect(getChangedRegions(state, moveMainFocus(state, 'next'))).toEqual([
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
    expect(getChangedRegions(youtube, moveMainFocus(youtube, 'next'))).toEqual([
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
  });

  it('redraws the account for an account change with the same menu items', () => {
    const state = createMainState(GUEST, CLOSED_NOTICE);

    expect(getChangedRegions(state, withAccount(state, { kind: 'signingIn' }))).toEqual([
      'account',
    ]);
  });

  it('redraws the focus too when an account change moves the focus back', () => {
    const profile = moveMainFocus(
      moveMainFocus(createMainState(signedIn(USER), CLOSED_NOTICE), 'previous'),
      'previous',
    );

    expect(getChangedRegions(profile, withAccount(profile, GUEST))).toEqual([
      'account',
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
  });

  it('replays only the menu item motion when the editor permission changes the menu', () => {
    const state = createMainState(signedIn(USER), CLOSED_NOTICE);
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
      CLOSED_NOTICE,
    );
    const chartEditor = moveMainFocus(moveMainFocus(editor, 'next'), 'next');

    expect(getChangedRegions(chartEditor, withAccount(chartEditor, GUEST))).toEqual([
      'account',
      'menu',
      ...FOCUS_REGIONS,
      'menuFocusMotion',
    ]);
  });
});

describe('controls help', () => {
  const open = withControlsOpen(createMainState(GUEST, CLOSED_NOTICE), true);

  it('shows the card on (?) hover, keeps it pinned and redraws the help regions but not the controls list', () => {
    const hovered = hoverMainButton(open, 'controlsHelp');
    const pinned = clickControlsHelp(hovered);
    const left = unhoverMainButton(pinned, 'controlsHelp');

    expect(isControlsHelpShown(hovered)).toBe(true);
    expect(getChangedRegions(open, hovered)).toEqual(['controlsHelpCard', 'controlsHelpButton']);
    expect(getChangedRegions(hovered, pinned)).not.toContain('controls');
    expect(isControlsHelpShown(left)).toBe(true);
    expect(getChangedRegions(pinned, left)).toEqual(['controlsHelpButton']);
  });

  it('hides a pinned card on the next click even under the pointer until the pointer comes back', () => {
    const dismissed = clickControlsHelp(
      hoverMainButton(
        unhoverMainButton(clickControlsHelp(hoverMainButton(open, 'controlsHelp')), 'controlsHelp'),
        'controlsHelp',
      ),
    );
    const left = unhoverMainButton(dismissed, 'controlsHelp');

    expect(isControlsHelpShown(dismissed)).toBe(false);
    expect(left.controls).toBe('open');
    expect(isControlsHelpShown(hoverMainButton(left, 'controlsHelp'))).toBe(true);
  });

  it('closes with the pin and the (?) hover dropped and reopens unpinned', () => {
    const closed = withControlsOpen(
      clickControlsHelp(hoverMainButton(open, 'controlsHelp')),
      false,
    );

    expect(closed.controls).toBe('closed');
    expect(closed.hover).toBeNull();
    expect(isControlsHelpShown(closed)).toBe(false);
    expect(withControlsOpen(closed, true).controls).toBe('open');
  });
});

describe('getChangedRegions for the buttons', () => {
  const state = createMainState(signedIn(USER), CLOSED_NOTICE);

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
      CLOSED_NOTICE,
    );

    expect(withAccount(hoverMainButton(editor, 'chartEditor'), GUEST).hover).toBeNull();
    expect(withAccount(hoverMainButton(state, 'profile'), GUEST).hover).toBeNull();
    expect(
      withAccount(hoverMainButton(createMainState(GUEST, CLOSED_NOTICE), 'account'), signedIn(USER))
        .hover,
    ).toBeNull();
  });
});
