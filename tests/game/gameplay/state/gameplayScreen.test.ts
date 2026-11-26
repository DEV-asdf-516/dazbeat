import { describe, expect, it } from 'vitest';
import {
  getChangedGameplayRegions,
  getInitialGameplayScreen,
  openQuitConfirm,
  withButtons,
  withFrame,
  withLoadError,
  withMvMode,
  withReady,
  withStarting,
} from '../../../../src/game/gameplay/state/gameplayScreen.js';
import type { GameplayScreenState } from '../../../../src/game/gameplay/state/gameplayScreen.js';
import {
  hoverGameplayButton,
  pressGameplayButton,
} from '../../../../src/game/gameplay/state/gameplayStatus.js';
import type { GameplayStatus } from '../../../../src/game/gameplay/state/gameplayStatus.js';
import { GameplaySession } from '../../../../src/rhythm/GameplaySession.js';
import { JUDGMENT_WINDOWS } from '../../../../src/rhythm/judgment.js';
import type { Chart, GameplayState } from '../../../../src/rhythm/types.js';

const INITIAL = getInitialGameplayScreen('dim');

function withStatus(status: GameplayStatus): GameplayScreenState {
  return {
    ...INITIAL,
    status,
  };
}

const CHART: Chart = {
  songId: 'song',
  difficulty: 'normal',
  laneCount: 4,
  offsetMs: 0,
  notes: [
    {
      type: 'tap',
      timeMs: 1000,
      lane: 0,
    },
  ],
};
const SESSION = new GameplaySession(CHART, JUDGMENT_WINDOWS, { canFail: true });
const RUNNING = withReady(withStarting(INITIAL), { kind: 'running' });
const GAME_STATE: GameplayState = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: {
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
  },
  hp: 100,
};

const ACTIVATION = {
  level: 0,
  hasReachedFull: false,
};

function framed(state: Partial<GameplayState> = {}, progress = 0): GameplayScreenState {
  return withFrame(
    RUNNING,
    { kind: 'none' },
    'playing',
    SESSION,
    0,
    {
      ...GAME_STATE,
      ...state,
    },
    progress,
    ACTIVATION,
    0,
    true,
  );
}

