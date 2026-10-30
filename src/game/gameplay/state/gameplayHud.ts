import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import type { Note } from '../../../rhythm/types.js';
import { getComboTier } from './comboTier.js';
import type { GameplayFrame } from '../GameplayController.js';
import { getStarlightBand, isStarlightDrop } from './starlightBand.js';

export type HudRegion =
  | 'combo'
  | 'comboTier'
  | 'score'
  | 'progress'
  | 'gaugeFill'
  | 'gaugeBand'
  | 'perfectCount'
  | 'greatCount'
  | 'goodCount'
  | 'badCount'
  | 'missCount'
  | 'accuracy'
  | 'comboPop'
  | 'gaugeGlint';

type HudReader = StateReader<GameplayFrame>;

const readCombo: HudReader = (frame) => frame.state.combo;
const readComboTier: HudReader = (frame) => getComboTier(frame.state.combo);
const readScore: HudReader = (frame) => frame.state.score;
const readProgress: HudReader = (frame) => frame.progress;
const readHp: HudReader = (frame) => frame.state.hp;
const readBand: HudReader = (frame) => getStarlightBand(frame.state.hp);
const readPerfect: HudReader = (frame) => frame.state.counts.perfect;
const readGreat: HudReader = (frame) => frame.state.counts.great;
const readGood: HudReader = (frame) => frame.state.counts.good;
const readBad: HudReader = (frame) => frame.state.counts.bad;
const readMiss: HudReader = (frame) => frame.state.counts.miss;

const REGION_SOURCES: Readonly<
  Record<Exclude<HudRegion, 'comboPop' | 'gaugeGlint'>, readonly HudReader[]>
> = {
  combo: [readCombo],
  comboTier: [readComboTier],
  score: [readScore],
  progress: [readProgress],
  gaugeFill: [readHp],
  gaugeBand: [readBand],
  perfectCount: [readPerfect],
  greatCount: [readGreat],
  goodCount: [readGood],
  badCount: [readBad],
  missCount: [readMiss],
  accuracy: [readPerfect, readGreat, readGood, readBad, readMiss],
};

export function getChangedHudRegions(
  previous: GameplayFrame | null,
  next: GameplayFrame,
): readonly HudRegion[] {
  const regions: HudRegion[] = [...filterChangedRegions(REGION_SOURCES, previous, next)];
  if (previous === null) {
    return regions;
  }
  // 콤보는 끊기면 0 으로만 돌아가므로 0 이 아닌 단계 변화는 올라간 것이다.
  if (
    getComboTier(previous.state.combo) !== getComboTier(next.state.combo) &&
    next.state.combo > 0
  ) {
    regions.push('comboPop');
  }
  if (isStarlightDrop(getStarlightBand(previous.state.hp), getStarlightBand(next.state.hp))) {
    regions.push('gaugeGlint');
  }
  return regions;
}

export function getEnteredNoteRange(
  previous: GameplayFrame | null,
  next: GameplayFrame,
): { readonly fromIndex: number; readonly toIndex: number } {
  return {
    fromIndex: previous?.enteredNoteCount ?? 0,
    toIndex: next.enteredNoteCount,
  };
}

export function advanceEnteredNotes(
  notes: readonly Note[],
  enteredCount: number,
  songTimeMs: number,
  hasEntered: (noteTimeMs: number, songTimeMs: number) => boolean,
): number {
  let count = enteredCount;
  let note = notes[count];
  while (note !== undefined && hasEntered(note.timeMs, songTimeMs)) {
    count += 1;
    note = notes[count];
  }
  return count;
}
