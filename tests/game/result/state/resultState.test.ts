import { describe, expect, it } from 'vitest';
import type { ChartRef, Song } from '../../../../src/data/songs.js';
import type {
  AchievementId,
  NamedAchievementDefinition,
} from '../../../../src/data/achievements.js';
import {
  createResultState,
  dismissToast,
  getChangedRegions,
  getRetryTabAppearance,
  getToastChanges,
  hoverDifficulty,
  hoverResultButton,
  hoverToastClose,
  moveResultFocus,
  pressResultButton,
  queueAchievements,
  removeToast,
  selectRetryDifficulty,
  stepRetryChart,
  unhoverDifficulty,
} from '../../../../src/game/result/state/resultState.js';

const SONG: Song = {
  id: 'easy-hard',
  title: 'easy-hard',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/easy-hard/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 0,
  gameEndMs: 30000,
  chartIds: {
    4: {
      easy: 'easy.json',
      hard: 'hard.json',
      expert: 'expert.json',
    },
  },
};

function chartOf(difficulty: ChartRef['difficulty'], chartId: string): ChartRef {
  return {
    song: SONG,
    laneCount: 4,
    difficulty,
    chartId,
  };
}

describe('selectRetryDifficulty', () => {
  it('keeps the same state for the selected difficulty', () => {
    const state = createResultState(chartOf('easy', 'easy.json'));

    expect(selectRetryDifficulty(state, 'easy')).toBe(state);
  });

  it('keeps the same state for a difficulty without a chart', () => {
    const state = createResultState(chartOf('easy', 'easy.json'));

    expect(selectRetryDifficulty(state, 'normal')).toBe(state);
  });

  it('switches to the chart of another difficulty', () => {
    const state = createResultState(chartOf('easy', 'easy.json'));

    expect(selectRetryDifficulty(state, 'hard').retryChart).toEqual(chartOf('hard', 'hard.json'));
  });
});

describe('stepRetryChart', () => {
  it('moves to the next and previous difficulty with a chart', () => {
    const state = createResultState(chartOf('easy', 'easy.json'));
    const next = stepRetryChart(state, 1);

    expect(next.retryChart).toEqual(chartOf('hard', 'hard.json'));
    expect(stepRetryChart(next, -1).retryChart).toEqual(chartOf('easy', 'easy.json'));
  });

  it('keeps the same state at either end', () => {
    const first = createResultState(chartOf('easy', 'easy.json'));
    const last = createResultState(chartOf('expert', 'expert.json'));

    expect(stepRetryChart(first, -1)).toBe(first);
    expect(stepRetryChart(last, 1)).toBe(last);
  });
});

describe('getRetryTabAppearance', () => {
  it('reads selection, chart availability and hover', () => {
    const state = createResultState(chartOf('easy', 'easy.json'));

    expect(getRetryTabAppearance(state, 'easy')).toBe('selected');
    expect(getRetryTabAppearance(state, 'normal')).toBe('disabled');
    expect(getRetryTabAppearance(hoverDifficulty(state, 'normal'), 'normal')).toBe('disabled');
    expect(getRetryTabAppearance(hoverDifficulty(state, 'hard'), 'hard')).toBe('emphasized');
    expect(getRetryTabAppearance(state, 'hard')).toBe('normal');
  });
});

describe('hover', () => {
  it('keeps the same state when hovering the hovered difficulty again', () => {
    const hovered = hoverDifficulty(createResultState(chartOf('easy', 'easy.json')), 'hard');

    expect(hoverDifficulty(hovered, 'hard')).toBe(hovered);
  });

  it('clears hover only for the hovered difficulty', () => {
    const hovered = hoverDifficulty(createResultState(chartOf('easy', 'easy.json')), 'hard');

    expect(unhoverDifficulty(hovered, 'expert')).toBe(hovered);
    expect(unhoverDifficulty(hovered, 'hard').hover).toBeNull();
  });
});

function achievementOf(id: AchievementId): NamedAchievementDefinition {
  return {
    id,
    set: 'rhythm',
    category: 'play',
    rule: {
      kind: 'plays',
      target: 1,
    },
    isRetired: false,
    names: {
      ko: id,
      ja: id,
      en: id,
    },
  };
}
const FIRST_FINISH = achievementOf('FIRST_FINISH');
const FIRST_CLEAR = achievementOf('FIRST_CLEAR');

describe('getChangedRegions', () => {
  const state = createResultState(chartOf('easy', 'easy.json'));

  it('redraws only the controls when only the controls open', () => {
    expect(
      getChangedRegions(state, {
        ...state,
        isControlsOpen: true,
      }),
    ).toEqual(['controls', 'controlsClose']);
  });

  it('redraws every button and plays the focus motion for the first render', () => {
    expect(getChangedRegions(null, state)).toEqual([
      'tabs',
      'retryButton',
      'songSelectButton',
      'toasts',
      'toastClose',
      'controls',
      'controlsEntry',
      'controlsClose',
      'menuFocusMotion',
    ]);
  });

  it('redraws only the tabs for a difficulty hover', () => {
    expect(getChangedRegions(state, hoverDifficulty(state, 'hard'))).toEqual(['tabs']);
  });

  it('redraws the focused buttons and plays the focus motion when the focus moves', () => {
    expect(getChangedRegions(state, moveResultFocus(state, 1))).toEqual([
      'retryButton',
      'songSelectButton',
      'menuFocusMotion',
    ]);
  });

  it('redraws only the hovered button when the button hover changes', () => {
    const hovered = hoverResultButton(state, 'retry');

    expect(getChangedRegions(state, hovered)).toEqual(['retryButton']);
    expect(getChangedRegions(hovered, pressResultButton(hovered, 'retry'))).toEqual([
      'retryButton',
    ]);
    expect(getChangedRegions(hovered, hoverResultButton(hovered, 'songSelect'))).toEqual([
      'retryButton',
      'songSelectButton',
    ]);
  });

  it('redraws the toasts when the queue changes', () => {
    expect(getChangedRegions(state, queueAchievements(state, [FIRST_FINISH]))).toEqual([
      'toasts',
      'toastClose',
    ]);
  });
});

describe('getToastChanges', () => {
  const state = createResultState(chartOf('easy', 'easy.json'));

  it('reports entered toasts and moved older toasts', () => {
    const one = queueAchievements(state, [FIRST_FINISH]);
    const two = queueAchievements(one, [FIRST_CLEAR]);

    expect(getToastChanges(state, one)).toEqual({
      entered: one.toasts.shown,
      moved: [],
      leaving: [],
    });
    expect(getToastChanges(one, two)).toEqual({
      entered: [two.toasts.shown[1]],
      moved: [two.toasts.shown[0]],
      leaving: [],
    });
  });

  it('reports leaving toasts once', () => {
    const shown = queueAchievements(state, [FIRST_FINISH]);
    const leaving = dismissToast(shown, 0);

    expect(getToastChanges(shown, leaving)).toEqual({
      entered: [],
      moved: [],
      leaving: [0],
    });
    expect(dismissToast(leaving, 0)).toBe(leaving);
  });

  it('releases the close hover of a removed toast', () => {
    const hovered = hoverToastClose(queueAchievements(state, [FIRST_FINISH]), 0);

    expect(removeToast(dismissToast(hovered, 0), 0).hover).toBeNull();
  });
});
