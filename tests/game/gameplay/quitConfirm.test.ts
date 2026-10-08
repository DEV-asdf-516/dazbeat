import { describe, expect, it } from 'vitest';
import { getQuitConfirmAction } from '../../../src/game/gameplay/quitConfirm.js';

describe('getQuitConfirmAction', () => {
  it('opens on back and passes other keys through while closed', () => {
    expect(getQuitConfirmAction(false, 'back')).toBe('open');
    expect(getQuitConfirmAction(false, 'confirm')).toBe('pass');
    expect(getQuitConfirmAction(false, 'mvMode')).toBe('pass');
    expect(getQuitConfirmAction(false, null)).toBe('pass');
  });

  it('quits on confirm, cancels on back and blocks everything else while open', () => {
    expect(getQuitConfirmAction(true, 'confirm')).toBe('quit');
    expect(getQuitConfirmAction(true, 'back')).toBe('cancel');
    expect(getQuitConfirmAction(true, 'mvMode')).toBe('ignore');
    expect(getQuitConfirmAction(true, null)).toBe('ignore');
  });
});
