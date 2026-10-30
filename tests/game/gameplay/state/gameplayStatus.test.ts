import { describe, expect, it } from 'vitest';
import {
  INITIAL_GAMEPLAY_BUTTONS,
  getChangedButtonRegions,
  getChangedStatusRegions,
  getLoadErrorText,
  hoverGameplayButton,
  pressGameplayButton,
  withQuitConfirmOpen,
} from '../../../../src/game/gameplay/state/gameplayStatus.js';

describe('getChangedStatusRegions', () => {
  it('paints the notice and the countdown on the first loading status', () => {
    expect(getChangedStatusRegions(null, { kind: 'loading' })).toEqual(['notice', 'countdown']);
  });

  it('pops the countdown when the digit changes', () => {
    expect(
      getChangedStatusRegions(
        {
          kind: 'countdown',
          digit: 3,
        },
        {
          kind: 'countdown',
          digit: 2,
        },
      ),
    ).toEqual(['countdown', 'countdownPop']);
  });

  it('paints every region when the countdown ends', () => {
    expect(
      getChangedStatusRegions(
        {
          kind: 'countdown',
          digit: 1,
        },
        { kind: 'none' },
      ),
    ).toEqual(['notice', 'countdown', 'countdownPop']);
  });

  it('paints nothing for the same status again', () => {
    expect(getChangedStatusRegions({ kind: 'awaitingStart' }, { kind: 'awaitingStart' })).toEqual(
      [],
    );
  });
});

describe('getLoadErrorText', () => {
  it('has a hint only for a video that does not allow embedding', () => {
    expect(
      getLoadErrorText({
        kind: 'videoError',
        errorKind: 'embeddingNotAllowed',
        code: 101,
      }),
    ).toEqual({
      message: {
        kind: 'videoError',
        errorKind: 'embeddingNotAllowed',
        code: 101,
      },
      hasHint: true,
    });
    expect(
      getLoadErrorText({
        kind: 'videoError',
        errorKind: 'videoNotFound',
        code: 100,
      }).hasHint,
    ).toBe(false);
    expect(getLoadErrorText({ kind: 'chartLoadFailed' })).toEqual({
      message: {
        kind: 'key',
        key: 'gameplay.chartLoadFailed',
      },
      hasHint: false,
    });
  });
});

describe('getChangedButtonRegions', () => {
  it('paints every button on the first render', () => {
    expect(getChangedButtonRegions(null, INITIAL_GAMEPLAY_BUTTONS)).toEqual([
      'backButton',
      'quitConfirmButtons',
    ]);
  });

  it('paints only the hovered button when only the hover changes', () => {
    const hovered = hoverGameplayButton(INITIAL_GAMEPLAY_BUTTONS, 'back');

    expect(getChangedButtonRegions(INITIAL_GAMEPLAY_BUTTONS, hovered)).toEqual(['backButton']);
    expect(getChangedButtonRegions(hovered, pressGameplayButton(hovered, 'back'))).toEqual([
      'backButton',
    ]);
  });

  it('paints only the confirm buttons when the quit confirm opens', () => {
    expect(
      getChangedButtonRegions(
        INITIAL_GAMEPLAY_BUTTONS,
        withQuitConfirmOpen(INITIAL_GAMEPLAY_BUTTONS, true),
      ),
    ).toEqual(['quitConfirmButtons']);
  });
});