describe('getChangedGameplayRegions', () => {
  it('paints every region but the effects on the first loading screen', () => {
    expect(getChangedGameplayRegions(null, INITIAL)).toEqual([
      'notice',
      'countdown',
      'backButton',
      'quitDialog',
      'mvVisible',
      'loadError',
      'frame',
      'combo',
      'comboTier',
      'score',
      'progress',
      'gaugeFill',
      'gaugeBand',
      'perfectCount',
      'greatCount',
      'goodCount',
      'badCount',
      'missCount',
      'accuracy',
    ]);
  });

  it('pops the countdown when the digit changes', () => {
    expect(
      getChangedGameplayRegions(
        withStatus({
          kind: 'countdown',
          digit: 3,
        }),
        withStatus({
          kind: 'countdown',
          digit: 2,
        }),
      ),
    ).toEqual(['countdown', 'countdownPop']);
  });

  it('paints every status region when the countdown ends', () => {
    expect(
      getChangedGameplayRegions(
        withStatus({
          kind: 'countdown',
          digit: 1,
        }),
        withStatus({ kind: 'none' }),
      ),
    ).toEqual(['notice', 'countdown', 'countdownPop']);
  });

  it('paints nothing for the same status again', () => {
    expect(
      getChangedGameplayRegions(withStatus({ kind: 'paused' }), withStatus({ kind: 'paused' })),
    ).toEqual([]);
  });

  it('paints only the hovered button when only the hover changes', () => {
    const hovered = withButtons(INITIAL, hoverGameplayButton(INITIAL.buttons, 'back'));

    expect(getChangedGameplayRegions(INITIAL, hovered)).toEqual(['backButton']);
    expect(
      getChangedGameplayRegions(
        hovered,
        withButtons(hovered, pressGameplayButton(hovered.buttons, 'back')),
      ),
    ).toEqual(['backButton']);
  });

  it('hides the status regions behind the quit confirm', () => {
    expect(getChangedGameplayRegions(INITIAL, openQuitConfirm(INITIAL, 'userPaused'))).toEqual([
      'notice',
      'countdown',
      'quitDialog',
    ]);
  });

  it('shows the MV mode only when it changes', () => {
    expect(getChangedGameplayRegions(INITIAL, withMvMode(INITIAL, 'blur'))).toEqual(['mvMode']);
  });

  it('paints the HUD regions when the first frame arrives', () => {
    expect(getChangedGameplayRegions(RUNNING, framed())).toEqual([
      'frame',
      'combo',
      'comboTier',
      'score',
      'progress',
      'gaugeFill',
      'gaugeBand',
      'perfectCount',
      'greatCount',
      'goodCount',
      'badCount',
      'missCount',
      'accuracy',
    ]);
  });

  it('paints only the combo when it grows within a tier', () => {
    expect(getChangedGameplayRegions(framed({ combo: 10 }), framed({ combo: 11 }))).toEqual([
      'combo',
    ]);
  });

  it('pops the combo when the tier rises', () => {
    expect(getChangedGameplayRegions(framed({ combo: 49 }), framed({ combo: 50 }))).toEqual([
      'combo',
      'comboTier',
      'comboPop',
    ]);
  });

  it('does not pop when the combo breaks', () => {
    expect(getChangedGameplayRegions(framed({ combo: 60 }), framed({ combo: 0 }))).toEqual([
      'combo',
      'comboTier',
    ]);
  });

  it('paints only the fill when the HP drops within a band', () => {
    expect(getChangedGameplayRegions(framed({ hp: 90 }), framed({ hp: 80 }))).toEqual([
      'gaugeFill',
    ]);
  });

  it('glints when the band drops', () => {
    expect(getChangedGameplayRegions(framed({ hp: 70 }), framed({ hp: 60 }))).toEqual([
      'gaugeFill',
      'gaugeBand',
      'gaugeGlint',
    ]);
  });

  it('does not glint when the band rises', () => {
    expect(getChangedGameplayRegions(framed({ hp: 60 }), framed({ hp: 70 }))).toEqual([
      'gaugeFill',
      'gaugeBand',
    ]);
  });

  it('paints the count of the judgment that grew and the accuracy', () => {
    expect(
      getChangedGameplayRegions(
        framed(),
        framed({
          counts: {
            ...GAME_STATE.counts,
            good: 1,
          },
        }),
      ),
    ).toEqual(['goodCount', 'accuracy']);
  });

  it('paints only the progress when only the progress changes', () => {
    expect(getChangedGameplayRegions(framed(), framed({}, 0.5))).toEqual(['progress']);
  });

  it('paints the quit dialog once when a quit button is hovered', () => {
    const open = openQuitConfirm(INITIAL, 'userPaused');

    expect(
      getChangedGameplayRegions(
        open,
        withButtons(open, hoverGameplayButton(open.buttons, 'quitCancel')),
      ),
    ).toEqual(['quitDialog']);
  });

  it('hides the intro, shows the back button and plays its focus when a load error arrives', () => {
    expect(
      getChangedGameplayRegions(INITIAL, withLoadError(INITIAL, { kind: 'chartLoadFailed' })),
    ).toEqual(['notice', 'backButton', 'loadError', 'backButtonFocus', 'intro']);
  });

  it('glints when the activation reaches full on a new frame only', () => {
    const full = withFrame(
      RUNNING,
      { kind: 'none' },
      'playing',
      SESSION,
      0,
      GAME_STATE,
      0,
      {
        level: 1,
        hasReachedFull: true,
      },
      0,
      true,
    );

    expect(getChangedGameplayRegions(framed(), full)).toEqual(['frame', 'activationGlint']);
    expect(
      getChangedGameplayRegions(full, withButtons(full, hoverGameplayButton(full.buttons, 'back'))),
    ).toEqual(['backButton']);
  });
});
