import { calculateAccuracy, isCleared } from './accuracy.js';
import { judgeHoldRelease, judgeTap } from './judgment.js';
import { LANES } from './lanes.js';
import { getJudgmentScore, getNextCombo } from './score.js';
import { getNextHp, MAX_HP } from './starlight.js';
import type {
  Chart,
  GameplayResult,
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

interface LaneEntry<T extends Note = Note> {
  noteIndex: number;
  note: T;
}

type PerLane<T> = [T, T, T, T];

interface UpdateCandidate {
  judgedAtMs: number;
  entry: LaneEntry;
  kind: JudgmentEvent['kind'];
  judgment: Judgment;
}

export class GameplaySession {
  private readonly windows: JudgmentWindows;
  private readonly statuses: NoteStatus[];
  private readonly laneEntries: PerLane<LaneEntry[]> = [[], [], [], []];
  private readonly laneCursors: PerLane<number> = [0, 0, 0, 0];
  private readonly holdingEntries: PerLane<LaneEntry<HoldNote> | null> = [null, null, null, null];
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
  /** 지금까지 받은 가장 큰 시각. 시계가 뒤로 튀어도 이 시각으로 판정·기록한다. */
  private latestTimeMs = Number.NEGATIVE_INFINITY;
  private readonly inputs: InputEvent[] = [];

  constructor(chart: Chart, windows: JudgmentWindows) {
    this.windows = windows;
    this.statuses = chart.notes.map((): NoteStatus => 'pending');
    chart.notes.forEach((note, noteIndex) => {
      this.laneEntries[note.lane].push({
        noteIndex,
        note,
      });
    });
    this.unjudgedCount = chart.notes.length;
  }

  press(lane: Lane, songTimeMs: number): JudgmentEvent[] {
    const judgedAtMs = this.recordInput(lane, 'press', songTimeMs);
    const events = this.judgeExpired(judgedAtMs);
    const event = this.judgePress(lane, judgedAtMs);
    return event === null ? events : [...events, event];
  }

  release(lane: Lane, songTimeMs: number): JudgmentEvent[] {
    const judgedAtMs = this.recordInput(lane, 'release', songTimeMs);
    const events = this.judgeExpired(judgedAtMs);
    const event = this.judgeRelease(lane, judgedAtMs);
    return event === null ? events : [...events, event];
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
    const status = this.statuses[noteIndex];
    if (status === undefined) {
      throw new Error(`Note index out of range: ${noteIndex}`);
    }
    return status;
  }

  isFinished(): boolean {
    return this.unjudgedCount === 0;
  }

  isFailed(): boolean {
    return this.hasFailed;
  }

  /** 실패가 완주보다 우선한다. 마지막 판정으로 HP 가 0 이 되어도 실패 결과다. */
  getResult(): GameplayResult {
    if (!this.hasFailed && !this.isFinished()) {
      throw new Error('Gameplay is not finished');
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

  /** 실패 뒤의 입력도 기록한다. 리플레이가 같은 호출 순서를 재현해야 하기 때문이다. */
  private recordInput(lane: Lane, kind: InputKind, songTimeMs: number): number {
    const judgedAtMs = this.advanceTime(songTimeMs);
    this.inputs.push({
      lane,
      kind,
      songTimeMs: judgedAtMs,
    });
    return judgedAtMs;
  }

  private judgePress(lane: Lane, songTimeMs: number): JudgmentEvent | null {
    if (this.hasFailed || this.holdingEntries[lane] !== null) {
      return null;
    }
    const entries = this.laneEntries[lane];
    let selected: LaneEntry | null = null;
    let selectedDiffMs = Infinity;
    for (let i = this.laneCursors[lane]; i < entries.length; i++) {
      const entry = entries[i];
      if (entry === undefined || entry.note.timeMs > songTimeMs + this.windows.badMs) {
        break;
      }
      const diffMs = Math.abs(songTimeMs - entry.note.timeMs);
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
      this.settle(selected, 'hit');
      return {
        noteIndex: selected.noteIndex,
        lane,
        kind: 'tap',
        judgment,
      };
    }
    this.statuses[selected.noteIndex] = 'holding';
    this.holdingEntries[lane] = {
      noteIndex: selected.noteIndex,
      note: selected.note,
    };
    this.advanceCursor(lane);
    return {
      noteIndex: selected.noteIndex,
      lane,
      kind: 'holdStart',
      judgment,
    };
  }

  private judgeRelease(lane: Lane, songTimeMs: number): JudgmentEvent | null {
    const holding = this.holdingEntries[lane];
    if (this.hasFailed || holding === null) {
      return null;
    }
    const judgment = judgeHoldRelease(holding.note.endTimeMs, songTimeMs, this.windows);
    this.applyJudgment(judgment);
    this.holdingEntries[lane] = null;
    this.settle(holding, judgment === 'perfect' ? 'hit' : 'missed');
    return {
      noteIndex: holding.noteIndex,
      lane,
      kind: 'holdEnd',
      judgment,
    };
  }

  /** 판정 시각이 songTimeMs 보다 이전인 자동 판정(MISS·hold 완료)을 처리한다. */
  private judgeExpired(songTimeMs: number): JudgmentEvent[] {
    if (this.hasFailed) {
      return [];
    }
    const candidates: UpdateCandidate[] = [];
    for (const lane of LANES) {
      const holding = this.holdingEntries[lane];
      if (holding !== null && holding.note.endTimeMs < songTimeMs) {
        candidates.push({
          judgedAtMs: holding.note.endTimeMs,
          entry: holding,
          kind: 'holdEnd',
          judgment: 'perfect',
        });
      }
      const entries = this.laneEntries[lane];
      for (let i = this.laneCursors[lane]; i < entries.length; i++) {
        const entry = entries[i];

        if (entry === undefined || songTimeMs - entry.note.timeMs <= this.windows.badMs) {
          break;
        }

        if (this.statuses[entry.noteIndex] !== 'pending') {
          continue;
        }

        const judgedAtMs = entry.note.timeMs + this.windows.badMs;

        if (entry.note.type === 'tap') {
          candidates.push({
            judgedAtMs,
            entry,
            kind: 'tap',
            judgment: 'miss',
          });
        } else {
          candidates.push({
            judgedAtMs,
            entry,
            kind: 'holdStart',
            judgment: 'miss',
          });
          candidates.push({
            judgedAtMs,
            entry,
            kind: 'holdEnd',
            judgment: 'miss',
          });
        }
      }
    }
    candidates.sort((a, b) => a.judgedAtMs - b.judgedAtMs || a.entry.note.lane - b.entry.note.lane);

    const events: JudgmentEvent[] = [];
    for (const { entry, kind, judgment } of candidates) {
      const lane = entry.note.lane;
      this.applyJudgment(judgment);
      if (kind === 'holdEnd' && judgment === 'perfect') {
        this.holdingEntries[lane] = null;
        this.settle(entry, 'hit');
      } else if (kind !== 'holdStart') {
        this.settle(entry, 'missed');
      }
      events.push({
        noteIndex: entry.noteIndex,
        lane,
        kind,
        judgment,
      });
      // 실패한 판정까지만 반영한다. 같은 묶음의 뒤 후보는 실패 뒤의 판정이므로 버린다.
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
    this.hasFailed = this.hp === 0;
  }

  private settle(entry: LaneEntry, status: 'hit' | 'missed'): void {
    this.statuses[entry.noteIndex] = status;
    this.unjudgedCount -= 1;
    this.advanceCursor(entry.note.lane);
  }

  private advanceCursor(lane: Lane): void {
    const entries = this.laneEntries[lane];
    let cursor = this.laneCursors[lane];
    let entry = entries[cursor];
    while (entry !== undefined && this.statuses[entry.noteIndex] !== 'pending') {
      cursor += 1;
      entry = entries[cursor];
    }
    this.laneCursors[lane] = cursor;
  }
}
