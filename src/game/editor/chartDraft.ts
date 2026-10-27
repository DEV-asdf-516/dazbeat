import type { InvalidChartError } from '../../data/chartSchema.js';
import type { Song } from '../../data/songs.js';
import type { Chart, Difficulty, Lane, LaneCount, Note } from '../../rhythm/types.js';

/** `selected` 는 `notes` 안 노트 객체 자체다. */
export interface ChartDraft {
  readonly song: Song;
  readonly laneCount: LaneCount;
  readonly difficulty: Difficulty;
  readonly offsetMs: number;
  /** 항상 timeMs 오름차순, 같은 timeMs 는 lane 오름차순이다. */
  readonly notes: readonly Note[];
  readonly selected: Note | null;
  readonly savedNotes: readonly Note[];
}

export const MIN_HOLD_DURATION_MS = 1;

export function createDraft(song: Song, chart: Chart): ChartDraft {
  const notes = [...chart.notes].sort(compareNotes);
  return {
    song,
    laneCount: chart.laneCount,
    difficulty: chart.difficulty,
    offsetMs: chart.offsetMs,
    notes,
    selected: null,
    savedNotes: notes,
  };
}

export function createEmptyDraft(
  song: Song,
  laneCount: LaneCount,
  difficulty: Difficulty,
): ChartDraft {
  const notes: readonly Note[] = [];
  return {
    song,
    laneCount,
    difficulty,
    offsetMs: 0,
    notes,
    selected: null,
    savedNotes: notes,
  };
}

/** 내용이 원래대로 돌아왔는지가 아니라 저장 기준 배열 자체인지로 판정한다. */
export function isDraftDirty(draft: ChartDraft): boolean {
  return draft.notes !== draft.savedNotes;
}

/** notes 가 이미 validation 이 요구하는 순서이므로 정렬하지 않는다. */
export function toChart(draft: ChartDraft): Chart {
  return {
    songId: draft.song.id,
    difficulty: draft.difficulty,
    laneCount: draft.laneCount,
    offsetMs: draft.offsetMs,
    notes: draft.notes,
  };
}

function compareNotes(a: Note, b: Note): number {
  return a.timeMs - b.timeMs || a.lane - b.lane;
}

export function addNote(draft: ChartDraft, note: Note): ChartDraft {
  if (note.type === 'hold' && note.endTimeMs <= note.timeMs) {
    return draft;
  }
  return {
    ...draft,
    notes: insertNote(draft.notes, note),
    selected: note,
  };
}

export function selectNote(draft: ChartDraft, note: Note | null): ChartDraft {
  if (draft.selected === note) {
    return draft;
  }
  return {
    ...draft,
    selected: note,
  };
}

export function moveSelectedNote(draft: ChartDraft, timeMs: number, lane: Lane): ChartDraft {
  const { selected } = draft;
  if (selected === null || (selected.timeMs === timeMs && selected.lane === lane)) {
    return draft;
  }
  const moved: Note =
    selected.type === 'hold'
      ? {
          type: 'hold',
          timeMs,
          endTimeMs: timeMs + selected.endTimeMs - selected.timeMs,
          lane,
        }
      : {
          type: 'tap',
          timeMs,
          lane,
        };
  const others = draft.notes.filter((note) => note !== selected);
  return {
    ...draft,
    notes: insertNote(others, moved),
    selected: moved,
  };
}

export function resizeSelectedHold(draft: ChartDraft, endTimeMs: number): ChartDraft {
  const { selected } = draft;
  if (selected?.type !== 'hold') {
    return draft;
  }
  const nextEndTimeMs = Math.max(endTimeMs, selected.timeMs + MIN_HOLD_DURATION_MS);
  if (nextEndTimeMs === selected.endTimeMs) {
    return draft;
  }
  // 시작 시각·lane 이 그대로이므로 같은 자리에서 교체해도 정렬이 유지된다.
  const resized: Note = {
    ...selected,
    endTimeMs: nextEndTimeMs,
  };
  return {
    ...draft,
    notes: draft.notes.map((note) => (note === selected ? resized : note)),
    selected: resized,
  };
}

export function deleteSelectedNote(draft: ChartDraft): ChartDraft {
  const { selected } = draft;
  if (selected === null) {
    return draft;
  }
  return {
    ...draft,
    notes: draft.notes.filter((note) => note !== selected),
    selected: null,
  };
}

export function clearNotes(draft: ChartDraft): ChartDraft {
  if (draft.notes.length === 0) {
    return draft;
  }
  return {
    ...draft,
    notes: [],
    selected: null,
  };
}

function insertNote(notes: readonly Note[], note: Note): Note[] {
  const index = notes.findIndex((existing) => compareNotes(existing, note) > 0);
  if (index === -1) {
    return [...notes, note];
  }
  return [...notes.slice(0, index), note, ...notes.slice(index)];
}

export function completeSave(
  current: ChartDraft,
  savedNotes: readonly Note[],
  song: Song,
): ChartDraft {
  if (current.song === song && current.savedNotes === savedNotes) {
    return current;
  }
  return {
    ...current,
    song,
    savedNotes,
  };
}

export function restoreNotes(current: ChartDraft, before: ChartDraft): ChartDraft {
  if (current.notes === before.notes && current.selected === before.selected) {
    return current;
  }
  return {
    ...current,
    notes: before.notes,
    selected: before.selected,
  };
}

const INVALID_NOTE_PATH = /^chart\.notes\[(\d+)\]/;

/** toChart 가 notes 순서를 그대로 담으므로 오류 경로의 index 가 draft notes 의 index 다. */
export function findInvalidNote(draft: ChartDraft, error: InvalidChartError): Note | null {
  const match = INVALID_NOTE_PATH.exec(error.path);
  if (match === null) {
    return null;
  }
  return draft.notes[Number(match[1])] ?? null;
}
