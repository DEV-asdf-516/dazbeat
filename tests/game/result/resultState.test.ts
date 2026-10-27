import { describe, expect, it } from 'vitest';
import type { ChartRef, Song } from '../../../src/data/songs.js';
import {
  createResultState,
  getRetryTabAppearance,
  hoverDifficulty,
  selectRetryDifficulty,
  stepRetryChart,
  unhoverDifficulty,
} from '../../../src/game/result/resultState.js';

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
    expect(unhoverDifficulty(hovered, 'hard').hoveredDifficulty).toBeNull();
  });
});
