export type Lane = 0 | 1 | 2 | 3;
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type NoteType = 'tap' | 'hold';

export interface TapNote {
  type: 'tap';
  timeMs: number;
  lane: Lane;
}

export interface HoldNote {
  type: 'hold';
  timeMs: number;
  endTimeMs: number;
  lane: Lane;
}

export type Note = TapNote | HoldNote;

export interface Chart {
  songId: string;
  difficulty: Difficulty;
  offsetMs: number;
  notes: readonly Note[];
}

export type Judgment = 'perfect' | 'great' | 'good' | 'bad' | 'miss';

export interface JudgmentWindows {
  perfectMs: number;
  greatMs: number;
  goodMs: number;
  badMs: number;
}

export type JudgmentCounts = Record<Judgment, number>;

export interface GameplayState {
  score: number;
  combo: number;
  maxCombo: number;
  counts: JudgmentCounts;
  hp: number;
}

interface GameplayResultBase {
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: JudgmentCounts;
}

export interface FinishedGameplayResult extends GameplayResultBase {
  outcome: 'finished';
  cleared: boolean;
}

export interface FailedGameplayResult extends GameplayResultBase {
  outcome: 'failed';
  cleared: false;
}

export type GameplayResult = FinishedGameplayResult | FailedGameplayResult;

export type NoteStatus = 'pending' | 'holding' | 'hit' | 'missed';

export interface JudgmentEvent {
  noteIndex: number;
  lane: Lane;
  kind: 'tap' | 'holdStart' | 'holdEnd';
  judgment: Judgment;
}

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';
