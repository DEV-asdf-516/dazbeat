import type Phaser from 'phaser';
import type { SignInFailure } from '../../../app/accountState.js';
import type { Messages } from '../../../../i18n/messages/ko.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import type { ConfirmDialogContent } from './ConfirmDialog.js';

// 확인 버튼 하나뿐이라 숨긴 취소 버튼도 같은 닫기로 잇는다.
export function addSignInFailureDialog(scene: Phaser.Scene, close: PointerActions): ConfirmDialog {
  return new ConfirmDialog(scene, {
    cancel: close,
    accept: close,
  });
}

export function getSignInFailureDialog(
  messages: Messages['account']['signInFailure'],
  failure: SignInFailure | 'none',
): ConfirmDialogContent | null {
  if (failure === 'none') {
    return null;
  }
  return {
    title: messages.title,
    body: messages[failure],
    cancelLabel: null,
    acceptLabel: messages.close,
    acceptTone: 'default',
  };
}
