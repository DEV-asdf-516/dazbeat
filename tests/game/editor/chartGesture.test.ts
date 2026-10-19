import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import { createDraft, isDraftDirty } from '../../../src/game/editor/chartDraft.js';
import type { ChartDraft } from '../../../src/game/editor/chartDraft.js';
import {
  cancelGesture,
  continueGesture,
  endGesture,
  NO_GESTURE,
  startGesture,
} from '../../../src/game/editor/chartGesture.js';
import type { GestureLimits } from '../../../src/game/editor/chartGesture.js';
import type { Note } from '../../../src/rhythm/types.js';

const song: Song = {
  id: 'test-song',
  title: 'Test Song',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/s1/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 1000,
  gameEndMs: 10000,
  chartIds: { normal: 'chart_normal' },
};

const LIMITS: GestureLimits = {
  playheadTimeMs: 8000,
  snapThresholdMs: 20,
  pickToleranceMs: 30,
};

function makeDraft(notes: readonly Note[]): ChartDraft {
  return createDraft(song, {
    songId: 'test-song',
    difficulty: 'normal',
    offsetMs: 0,
    notes,
  });
}

describe('startGesture', () => {
  it('adds a tap in an empty spot and drags it with no grab offset', () => {
    const { draft, gesture } = startGesture(
      makeDraft([]),
      'tap',
      {
        lane: 1,
        timeMs: 3000,
      },
      LIMITS,
    );

    expect(draft.notes).toEqual([
      {
        type: 'tap',
        timeMs: 3000,
        lane: 1,
      },
    ]);
    expect(draft.selected).toBe(draft.notes[0]);
    expect(gesture).toEqual({
      kind: 'move',
      grabOffsetMs: 0,
    });
  });

  it('starts a one millisecond hold remembering the draft before it', () => {
    const before = makeDraft([]);

    const { draft, gesture } = startGesture(
      before,
      'hold',
      {
        lane: 0,
        timeMs: 3000,
      },
      LIMITS,
    );

    expect(draft.notes).toEqual([
      {
        type: 'hold',
        timeMs: 3000,
        endTimeMs: 3001,
        lane: 0,
      },
    ]);
    expect(gesture).toEqual({
      kind: 'createHold',
      before,
      startMs: 3000,
    });
  });

  it('snaps a new note to the playhead within the threshold only', () => {
    const near = startGesture(
      makeDraft([]),
      'tap',
      {
        lane: 0,
        timeMs: 8020,
      },
      LIMITS,
    );
    const far = startGesture(
      makeDraft([]),
      'tap',
      {
        lane: 0,
        timeMs: 8021,
      },
      LIMITS,
    );

    expect(near.draft.notes[0]?.timeMs).toBe(8000);
    expect(far.draft.notes[0]?.timeMs).toBe(8021);
  });

  it('clamps a new note to the song range', () => {
    const { draft } = startGesture(
      makeDraft([]),
      'tap',
      {
        lane: 0,
        timeMs: 200,
      },
      LIMITS,
    );

    expect(draft.notes[0]?.timeMs).toBe(1000);
  });

  it('selects a picked head for a move keeping the grab offset, without changing notes', () => {
    const before = makeDraft([
      {
        type: 'tap',
        timeMs: 5000,
        lane: 1,
      },
    ]);

    const { draft, gesture } = startGesture(
      before,
      'hold',
      {
        lane: 1,
        timeMs: 5010,
      },
      LIMITS,
    );

    expect(draft.notes).toBe(before.notes);
    expect(isDraftDirty(draft)).toBe(false);
    expect(draft.selected).toBe(before.notes[0]);
    expect(gesture).toEqual({
      kind: 'move',
      grabOffsetMs: 10,
    });
  });

  it('selects a picked hold end for a resize', () => {
    const before = makeDraft([
      {
        type: 'hold',
        timeMs: 3000,
        endTimeMs: 4000,
        lane: 2,
      },
    ]);

    const { draft, gesture } = startGesture(
      before,
      'tap',
      {
        lane: 2,
        timeMs: 4010,
      },
      LIMITS,
    );

    expect(draft.selected).toBe(before.notes[0]);
    expect(gesture).toEqual({ kind: 'resizeHold' });
  });
});

