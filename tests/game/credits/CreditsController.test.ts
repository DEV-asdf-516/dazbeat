import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import { CreditsController } from '../../../src/game/credits/CreditsController.js';
import { getChangedRegions } from '../../../src/game/credits/state/creditsState.js';
import type { CreditsGrid, CreditsState } from '../../../src/game/credits/state/creditsState.js';
import { requireDefined } from '../../../src/invariant.js';

function makeSong(index: number, credit?: readonly string[]): Song {
  return {
    id: `song-${index}`,
    title: `Title ${index}`,
    category: 'original',
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `https://example.test/${index}.jpg`,
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    chartIds: {},
    ...(credit === undefined ? {} : { credit }),
  };
}

function creditedSongs(count: number): Song[] {
  return Array.from({ length: count }, (_, index) => makeSong(index, [`Artist ${index}`]));
}

const GRID: CreditsGrid = {
  columnCount: 2,
  visibleRowCount: 2,
  lineCount: 2,
};
const ROW_PX = 100;

interface Harness {
  readonly controller: CreditsController;
  readonly renders: { previous: CreditsState | null; next: CreditsState }[];
  setSongs(songs: readonly Song[]): void;
  requestRemainingCount(): number;
  leaveCount(): number;
}

function createHarness(initialSongs: readonly Song[]): Harness {
  const renders: { previous: CreditsState | null; next: CreditsState }[] = [];
  const listeners = new Set<() => void>();
  let songs = initialSongs;
  let requestRemainingCount = 0;
  let leaveCount = 0;
  const controller = new CreditsController(
    {
      get songs() {
        return songs;
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      requestRemaining: () => {
        requestRemainingCount += 1;
        return Promise.resolve();
      },
    },
    {
      render: (previous, next) =>
        renders.push({
          previous,
          next,
        }),
      leave: () => {
        leaveCount += 1;
      },
    },
    GRID,
    ROW_PX,
  );
  return {
    controller,
    renders,
    setSongs: (next) => {
      songs = next;
      listeners.forEach((listener) => listener());
    },
    requestRemainingCount: () => requestRemainingCount,
    leaveCount: () => leaveCount,
  };
}

function lastRender(harness: Harness): { previous: CreditsState | null; next: CreditsState } {
  return requireDefined(harness.renders.at(-1), 'Missing render', harness.renders.length);
}

describe('CreditsController', () => {
  it('renders once without songs and requests the remaining songs', () => {
    const harness = createHarness([]);

    expect(harness.renders).toHaveLength(1);
    const first = lastRender(harness);
    expect(first.previous).toBeNull();
    expect(harness.requestRemainingCount()).toBe(1);
  });

  it('renders again when songs with credits arrive', () => {
    const harness = createHarness(creditedSongs(1));
    const first = lastRender(harness).next;

    harness.setSongs(creditedSongs(3));

    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).previous).toBe(first);
    expect(lastRender(harness).next.entries).toHaveLength(3);
  });

  it('paints no region when only songs without credits arrive', () => {
    const harness = createHarness(creditedSongs(1));

    harness.setSongs([...creditedSongs(1), makeSong(1)]);

    const last = lastRender(harness);
    expect(getChangedRegions(last.previous, last.next)).toEqual([]);
  });

  it('advances the read position over songs without credits', () => {
    const harness = createHarness(creditedSongs(1));
    harness.setSongs([...creditedSongs(1), makeSong(1)]);

    harness.setSongs([...creditedSongs(1), makeSong(1), makeSong(2, ['Artist 2'])]);

    expect(harness.renders).toHaveLength(3);
    expect(lastRender(harness).next.entries).toHaveLength(2);
    expect(lastRender(harness).next.readSongCount).toBe(3);
  });

  it('scrolls one row for a wheel of at least one row', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(ROW_PX, 0);

    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).next.topRow).toBe(1);
  });

  it('ignores a wheel smaller than the start ratio', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(20, 0);

    expect(harness.renders).toHaveLength(1);
  });

  it('accumulates wheels within the gesture gap', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(20, 0);
    harness.controller.scrollByWheel(10, 100);

    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).next.topRow).toBe(1);
  });

  it('starts a new gesture after the gesture gap', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.scrollByWheel(20, 0);
    harness.controller.scrollByWheel(10, 200);

    expect(harness.renders).toHaveLength(1);
  });

  it('does not scroll past the edges with keys', () => {
    // 6개 항목은 2열로 3행이고, 2행이 보이므로 마지막 시작 행은 1이다.
    const harness = createHarness(creditedSongs(6));

    harness.controller.scroll(-1);
    expect(harness.renders).toHaveLength(1);

    harness.controller.scroll(1);
    harness.controller.scroll(1);
    expect(harness.renders).toHaveLength(2);
    expect(lastRender(harness).next.topRow).toBe(1);
  });

  it('leaves on back', () => {
    const harness = createHarness([]);

    harness.controller.back();

    expect(harness.leaveCount()).toBe(1);
  });

  it('ignores songs, wheels and keys after close', () => {
    const harness = createHarness(creditedSongs(6));

    harness.controller.close();
    harness.setSongs(creditedSongs(8));
    harness.controller.scrollByWheel(ROW_PX, 0);
    harness.controller.scroll(1);

    expect(harness.renders).toHaveLength(1);
  });
});

