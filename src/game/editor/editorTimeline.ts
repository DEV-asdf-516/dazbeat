import type { Song } from '../../data/songs.js';
import { LANES } from '../../rhythm/lanes.js';
import type { HoldNote, Lane, Note } from '../../rhythm/types.js';
import { clamp } from '../range.js';

/** `getNoteY` 의 역함수. */
export function getTimeAtY(
  yPx: number,
  currentTimeMs: number,
  playheadYPx: number,
  pxPerSecond: number,
): number {
  return currentTimeMs + ((playheadYPx - yPx) / pxPerSecond) * 1000;
}

/** 편집에 쓰는 시각은 정수 ms 이고 곡의 플레이 구간 안에 있다. */
export function toEditTimeMs(timeMs: number, song: Song): number {
  return clamp(Math.round(timeMs), song.gameStartMs, song.gameEndMs);
}

/** 끝까지 재생한 뒤 다시 Play 하면 처음부터 재생한다. */
export function getPlayStartMs(currentTimeMs: number, song: Song): number {
  return currentTimeMs >= song.gameEndMs ? song.gameStartMs : currentTimeMs;
}

/** YouTube player 에 넘기는 초 단위 재생 위치. 영상 시작 전 시각은 0 이다. */
export function toVideoSec(timeMs: number, offsetMs: number): number {
  return Math.max(0, timeMs - offsetMs) / 1000;
}

export function getLaneAtX(xPx: number, lanesLeftPx: number, laneWidthPx: number): Lane {
  const index = clamp(Math.floor((xPx - lanesLeftPx) / laneWidthPx), 0, LANES.length - 1);
  const lane = LANES[index];
  if (lane === undefined) {
    throw new Error(`Invalid lane index: ${index}`);
  }
  return lane;
}

/**
 * 시작 시각을 다른 lane 노트의 시작이나 playhead 에 맞춰 정확히 같은 timeMs 의 동시타를 만든다.
 * 같은 lane 노트는 후보가 아니므로 스냅이 같은 lane 중복을 만들지 않는다.
 */
export function snapStartTimeMs(
  timeMs: number,
  lane: Lane,
  around: {
    notes: readonly Note[];
    movingNote: Note | null;
    playheadTimeMs: number;
    thresholdMs: number;
  },
): number {
  const candidatesMs = around.notes
    .filter((note) => note.lane !== lane && note !== around.movingNote)
    .map((note) => note.timeMs);
  candidatesMs.push(around.playheadTimeMs);
  let snappedMs = timeMs;
  let bestDistanceMs = Number.POSITIVE_INFINITY;
  for (const candidateMs of candidatesMs) {
    const distanceMs = Math.abs(candidateMs - timeMs);
    if (
      distanceMs <= around.thresholdMs &&
      (distanceMs < bestDistanceMs || (distanceMs === bestDistanceMs && candidateMs < snappedMs))
    ) {
      snappedMs = candidateMs;
      bestDistanceMs = distanceMs;
    }
  }
  return snappedMs;
}

/** pointer 가 가리키는 같은 lane 노트. Hold 끝이 머리보다 우선이다. */
export function pickNote(
  notes: readonly Note[],
  lane: Lane,
  timeMs: number,
  toleranceMs: number,
): { note: Note; part: 'head' | 'end' } | null {
  const laneNotes = notes.filter((note) => note.lane === lane);
  const end = findClosest(
    laneNotes.filter(
      (note): note is HoldNote =>
        note.type === 'hold' && Math.abs(note.endTimeMs - timeMs) <= toleranceMs,
    ),
    (note) => note.endTimeMs,
    timeMs,
  );
  if (end !== undefined) {
    return { note: end, part: 'end' };
  }
  const head = findClosest(
    laneNotes.filter(
      (note) =>
        Math.abs(note.timeMs - timeMs) <= toleranceMs ||
        (note.type === 'hold' && note.timeMs < timeMs && timeMs < note.endTimeMs),
    ),
    (note) => note.timeMs,
    timeMs,
  );
  return head === undefined ? null : { note: head, part: 'head' };
}

/** 같은 거리면 앞(이른) 노트를 고른다. */
function findClosest<T extends Note>(
  notes: readonly T[],
  getPointMs: (note: T) => number,
  timeMs: number,
): T | undefined {
  let closest: T | undefined;
  for (const note of notes) {
    if (
      closest === undefined ||
      Math.abs(getPointMs(note) - timeMs) < Math.abs(getPointMs(closest) - timeMs)
    ) {
      closest = note;
    }
  }
  return closest;
}

/** `m:ss.mmm`. 편집 시각은 정수 ms 다. */
export function formatEditorTime(timeMs: number): string {
  const sign = timeMs < 0 ? '-' : '';
  const absMs = Math.abs(timeMs);
  const minutes = Math.floor(absMs / 60_000);
  const seconds = Math.floor((absMs % 60_000) / 1000);
  const millis = absMs % 1000;
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export interface SelectionRow {
  readonly label: 'TYPE' | 'LANE' | 'TIME';
  readonly value: string;
}

const NO_VALUE = '—';

/** 도구 열 선택 정보 3행. 선택이 없어도 같은 3행이며 값은 `—` 이다. */
export function describeSelection(
  note: Note | null,
): readonly [SelectionRow, SelectionRow, SelectionRow] {
  if (note === null) {
    return [
      { label: 'TYPE', value: NO_VALUE },
      { label: 'LANE', value: NO_VALUE },
      { label: 'TIME', value: NO_VALUE },
    ];
  }
  const startText = formatEditorTime(note.timeMs);
  return [
    { label: 'TYPE', value: note.type === 'tap' ? 'TAP' : 'HOLD' },
    { label: 'LANE', value: String(note.lane) },
    {
      label: 'TIME',
      value: note.type === 'tap' ? startText : `${startText}–${formatEditorTime(note.endTimeMs)}`,
    },
  ];
}

/** fromMs 이상 toMs 이하 구간에 놓이는 stepMs 의 배수 시각. 오름차순이다. */
export function getGridTimesMs(fromMs: number, toMs: number, stepMs: number): number[] {
  const timesMs: number[] = [];
  for (let timeMs = Math.ceil(fromMs / stepMs) * stepMs; timeMs <= toMs; timeMs += stepMs) {
    timesMs.push(timeMs);
  }
  return timesMs;
}

/** 채보를 열었을 때 첫 노트가 playhead 보다 leadMs 위에 보이는 시각. 노트가 없으면 곡 시작이다. */
export function getOpeningTimeMs(notes: readonly Note[], leadMs: number, song: Song): number {
  const [first] = notes;
  return first === undefined ? song.gameStartMs : toEditTimeMs(first.timeMs - leadMs, song);
}
