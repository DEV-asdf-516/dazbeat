import { describe, expect, it } from 'vitest';
import {
  getErrorKeyAction,
  getLoadingKeyAction,
  getPlayingKeyAction,
  getReadyKeyAction,
  readGameplayKey,
} from '../../../src/game/gameplay/gameplayInput.js';
import type { GameplayKey } from '../../../src/game/gameplay/gameplayInput.js';
import type { Settings } from '../../../src/storage/settings.js';

const BINDINGS: Settings['keyBindings'] = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];

describe('readGameplayKey', () => {
  it.each([
    ['KeyD', 0],
    ['KeyF', 1],
    ['KeyJ', 2],
    ['KeyK', 3],
  ] as const)('maps bound key %s to lane %i without a command', (code, lane) => {
    expect(readGameplayKey(code, BINDINGS)).toEqual({
      lane,
      command: null,
    });
  });

  it.each([
    ['Enter', 'confirm'],
    ['Escape', 'back'],
    ['Tab', 'mvMode'],
  ] as const)('maps unbound %s to the %s command', (code, command) => {
    expect(readGameplayKey(code, BINDINGS)).toEqual({
      lane: null,
      command,
    });
  });

  it('ignores keys that are neither bound nor commands', () => {
    expect(readGameplayKey('KeyQ', BINDINGS)).toEqual({
      lane: null,
      command: null,
    });
  });

  it('keeps Enter as confirm even when it is bound to a lane', () => {
    const bindings: Settings['keyBindings'] = ['KeyD', 'KeyF', 'Enter', 'KeyK'];
    expect(readGameplayKey('Enter', bindings)).toEqual({
      lane: 2,
      command: 'confirm',
    });
  });

  it('drops the MV mode command when Tab is bound to a lane', () => {
    const bindings: Settings['keyBindings'] = ['Tab', 'KeyF', 'KeyJ', 'KeyK'];
    expect(readGameplayKey('Tab', bindings)).toEqual({
      lane: 0,
      command: null,
    });
  });

  it('matches key codes case-sensitively', () => {
    expect(readGameplayKey('keyd', BINDINGS)).toEqual({
      lane: null,
      command: null,
    });
  });
});

const CONFIRM: GameplayKey = {
  lane: null,
  command: 'confirm',
};
const BACK: GameplayKey = {
  lane: null,
  command: 'back',
};
const MV_MODE: GameplayKey = {
  lane: null,
  command: 'mvMode',
};
const LANE_1: GameplayKey = {
  lane: 1,
  command: null,
};

describe('getLoadingKeyAction', () => {
  it('leaves on back and cycles the MV mode, ignoring confirm and lanes', () => {
    expect(getLoadingKeyAction(BACK, false)).toEqual({ kind: 'leave' });
    expect(getLoadingKeyAction(MV_MODE, false)).toEqual({ kind: 'cycleMvMode' });
    expect(getLoadingKeyAction(CONFIRM, false)).toEqual({ kind: 'none' });
    expect(getLoadingKeyAction(LANE_1, false)).toEqual({ kind: 'none' });
  });

  it('accepts a repeated back like a fresh press', () => {
    expect(getLoadingKeyAction(BACK, true)).toEqual({ kind: 'leave' });
  });

  it.each([CONFIRM, MV_MODE, LANE_1])('ignores repeated %o', (key) => {
    expect(getLoadingKeyAction(key, true)).toEqual({ kind: 'none' });
  });
});

describe('getReadyKeyAction', () => {
  it('starts, leaves or cycles the MV mode', () => {
    expect(getReadyKeyAction(CONFIRM, false)).toEqual({ kind: 'start' });
    expect(getReadyKeyAction(BACK, false)).toEqual({ kind: 'leave' });
    expect(getReadyKeyAction(MV_MODE, false)).toEqual({ kind: 'cycleMvMode' });
    expect(getReadyKeyAction(LANE_1, false)).toEqual({ kind: 'none' });
  });

  it('accepts a repeated back like a fresh press', () => {
    expect(getReadyKeyAction(BACK, true)).toEqual({ kind: 'leave' });
  });

  it.each([CONFIRM, MV_MODE, LANE_1])('ignores repeated %o', (key) => {
    expect(getReadyKeyAction(key, true)).toEqual({ kind: 'none' });
  });
});

describe('getErrorKeyAction', () => {
  it('leaves on confirm or back', () => {
    expect(getErrorKeyAction(CONFIRM, false)).toEqual({ kind: 'leave' });
    expect(getErrorKeyAction(BACK, false)).toEqual({ kind: 'leave' });
    expect(getErrorKeyAction(MV_MODE, false)).toEqual({ kind: 'none' });
    expect(getErrorKeyAction(LANE_1, false)).toEqual({ kind: 'none' });
  });

  it('accepts only a repeated back', () => {
    expect(getErrorKeyAction(BACK, true)).toEqual({ kind: 'leave' });
    expect(getErrorKeyAction(CONFIRM, true)).toEqual({ kind: 'none' });
  });
});

describe('getPlayingKeyAction', () => {
  const playing = (
    isQuitConfirmOpen: boolean,
    key: GameplayKey,
    playerState: 'playing' | 'buffering' | 'paused' = 'playing',
    isRepeat = false,
  ) => getPlayingKeyAction(isQuitConfirmOpen, playerState, key, isRepeat);

  it.each([BACK, LANE_1])('ignores repeated %o', (key) => {
    expect(playing(false, key, 'playing', true)).toEqual({ kind: 'none' });
  });

  describe('with the quit confirm closed', () => {
    it('opens the quit confirm on back', () => {
      expect(playing(false, BACK)).toEqual({
        kind: 'openQuitConfirm',
      });
    });

    it('presses the lane while the video plays', () => {
      expect(playing(false, LANE_1)).toEqual({
        kind: 'pressLane',
        lane: 1,
      });
    });

    it.each(['buffering', 'paused'] as const)('ignores lane keys while %s', (playerState) => {
      expect(playing(false, LANE_1, playerState)).toEqual({
        kind: 'none',
      });
    });

    it('resumes on confirm only while paused', () => {
      expect(playing(false, CONFIRM, 'paused')).toEqual({
        kind: 'resume',
      });
      expect(playing(false, CONFIRM)).toEqual({ kind: 'none' });
    });

    it('cycles the MV mode', () => {
      expect(playing(false, MV_MODE)).toEqual({
        kind: 'cycleMvMode',
      });
    });
  });

  describe('with the quit confirm open', () => {
    it('leaves on confirm and closes the confirm on back', () => {
      expect(playing(true, CONFIRM)).toEqual({ kind: 'leave' });
      expect(playing(true, BACK)).toEqual({
        kind: 'closeQuitConfirm',
      });
    });

    it.each([LANE_1, MV_MODE])('ignores %o', (key) => {
      expect(playing(true, key)).toEqual({ kind: 'none' });
    });
  });

  describe('Enter bound to a lane', () => {
    const enterLane: GameplayKey = {
      lane: 2,
      command: 'confirm',
    };

    it('presses the lane while the video plays', () => {
      expect(playing(false, enterLane)).toEqual({
        kind: 'pressLane',
        lane: 2,
      });
    });

    it('resumes while paused', () => {
      expect(playing(false, enterLane, 'paused')).toEqual({
        kind: 'resume',
      });
    });
  });
});
