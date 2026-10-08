import { describe, expect, it } from 'vitest';
import { readGameplayKey } from '../../../src/game/gameplay/gameplayInput.js';
import type { Settings } from '../../../src/storage/LocalSave.js';

const BINDINGS: Settings['keyBindings'] = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];

describe('readGameplayKey', () => {
  it.each([
    ['KeyD', 0],
    ['KeyF', 1],
    ['KeyJ', 2],
    ['KeyK', 3],
  ] as const)('maps bound key %s to lane %i without a command', (code, lane) => {
    expect(readGameplayKey(code, BINDINGS)).toEqual({ lane, command: null });
  });

  it.each([
    ['Enter', 'confirm'],
    ['Escape', 'back'],
    ['Tab', 'mvMode'],
  ] as const)('maps unbound %s to the %s command', (code, command) => {
    expect(readGameplayKey(code, BINDINGS)).toEqual({ lane: null, command });
  });

  it('ignores keys that are neither bound nor commands', () => {
    expect(readGameplayKey('KeyQ', BINDINGS)).toEqual({ lane: null, command: null });
  });

  it('keeps Enter as confirm even when it is bound to a lane', () => {
    const bindings: Settings['keyBindings'] = ['KeyD', 'KeyF', 'Enter', 'KeyK'];
    expect(readGameplayKey('Enter', bindings)).toEqual({ lane: 2, command: 'confirm' });
  });

  it('drops the MV mode command when Tab is bound to a lane', () => {
    const bindings: Settings['keyBindings'] = ['Tab', 'KeyF', 'KeyJ', 'KeyK'];
    expect(readGameplayKey('Tab', bindings)).toEqual({ lane: 0, command: null });
  });

  it('matches key codes case-sensitively', () => {
    expect(readGameplayKey('keyd', BINDINGS)).toEqual({ lane: null, command: null });
  });
});