const H_KEY = {
  code: 'KeyH',
  repeat: false,
};
const ESCAPE_KEY = {
  code: 'Escape',
  repeat: false,
};
const DOWN_KEY = {
  code: 'ArrowDown',
  repeat: false,
};

describe('CreditsController controls', () => {
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = createHarness(creditedSongs(6));

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(lastRender(harness).next.isControlsOpen).toBe(true);
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(lastRender(harness).next.isControlsOpen).toBe(false);
    harness.controller.openControls();
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(lastRender(harness).next.isControlsOpen).toBe(false);
  });

  it('ignores wheels while the controls are open', () => {
    const harness = createHarness(creditedSongs(6));
    harness.controller.openControls();
    const renderCount = harness.renders.length;

    harness.controller.scrollByWheel(ROW_PX, 0);

    expect(harness.renders).toHaveLength(renderCount);
  });
});

describe('CreditsController button pointer', () => {
  it('runs the button once for over, down and up on it', () => {
    const harness = createHarness([]);

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerUp('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(1);
  });

  it('does not run the button for an up that was pressed elsewhere', () => {
    const harness = createHarness([]);

    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(0);
  });

  it('releases the press when the pointer leaves the button', () => {
    const harness = createHarness([]);

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerOut('back');
    harness.controller.pointerOver('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(0);
    expect(lastRender(harness).next.hover).toEqual({
      kind: 'button',
      button: 'back',
      isPressed: false,
    });
  });

  it('ignores a press on the close button while the controls are closed', () => {
    const harness = createHarness([]);
    const renderCount = harness.renders.length;

    harness.controller.pointerDown('controlsClose');

    expect(harness.renders).toHaveLength(renderCount);
  });

  it('opens with the entry and closes with the close button and the backdrop', () => {
    const harness = createHarness([]);

    harness.controller.pointerDown('controlsEntry');
    harness.controller.pointerUp('controlsEntry');
    expect(lastRender(harness).next.isControlsOpen).toBe(true);

    harness.controller.pointerDown('controlsClose');
    harness.controller.pointerUp('controlsClose');
    expect(lastRender(harness).next.isControlsOpen).toBe(false);

    harness.controller.openControls();
    harness.controller.pointerDown('controlsBackdrop');
    harness.controller.pointerUp('controlsBackdrop');
    expect(lastRender(harness).next.isControlsOpen).toBe(false);
  });

  it('releases the hover of the close button when the controls close', () => {
    const harness = createHarness([]);
    harness.controller.openControls();
    harness.controller.pointerOver('controlsClose');

    harness.controller.handleControlsKey(ESCAPE_KEY);

    expect(lastRender(harness).next.hover).toBeNull();
  });
});
