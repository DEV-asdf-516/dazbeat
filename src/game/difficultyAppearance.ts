import { DIFFICULTIES } from '../data/songs.js';
import type { Difficulty } from '../rhythm/types.js';
import type { TabAppearance, TextTabItem } from './ui/TextTabs.js';

export const DIFFICULTY_TAB_ITEMS: readonly TextTabItem<Difficulty>[] = DIFFICULTIES.map(
  (difficulty) => ({
    key: difficulty,
    label: difficulty.toUpperCase(),
  }),
);

export interface DifficultyChoice {
  readonly selected: Difficulty | null;
  readonly hovered: Difficulty | null;
  readonly available: readonly Difficulty[];
}

/** 고른 난이도는 채보가 있는 난이도에서만 고르므로 채보 유무보다 먼저 본다. */
export function getDifficultyAppearance(
  difficulty: Difficulty,
  { selected, hovered, available }: DifficultyChoice,
): TabAppearance {
  if (difficulty === selected) {
    return 'selected';
  }
  if (!available.includes(difficulty)) {
    return 'disabled';
  }
  return difficulty === hovered ? 'emphasized' : 'normal';
}
