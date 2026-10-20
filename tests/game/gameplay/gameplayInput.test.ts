import { describe, expect, it } from 'vitest';
import type { PlaybackStatus } from '../../../src/audio/LeadInPlayback.js';
import {
  addPressedLane,
  getErrorKeyAction,
  getLaneReleaseAction,
  getLoadingKeyAction,
  getPlayingKeyAction,
  getReadyKeyAction,
  readGameplayKey,
} from '../../../src/game/gameplay/gameplayInput.js';
import type { GameplayKey, PressedLanes } from '../../../src/game/gameplay/gameplayInput.js';
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
  const RUNNING: PlaybackStatus = { kind: 'running' };
  const PAUSED: PlaybackStatus = { kind: 'paused' };
  const ALL_STATUSES: readonly PlaybackStatus[] = [
    { kind: 'loading' },
    {
      kind: 'countdown',
      digit: 2,
    },
    { kind: 'waiting' },
    PAUSED,
    RUNNING,
  ];
  const playing = (
    isQuitConfirmOpen: boolean,
    key: GameplayKey,
    status: PlaybackStatus = RUNNING,
    isRepeat = false,
  ) => getPlayingKeyAction(isQuitConfirmOpen, status, key, isRepeat);

  it.each([BACK, LANE_1])('ignores repeated %o', (key) => {
    expect(playing(false, key, RUNNING, true)).toEqual({ kind: 'none' });
  });

  describe('with the quit confirm closed', () => {
    it.each(ALL_STATUSES)('opens the quit confirm on back while %o', (status) => {
      expect(playing(false, BACK, status)).toEqual({
        kind: 'openQuitConfirm',
      });
    });

    it('presses the lane while running', () => {
      expect(playing(false, LANE_1)).toEqual({
        kind: 'pressLane',
        lane: 1,
      });
    });

    it.each<PlaybackStatus>([
      {
        kind: 'countdown',
        digit: 3,
      },
      { kind: 'waiting' },
      { kind: 'loading' },
      PAUSED,
    ])('ignores lane keys while %o', (status) => {
      expect(playing(false, LANE_1, status)).toEqual({
        kind: 'none',
      });
    });

    it('resumes on confirm only while paused', () => {
      expect(playing(false, CONFIRM, PAUSED)).toEqual({
        kind: 'resume',
      });
      expect(playing(false, CONFIRM)).toEqual({ kind: 'none' });
      expect(
        playing(false, CONFIRM, {
          kind: 'countdown',
          digit: 1,
        }),
      ).toEqual({ kind: 'none' });
      expect(playing(false, CONFIRM, { kind: 'loading' })).toEqual({ kind: 'none' });
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

    it('presses the lane while running', () => {
      expect(playing(false, enterLane)).toEqual({
        kind: 'pressLane',
        lane: 2,
      });
    });

    it('resumes while paused', () => {
      expect(playing(false, enterLane, PAUSED)).toEqual({
        kind: 'resume',
      });
    });
  });
});

describe('pressed lanes', () => {
  const NO_LANES: PressedLanes = new Set();

  it('ignores a release of a lane never pressed into the session', () => {
    expect(getLaneReleaseAction(NO_LANES, 1)).toEqual({ kind: 'none' });
  });

  it('releases a pressed lane once and removes it from the set', () => {
    const pressed = addPressedLane(NO_LANES, 1);
    const action = getLaneReleaseAction(pressed, 1);
    if (action.kind !== 'release') {
      throw new Error('Expected a release');
    }
    expect(action.pressedLanes.has(1)).toBe(false);
    expect(pressed.has(1)).toBe(true);
    expect(getLaneReleaseAction(action.pressedLanes, 1)).toEqual({ kind: 'none' });
  });

  it('ignores a release of another lane', () => {
    expect(getLaneReleaseAction(addPressedLane(NO_LANES, 1), 2)).toEqual({ kind: 'none' });
  });

  it('keeps the same set when the lane is already pressed', () => {
    const pressed = addPressedLane(NO_LANES, 1);
    expect(addPressedLane(pressed, 1)).toBe(pressed);
  });
});
