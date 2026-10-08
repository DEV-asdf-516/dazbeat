import type { InvalidChartError } from '../../data/chartSchema.js';
import type { Song } from '../../data/songs.js';
import type { Chart, Difficulty, Lane, Note } from '../../rhythm/types.js';

/** Editor 가 편집하는 채보. 편집은 새 draft 를 돌려주며, `selected` 는 `notes` 안 노트 객체 자체다. */
export interface ChartDraft {
  readonly song: Song;
  readonly difficulty: Difficulty;
  readonly offsetMs: number;
  /** 항상 timeMs 오름차순, 같은 timeMs 는 lane 오름차순이다. */
  readonly notes: readonly Note[];
  readonly selected: Note | null;
  /** 마지막으로 로드·저장한 notes 배열. notes 가 이 배열이 아니면 미저장 변경이 있다. */
  readonly savedNotes: readonly Note[];
}

export function createDraft(song: Song, chart: Chart): ChartDraft {
  const notes = [...chart.notes].sort(compareNotes);
  return {
    song,
    difficulty: chart.difficulty,
    offsetMs: chart.offsetMs,
    notes,
    selected: null,
    savedNotes: notes,
  };
}

export function createEmptyDraft(song: Song, difficulty: Difficulty): ChartDraft {
  const notes: readonly Note[] = [];
  return { song, difficulty, offsetMs: 0, notes, selected: null, savedNotes: notes };
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
    offsetMs: draft.offsetMs,
    notes: draft.notes,
  };
}

function compareNotes(a: Note, b: Note): number {
  return a.timeMs - b.timeMs || a.lane - b.lane;
}

/** endTimeMs 가 timeMs 이하인 Hold 는 추가하지 않는다. */
export function addNote(draft: ChartDraft, note: Note): ChartDraft {
  if (note.type === 'hold' && note.endTimeMs <= note.timeMs) {
    return draft;
  }
  return { ...draft, notes: insertNote(draft.notes, note), selected: note };
}

export function selectNote(draft: ChartDraft, note: Note | null): ChartDraft {
  if (draft.selected === note) {
    return draft;
  }
  return { ...draft, selected: note };
}

/** Hold 는 길이를 유지한 채 옮긴다. */
export function moveSelectedNote(draft: ChartDraft, timeMs: number, lane: Lane): ChartDraft {
  const { selected } = draft;
  if (selected === null || (selected.timeMs === timeMs && selected.lane === lane)) {
    return draft;
  }
  const moved: Note =
    selected.type === 'hold'
      ? { type: 'hold', timeMs, endTimeMs: timeMs + selected.endTimeMs - selected.timeMs, lane }
      : { type: 'tap', timeMs, lane };
  const others = draft.notes.filter((note) => note !== selected);
  return { ...draft, notes: insertNote(others, moved), selected: moved };
}

/** 끝은 항상 시작보다 늦다. */
export function resizeSelectedHold(draft: ChartDraft, endTimeMs: number): ChartDraft {
  const { selected } = draft;
  if (selected?.type !== 'hold') {
    return draft;
  }
  const nextEndTimeMs = Math.max(endTimeMs, selected.timeMs + 1);
  if (nextEndTimeMs === selected.endTimeMs) {
    return draft;
  }
  // 시작 시각·lane 이 그대로이므로 같은 자리에서 교체해도 정렬이 유지된다.
  const resized: Note = { ...selected, endTimeMs: nextEndTimeMs };
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
  return { ...draft, notes: [], selected: null };
}

/** 정렬 순서를 지키는 새 배열. 같은 순서 값의 노트 뒤에 넣는다. */
function insertNote(notes: readonly Note[], note: Note): Note[] {
  const index = notes.findIndex((existing) => compareNotes(existing, note) > 0);
  if (index === -1) {
    return [...notes, note];
  }
  return [...notes.slice(0, index), note, ...notes.slice(index)];
}

/** 저장을 시작한 뒤 notes 가 바뀌었으면(같은 배열이 아니면) 그 편집은 아직 저장되지 않았다. */
export function completeSave(
  current: ChartDraft,
  savedNotes: readonly Note[],
  song: Song,
): ChartDraft {
  if (current.song === song && current.savedNotes === savedNotes) {
    return current;
  }
  return { ...current, song, savedNotes };
}

/** 그 사이 끝난 저장 결과(song·저장 기준)는 두고 notes·선택만 되돌린다. */
export function restoreNotes(current: ChartDraft, before: ChartDraft): ChartDraft {
  if (current.notes === before.notes && current.selected === before.selected) {
    return current;
  }
  return { ...current, notes: before.notes, selected: before.selected };
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
