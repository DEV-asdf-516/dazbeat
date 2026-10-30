import { findChart, getAvailableDifficulties, stepChart } from '../../data/songs.js';
import type { ChartRef } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { requireDefined } from '../../invariant.js';
import { getDifficultyAppearance } from '../difficultyAppearance.js';
import type { TabAppearance } from '../ui/TextTabs.js';

export interface ResultState {
  readonly retryChart: ChartRef;
  readonly hoveredDifficulty: Difficulty | null;
}

export function createResultState(retryChart: ChartRef): ResultState {
  return {
    retryChart,
    hoveredDifficulty: null,
  };
}

export function selectRetryDifficulty(state: ResultState, difficulty: Difficulty): ResultState {
  const { retryChart } = state;
  if (difficulty === retryChart.difficulty) {
    return state;
  }
  return {
    ...state,
    retryChart: requireDefined(
      findChart(retryChart.song, retryChart.laneCount, difficulty),
      'Missing chart for difficulty tab',
      difficulty,
    ),
  };
}

export function stepRetryChart(state: ResultState, delta: 1 | -1): ResultState {
  const retryChart = stepChart(state.retryChart, delta);
  return retryChart === state.retryChart
    ? state
    : {
        ...state,
        retryChart,
      };
}

export function hoverDifficulty(state: ResultState, difficulty: Difficulty): ResultState {
  return state.hoveredDifficulty === difficulty
    ? state
    : {
        ...state,
        hoveredDifficulty: difficulty,
      };
}

export function unhoverDifficulty(state: ResultState, difficulty: Difficulty): ResultState {
  return state.hoveredDifficulty === difficulty
    ? {
        ...state,
        hoveredDifficulty: null,
      }
    : state;
}

export function getRetryTabAppearance(state: ResultState, difficulty: Difficulty): TabAppearance {
  const { retryChart, hoveredDifficulty } = state;
  return getDifficultyAppearance(difficulty, {
    selected: retryChart.difficulty,
    hovered: hoveredDifficulty,
    available: getAvailableDifficulties(retryChart.song, retryChart.laneCount),
  });
}