describe('continueGesture', () => {
  it('moves a picked note keeping the grab offset and snapping to another lane', () => {
    const before = makeDraft([
      {
        type: 'tap',
        timeMs: 3000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 5000,
        lane: 1,
      },
    ]);
    const picked = startGesture(
      before,
      'tap',
      {
        lane: 1,
        timeMs: 5010,
      },
      LIMITS,
    );

    // 잡은 오프셋 10ms 를 뺀 3010 이 lane 0 노트(3000)에 스냅된다.
    const moved = continueGesture(
      picked.draft,
      picked.gesture,
      {
        lane: 1,
        timeMs: 3020,
      },
      LIMITS,
    );

    expect(moved.notes).toEqual([
      {
        type: 'tap',
        timeMs: 3000,
        lane: 0,
      },
      {
        type: 'tap',
        timeMs: 3000,
        lane: 1,
      },
    ]);
  });

  it('moves a note across lanes', () => {
    const added = startGesture(
      makeDraft([]),
      'tap',
      {
        lane: 1,
        timeMs: 3000,
      },
      LIMITS,
    );

    const moved = continueGesture(
      added.draft,
      added.gesture,
      {
        lane: 2,
        timeMs: 4000,
      },
      LIMITS,
    );

    expect(moved.notes).toEqual([
      {
        type: 'tap',
        timeMs: 4000,
        lane: 2,
      },
    ]);
  });

  it('changes a hold end without snapping', () => {
    const before = makeDraft([
      {
        type: 'tap',
        timeMs: 4500,
        lane: 0,
      },
      {
        type: 'hold',
        timeMs: 3000,
        endTimeMs: 4000,
        lane: 2,
      },
    ]);
    const picked = startGesture(
      before,
      'tap',
      {
        lane: 2,
        timeMs: 4010,
      },
      LIMITS,
    );

    const resized = continueGesture(
      picked.draft,
      picked.gesture,
      {
        lane: 2,
        timeMs: 4490,
      },
      LIMITS,
    );

    expect(resized.selected).toEqual({
      type: 'hold',
      timeMs: 3000,
      endTimeMs: 4490,
      lane: 2,
    });
  });

  it('does nothing without a gesture', () => {
    const draft = makeDraft([]);

    expect(
      continueGesture(
        draft,
        NO_GESTURE,
        {
          lane: 1,
          timeMs: 3000,
        },
        LIMITS,
      ),
    ).toBe(draft);
  });
});

describe('endGesture', () => {
  function startHold(before: ChartDraft, endTimeMs: number): ChartDraft {
    const started = startGesture(
      before,
      'hold',
      {
        lane: 0,
        timeMs: 3000,
      },
      LIMITS,
    );
    const dragged = continueGesture(
      started.draft,
      started.gesture,
      {
        lane: 0,
        timeMs: endTimeMs,
      },
      LIMITS,
    );
    return endGesture(dragged, started.gesture, endTimeMs);
  }

  it('keeps a hold released after its start', () => {
    expect(startHold(makeDraft([]), 3001).notes).toEqual([
      {
        type: 'hold',
        timeMs: 3000,
        endTimeMs: 3001,
        lane: 0,
      },
    ]);
  });

  it('removes only the hold released at its start, keeping the other notes', () => {
    const before = makeDraft([
      {
        type: 'tap',
        timeMs: 2000,
        lane: 1,
      },
    ]);

    const released = startHold(before, 3000);

    expect(released.notes).toBe(before.notes);
    expect(isDraftDirty(released)).toBe(false);
  });

  it('keeps a moved note', () => {
    const added = startGesture(
      makeDraft([]),
      'tap',
      {
        lane: 1,
        timeMs: 3000,
      },
      LIMITS,
    );

    expect(endGesture(added.draft, added.gesture, 3000)).toBe(added.draft);
  });
});

describe('cancelGesture', () => {
  it('removes the hold being created and keeps other gestures as they are', () => {
    const before = makeDraft([]);
    const creating = startGesture(
      before,
      'hold',
      {
        lane: 0,
        timeMs: 3000,
      },
      LIMITS,
    );
    const moving = startGesture(
      before,
      'tap',
      {
        lane: 0,
        timeMs: 3000,
      },
      LIMITS,
    );

    expect(cancelGesture(creating.draft, creating.gesture).notes).toBe(before.notes);
    expect(cancelGesture(moving.draft, moving.gesture)).toBe(moving.draft);
  });
});
