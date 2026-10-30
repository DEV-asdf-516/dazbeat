import type { Song } from '../../data/songs.js';
import type { HoldNote, Lane, Note } from '../../rhythm/types.js';
import { clamp, getDistance } from '../../range.js';
import { msToSec } from '../../time.js';

export function toEditTimeMs(timeMs: number, song: Song): number {
  return clamp(Math.round(timeMs), song.gameStartMs, song.gameEndMs);
}

export function getPlayStartMs(currentTimeMs: number, song: Song): number {
  return currentTimeMs >= song.gameEndMs ? song.gameStartMs : currentTimeMs;
}

export function toVideoSec(timeMs: number, offsetMs: number): number {
  return msToSec(Math.max(0, timeMs - offsetMs));
}

/** 같은 lane 노트는 후보가 아니므로 스냅이 같은 lane 중복을 만들지 않는다. */
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
  return (
    findClosest(
      candidatesMs.filter((candidateMs) => getDistance(candidateMs, timeMs) <= around.thresholdMs),
      (candidateMs) => candidateMs,
      timeMs,
    ) ?? timeMs
  );
}

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
        note.type === 'hold' && getDistance(note.endTimeMs, timeMs) <= toleranceMs,
    ),
    (note) => note.endTimeMs,
    timeMs,
  );
  if (end !== undefined) {
    return {
      note: end,
      part: 'end',
    };
  }
  const head = findClosest(
    laneNotes.filter(
      (note) =>
        getDistance(note.timeMs, timeMs) <= toleranceMs ||
        (note.type === 'hold' && note.timeMs < timeMs && timeMs < note.endTimeMs),
    ),
    (note) => note.timeMs,
    timeMs,
  );
  return head === undefined
    ? null
    : {
        note: head,
        part: 'head',
      };
}

function findClosest<T>(
  items: readonly T[],
  getPointMs: (item: T) => number,
  timeMs: number,
): T | undefined {
  let closest: T | undefined;
  for (const item of items) {
    if (closest === undefined) {
      closest = item;
      continue;
    }
    const distanceMs = getDistance(getPointMs(item), timeMs);
    const closestDistanceMs = getDistance(getPointMs(closest), timeMs);
    if (
      distanceMs < closestDistanceMs ||
      (distanceMs === closestDistanceMs && getPointMs(item) < getPointMs(closest))
    ) {
      closest = item;
    }
  }
  return closest;
}

export function getGridTimesMs(fromMs: number, toMs: number, stepMs: number): number[] {
  const timesMs: number[] = [];
  for (let timeMs = Math.ceil(fromMs / stepMs) * stepMs; timeMs <= toMs; timeMs += stepMs) {
    timesMs.push(timeMs);
  }
  return timesMs;
}

export function getOpeningTimeMs(notes: readonly Note[], leadMs: number, song: Song): number {
  const [first] = notes;
  return first === undefined ? song.gameStartMs : toEditTimeMs(first.timeMs - leadMs, song);
}
