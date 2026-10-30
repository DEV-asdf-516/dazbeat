import type { Lane } from '../../../rhythm/types.js';
import {
  addNote,
  MIN_HOLD_DURATION_MS,
  moveSelectedNote,
  resizeSelectedHold,
  restoreNotes,
  selectNote,
} from './chartDraft.js';
import type { ChartDraft } from './chartDraft.js';
import { pickNote, snapStartTimeMs, toEditTimeMs } from './editorTimeline.js';

export type EditTool = 'tap' | 'hold';

export type PointerGesture =
  | { readonly kind: 'none' }
  | { readonly kind: 'move'; readonly before: ChartDraft; readonly grabOffsetMs: number }
  | { readonly kind: 'resizeHold'; readonly before: ChartDraft }
  | { readonly kind: 'createHold'; readonly before: ChartDraft; readonly startMs: number };

export interface TimelinePointer {
  readonly lane: Lane;
  readonly timeMs: number;
}

export interface GestureLimits {
  readonly playheadTimeMs: number;
  readonly snapThresholdMs: number;
  readonly pickToleranceMs: number;
}

export const NO_GESTURE: PointerGesture = { kind: 'none' };

export function startGesture(
  draft: ChartDraft,
  tool: EditTool,
  pointer: TimelinePointer,
  limits: GestureLimits,
): { draft: ChartDraft; gesture: PointerGesture } {
  const { lane, timeMs: pointerTimeMs } = pointer;
  const hit = pickNote(draft.notes, lane, pointerTimeMs, limits.pickToleranceMs);
  if (hit !== null) {
    return {
      draft: selectNote(draft, hit.note),
      gesture:
        hit.part === 'end'
          ? {
              kind: 'resizeHold',
              before: draft,
            }
          : {
              kind: 'move',
              before: draft,
              grabOffsetMs: pointerTimeMs - hit.note.timeMs,
            },
    };
  }
  const startMs = snapStartTimeMs(toEditTimeMs(pointerTimeMs, draft.song), lane, {
    notes: draft.notes,
    movingNote: null,
    playheadTimeMs: limits.playheadTimeMs,
    thresholdMs: limits.snapThresholdMs,
  });
  if (tool === 'tap') {
    return {
      draft: addNote(draft, {
        type: 'tap',
        timeMs: startMs,
        lane,
      }),
      gesture: {
        kind: 'move',
        before: draft,
        grabOffsetMs: 0,
      },
    };
  }
  return {
    draft: addNote(draft, {
      type: 'hold',
      timeMs: startMs,
      endTimeMs: startMs + MIN_HOLD_DURATION_MS,
      lane,
    }),
    gesture: {
      kind: 'createHold',
      before: draft,
      startMs,
    },
  };
}

export function continueGesture(
  draft: ChartDraft,
  gesture: Exclude<PointerGesture, { kind: 'none' }>,
  pointer: TimelinePointer,
  limits: GestureLimits,
): ChartDraft {
  switch (gesture.kind) {
    case 'move': {
      const startMs = snapStartTimeMs(
        toEditTimeMs(pointer.timeMs - gesture.grabOffsetMs, draft.song),
        pointer.lane,
        {
          notes: draft.notes,
          movingNote: draft.selected,
          playheadTimeMs: limits.playheadTimeMs,
          thresholdMs: limits.snapThresholdMs,
        },
      );
      return moveSelectedNote(draft, startMs, pointer.lane);
    }
    case 'resizeHold':
    case 'createHold':
      return resizeSelectedHold(draft, toEditTimeMs(pointer.timeMs, draft.song));
  }
}

export function endGesture(
  draft: ChartDraft,
  gesture: PointerGesture,
  pointerTimeMs: number,
): ChartDraft {
  if (gesture.kind === 'createHold' && toEditTimeMs(pointerTimeMs, draft.song) > gesture.startMs) {
    return draft;
  }
  return cancelGesture(draft, gesture);
}

export function cancelGesture(draft: ChartDraft, gesture: PointerGesture): ChartDraft {
  return gesture.kind === 'createHold' ? restoreNotes(draft, gesture.before) : draft;
}
