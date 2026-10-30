import { getDistance } from '../range.js';
import { calculateAccuracy, isCleared } from './accuracy.js';
import { judgeHoldRelease, judgeTap } from './judgment.js';
import { getLanes } from './lanes.js';
import { getJudgmentScore, getNextCombo } from './score.js';
import { getNextHp, MAX_HP } from './starlight.js';
import type {
  Chart,
  GameplayProgress,
  GameplayState,
  HoldNote,
  InputEvent,
  InputKind,
  Judgment,
  JudgmentCounts,
  JudgmentEvent,
  JudgmentWindows,
  Lane,
  Note,
  NoteStatus,
} from './types.js';
import { requireDefined } from '../invariant.js';

interface LaneEntry<T extends Note = Note> {
  noteIndex: number;
  note: T;
}

interface LaneState {
  readonly entries: LaneEntry[];
  cursor: number;
  holding: LaneEntry<HoldNote> | null;
}

const PLAYING: GameplayProgress = { outcome: 'playing' };

interface UpdateCandidate {
  judgedAtMs: number;
  laneState: LaneState;
  entry: LaneEntry;
  kind: JudgmentEvent['kind'];
  judgment: Judgment;
}

function atLane<T>(values: readonly T[], lane: Lane): T {
  return requireDefined(values[lane], 'Lane out of range', lane);
}

export class GameplaySession {
  private readonly windows: JudgmentWindows;
  private readonly canFail: boolean;
  private readonly statuses: NoteStatus[];
  private readonly laneStates: readonly LaneState[];
  private unjudgedCount: number;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private readonly counts: JudgmentCounts = {
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
  };
  private hp = MAX_HP;
  private hasFailed = false;
  /** 시계가 뒤로 튀어도 이 시각으로 판정·기록한다. */
  private latestTimeMs = Number.NEGATIVE_INFINITY;
  private readonly inputs: InputEvent[] = [];

  constructor(
    chart: Chart,
    windows: JudgmentWindows,
    rules: { readonly canFail: boolean } = { canFail: true },
  ) {
    this.windows = windows;
    this.canFail = rules.canFail;
    this.statuses = chart.notes.map((): NoteStatus => 'pending');
    this.laneStates = getLanes(chart.laneCount).map(() => ({
      entries: [],
      cursor: 0,
      holding: null,
    }));
    chart.notes.forEach((note, noteIndex) => {
      atLane(this.laneStates, note.lane).entries.push({
        noteIndex,
        note,
      });
    });
    this.unjudgedCount = chart.notes.length;
  }

  press(lane: Lane, songTimeMs: number): JudgmentEvent[] {
    return this.judgeInput(lane, 'press', songTimeMs);
  }

  release(lane: Lane, songTimeMs: number): JudgmentEvent[] {
    return this.judgeInput(lane, 'release', songTimeMs);
  }

  update(songTimeMs: number): JudgmentEvent[] {
    return this.judgeExpired(this.advanceTime(songTimeMs));
  }

  getInputs(): readonly InputEvent[] {
    return this.inputs.map((input) => ({ ...input }));
  }

