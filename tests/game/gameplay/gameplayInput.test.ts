import { describe, expect, it } from 'vitest';
import { getGameplayKeyAction, readGameplayKey } from '../../../src/game/gameplay/gameplayInput.js';
import type { GameplayKey, GameplayKeyContext } from '../../../src/game/gameplay/gameplayInput.js';
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

const CONFIRM: GameplayKey = { lane: null, command: 'confirm' };
const BACK: GameplayKey = { lane: null, command: 'back' };
const MV_MODE: GameplayKey = { lane: null, command: 'mvMode' };
const LANE_1: GameplayKey = { lane: 1, command: null };

function playing(
  isQuitConfirmOpen: boolean,
  playerState: 'playing' | 'buffering' | 'paused' = 'playing',
): GameplayKeyContext {
  return { phase: 'playing', isQuitConfirmOpen, playerState };
}

describe('getGameplayKeyAction', () => {
  it.each(['loading', 'starting'] as const)('handles keys while %s', (phase) => {
    const context: GameplayKeyContext = { phase };
    expect(getGameplayKeyAction(context, BACK, false)).toEqual({ kind: 'leave' });
    expect(getGameplayKeyAction(context, MV_MODE, false)).toEqual({ kind: 'cycleMvMode' });
    expect(getGameplayKeyAction(context, CONFIRM, false)).toEqual({ kind: 'none' });
    expect(getGameplayKeyAction(context, LANE_1, false)).toEqual({ kind: 'none' });
  });

  it('starts, leaves or cycles the MV mode when ready', () => {
    const context: GameplayKeyContext = { phase: 'ready' };
    expect(getGameplayKeyAction(context, CONFIRM, false)).toEqual({ kind: 'start' });
    expect(getGameplayKeyAction(context, BACK, false)).toEqual({ kind: 'leave' });
    expect(getGameplayKeyAction(context, MV_MODE, false)).toEqual({ kind: 'cycleMvMode' });
    expect(getGameplayKeyAction(context, LANE_1, false)).toEqual({ kind: 'none' });
  });

  it('leaves on confirm or back after an error', () => {
    const context: GameplayKeyContext = { phase: 'error' };
    expect(getGameplayKeyAction(context, CONFIRM, false)).toEqual({ kind: 'leave' });
    expect(getGameplayKeyAction(context, BACK, false)).toEqual({ kind: 'leave' });
    expect(getGameplayKeyAction(context, MV_MODE, false)).toEqual({ kind: 'none' });
  });

  it.each([BACK, CONFIRM, LANE_1])('ignores %o while ending', (key) => {
    expect(getGameplayKeyAction({ phase: 'ending' }, key, false)).toEqual({ kind: 'none' });
  });

  it('accepts a repeated back outside play like a fresh press', () => {
    expect(getGameplayKeyAction({ phase: 'loading' }, BACK, true)).toEqual({ kind: 'leave' });
  });

  it.each([CONFIRM, MV_MODE, LANE_1])('ignores repeated %o outside play', (key) => {
    expect(getGameplayKeyAction({ phase: 'ready' }, key, true)).toEqual({ kind: 'none' });
  });

  it.each([BACK, LANE_1])('ignores repeated %o during play', (key) => {
    expect(getGameplayKeyAction(playing(false), key, true)).toEqual({ kind: 'none' });
  });

  describe('during play with the quit confirm closed', () => {
    it('opens the quit confirm on back', () => {
      expect(getGameplayKeyAction(playing(false), BACK, false)).toEqual({
        kind: 'openQuitConfirm',
      });
    });

    it('presses the lane while the video plays', () => {
      expect(getGameplayKeyAction(playing(false), LANE_1, false)).toEqual({
        kind: 'pressLane',
        lane: 1,
      });
    });

    it.each(['buffering', 'paused'] as const)('ignores lane keys while %s', (playerState) => {
      expect(getGameplayKeyAction(playing(false, playerState), LANE_1, false)).toEqual({
        kind: 'none',
      });
    });

    it('resumes on confirm only while paused', () => {
      expect(getGameplayKeyAction(playing(false, 'paused'), CONFIRM, false)).toEqual({
        kind: 'resume',
      });
      expect(getGameplayKeyAction(playing(false), CONFIRM, false)).toEqual({ kind: 'none' });
    });

    it('cycles the MV mode', () => {
      expect(getGameplayKeyAction(playing(false), MV_MODE, false)).toEqual({
        kind: 'cycleMvMode',
      });
    });
  });

  describe('during play with the quit confirm open', () => {
    it('leaves on confirm and closes the confirm on back', () => {
      expect(getGameplayKeyAction(playing(true), CONFIRM, false)).toEqual({ kind: 'leave' });
      expect(getGameplayKeyAction(playing(true), BACK, false)).toEqual({
        kind: 'closeQuitConfirm',
      });
    });

    it.each([LANE_1, MV_MODE])('ignores %o', (key) => {
      expect(getGameplayKeyAction(playing(true), key, false)).toEqual({ kind: 'none' });
    });
  });

  describe('Enter bound to a lane', () => {
    const enterLane: GameplayKey = { lane: 2, command: 'confirm' };

    it('presses the lane while the video plays', () => {
      expect(getGameplayKeyAction(playing(false), enterLane, false)).toEqual({
        kind: 'pressLane',
        lane: 2,
      });
    });

    it('resumes while paused', () => {
      expect(getGameplayKeyAction(playing(false, 'paused'), enterLane, false)).toEqual({
        kind: 'resume',
      });
    });
  });
});
