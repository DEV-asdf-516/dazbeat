import { getAvailableDifficulties } from '../../data/songs.js';
import type { Song } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { stepItem } from '../range.js';

/** 다시 플레이할 난이도를 채보가 있는 난이도 안에서 옮긴다. 끝에서는 그대로다. */
export function stepRetryDifficulty(song: Song, current: Difficulty, delta: 1 | -1): Difficulty {
  return stepItem(getAvailableDifficulties(song), current, delta);
}