  getState(): GameplayState {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      hp: this.hp,
    };
  }

  getNoteStatus(noteIndex: number): NoteStatus {
    return requireDefined(this.statuses[noteIndex], 'Note index out of range', noteIndex);
  }

  /** 실패가 완주보다 우선한다. 마지막 판정으로 HP 가 0 이 되어도 실패 결과다. */
  getProgress(): GameplayProgress {
    if (!this.hasFailed && this.unjudgedCount > 0) {
      return PLAYING;
    }
    const accuracy = calculateAccuracy(this.counts);
    const base = {
      score: this.score,
      accuracy,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
    };
    return this.hasFailed
      ? {
          ...base,
          outcome: 'failed',
          cleared: false,
        }
      : {
          ...base,
          outcome: 'finished',
          cleared: isCleared(accuracy),
        };
  }

  private advanceTime(songTimeMs: number): number {
    this.latestTimeMs = Math.max(this.latestTimeMs, songTimeMs);
    return this.latestTimeMs;
  }

  /** 실패 뒤의 입력도 기록한다. 서버가 제출 입력을 같은 호출 순서로 다시 판정해 검증하기 때문이다. */
  private judgeInput(lane: Lane, kind: InputKind, songTimeMs: number): JudgmentEvent[] {
    // 범위 밖 레인은 입력 기록·시각 전진 전에 거부해 세션 상태를 하나도 바꾸지 않는다.
    const laneState = atLane(this.laneStates, lane);
    const judgedAtMs = this.recordInput(lane, kind, songTimeMs);
    const events = this.judgeExpired(judgedAtMs);
    const event =
      kind === 'press'
        ? this.judgePress(lane, laneState, judgedAtMs)
        : this.judgeRelease(lane, laneState, judgedAtMs);
    return event === null ? events : [...events, event];
  }

  private recordInput(lane: Lane, kind: InputKind, songTimeMs: number): number {
    const judgedAtMs = this.advanceTime(songTimeMs);
    this.inputs.push({
      lane,
      kind,
      songTimeMs: judgedAtMs,
    });
    return judgedAtMs;
  }

  private judgePress(lane: Lane, laneState: LaneState, songTimeMs: number): JudgmentEvent | null {
    if (this.hasFailed || laneState.holding !== null) {
      return null;
    }
    const { entries } = laneState;
    let selected: LaneEntry | null = null;
    let selectedDiffMs = Infinity;
    for (let i = laneState.cursor; i < entries.length; i++) {
      const entry = entries[i];
      if (entry === undefined || entry.note.timeMs > songTimeMs + this.windows.badMs) {
        break;
      }
      const diffMs = getDistance(songTimeMs, entry.note.timeMs);
      if (
        this.statuses[entry.noteIndex] === 'pending' &&
        diffMs <= this.windows.badMs &&
        diffMs < selectedDiffMs
      ) {
        selected = entry;
        selectedDiffMs = diffMs;
      }
    }
    if (selected === null) {
      return null;
    }

    const judgment = judgeTap(selected.note.timeMs, songTimeMs, this.windows);
    this.applyJudgment(judgment);
    if (selected.note.type === 'tap') {
      this.settle(laneState, selected, 'hit');
      return {
        noteIndex: selected.noteIndex,
        lane,
        kind: 'tap',
        judgment,
      };
    }
    this.statuses[selected.noteIndex] = 'holding';
    laneState.holding = {
      noteIndex: selected.noteIndex,
      note: selected.note,
    };
    this.advanceCursor(laneState);
    return {
      noteIndex: selected.noteIndex,
      lane,
      kind: 'holdStart',
      judgment,
    };
  }

  private judgeRelease(lane: Lane, laneState: LaneState, songTimeMs: number): JudgmentEvent | null {
    const { holding } = laneState;
    if (this.hasFailed || holding === null) {
      return null;
    }
    const judgment = judgeHoldRelease(holding.note.endTimeMs, songTimeMs, this.windows);
    this.applyJudgment(judgment);
    laneState.holding = null;
    this.settle(laneState, holding, judgment === 'perfect' ? 'hit' : 'missed');
    return {
      noteIndex: holding.noteIndex,
      lane,
      kind: 'holdEnd',
      judgment,
    };
  }

  private judgeExpired(songTimeMs: number): JudgmentEvent[] {
    if (this.hasFailed) {
      return [];
    }
    const candidates: UpdateCandidate[] = [];
    for (const laneState of this.laneStates) {
      const { holding, entries } = laneState;
      if (holding !== null && holding.note.endTimeMs < songTimeMs) {
        candidates.push({
          judgedAtMs: holding.note.endTimeMs,
          laneState,
          entry: holding,
          kind: 'holdEnd',
          judgment: 'perfect',
        });
      }
      for (let i = laneState.cursor; i < entries.length; i++) {
        const entry = entries[i];
        if (entry === undefined) {
          break;
        }

        const lateMs = songTimeMs - entry.note.timeMs;
        if (lateMs <= this.windows.badMs) {
          break;
        }

        if (this.statuses[entry.noteIndex] !== 'pending') {
          continue;
        }

        const judgedAtMs = entry.note.timeMs + this.windows.badMs;

        if (entry.note.type === 'tap') {
          candidates.push({
            judgedAtMs,
            laneState,
            entry,
            kind: 'tap',
            judgment: 'miss',
          });
        } else {
          candidates.push({
            judgedAtMs,
            laneState,
            entry,
            kind: 'holdStart',
            judgment: 'miss',
          });
          candidates.push({
            judgedAtMs,
            laneState,
            entry,
            kind: 'holdEnd',
            judgment: 'miss',
          });
        }
      }
    }
    candidates.sort((a, b) => a.judgedAtMs - b.judgedAtMs || a.entry.note.lane - b.entry.note.lane);

    const events: JudgmentEvent[] = [];
    for (const { laneState, entry, kind, judgment } of candidates) {
      const lane = entry.note.lane;
      this.applyJudgment(judgment);
      if (kind === 'holdEnd' && judgment === 'perfect') {
        laneState.holding = null;
        this.settle(laneState, entry, 'hit');
      } else if (kind !== 'holdStart') {
        this.settle(laneState, entry, 'missed');
      }
      events.push({
        noteIndex: entry.noteIndex,
        lane,
        kind,
        judgment,
      });
      if (this.hasFailed) {
        break;
      }
    }
    return events;
  }

  private applyJudgment(judgment: Judgment): void {
    this.score += getJudgmentScore(judgment);
    this.combo = getNextCombo(this.combo, judgment);
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.counts[judgment] += 1;
    this.hp = getNextHp(this.hp, judgment);
    this.hasFailed = this.canFail && this.hp === 0;
  }

  private settle(laneState: LaneState, entry: LaneEntry, status: 'hit' | 'missed'): void {
    this.statuses[entry.noteIndex] = status;
    this.unjudgedCount -= 1;
    this.advanceCursor(laneState);
  }

  private advanceCursor(laneState: LaneState): void {
    const { entries } = laneState;
    let { cursor } = laneState;
    let entry = entries[cursor];
    while (entry !== undefined && this.statuses[entry.noteIndex] !== 'pending') {
      cursor += 1;
      entry = entries[cursor];
    }
    laneState.cursor = cursor;
  }
}
