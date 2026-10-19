import { describe, expect, it } from 'vitest';
import type { Song } from '../../../src/data/songs.js';
import {
  advancePlayback,
  createPlayhead,
  followPlayerState,
  pausePlayback,
  seekPlayback,
  togglePlayback,
} from '../../../src/game/editor/chartPlayback.js';
import type { PlaybackPlayer, Playhead } from '../../../src/game/editor/chartPlayback.js';

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

const OFFSET_MS = 500;

function makePlayer(isReady = true): {
  player: PlaybackPlayer;
  requestedSec: number[];
  timeSource: { currentTime: number };
} {
  const requestedSec: number[] = [];
  const timeSource = { currentTime: 0 };
  return {
    player: {
      play: (fromSec) => {
        if (!isReady) {
          return null;
        }
        requestedSec.push(fromSec);
        return timeSource;
      },
      pause: () => undefined,
    },
    requestedSec,
    timeSource,
  };
}

function playing(fromMs: number): { playhead: Playhead; timeSource: { currentTime: number } } {
  const { player, timeSource } = makePlayer();
  const starting = togglePlayback(createPlayhead(fromMs), song, OFFSET_MS, player);
  return {
    playhead: followPlayerState(starting, 'playing'),
    timeSource,
  };
}

describe('togglePlayback', () => {
  it('requests the video position of the playhead and waits for the player', () => {
    const { player, requestedSec } = makePlayer();

    const started = togglePlayback(createPlayhead(3000), song, OFFSET_MS, player);

    expect(requestedSec).toEqual([2.5]);
    expect(started.currentTimeMs).toBe(3000);
    expect(started.transport.kind).toBe('starting');
  });

  it('rewinds to gameStartMs when starting at gameEndMs', () => {
    const { player, requestedSec } = makePlayer();

    const started = togglePlayback(createPlayhead(10000), song, OFFSET_MS, player);

    expect(requestedSec).toEqual([0.5]);
    expect(started.currentTimeMs).toBe(1000);
  });

  it('does not start before the player is ready', () => {
    const paused = createPlayhead(3000);

    expect(togglePlayback(paused, song, OFFSET_MS, makePlayer(false).player)).toBe(paused);
  });

  it('pauses while starting or playing, keeping the time', () => {
    const { player } = makePlayer();
    const starting = togglePlayback(createPlayhead(3000), song, OFFSET_MS, player);

    expect(togglePlayback(starting, song, OFFSET_MS, player)).toEqual(createPlayhead(3000));
    expect(togglePlayback(playing(4000).playhead, song, OFFSET_MS, player)).toEqual(
      createPlayhead(4000),
    );
  });
});

describe('followPlayerState', () => {
  it('starts following the clock once the player plays', () => {
    const { player } = makePlayer();
    const starting = togglePlayback(createPlayhead(3000), song, OFFSET_MS, player);

    const followed = followPlayerState(starting, 'playing');

    expect(followed.transport).toEqual({
      ...starting.transport,
      kind: 'playing',
    });
    expect(followPlayerState(followed, 'buffering')).toBe(followed);
  });

  it('pauses when the player pauses or ends', () => {
    const { player } = makePlayer();
    const starting = togglePlayback(createPlayhead(3000), song, OFFSET_MS, player);
    const { playhead } = playing(3000);

    expect(followPlayerState(playhead, 'paused').transport).toEqual({ kind: 'paused' });
    expect(followPlayerState(starting, 'ended').transport).toEqual({ kind: 'paused' });
  });

  it('does not resume a paused playhead', () => {
    const paused = createPlayhead(3000);

    expect(followPlayerState(paused, 'playing')).toBe(paused);
  });
});

describe('advancePlayback', () => {
  it('follows the clock including the chart offset until just before gameEndMs', () => {
    const { playhead, timeSource } = playing(3000);
    timeSource.currentTime = 9.499;

    const advanced = advancePlayback(playhead, song);

    expect(advanced.currentTimeMs).toBe(9999);
    expect(advanced.transport.kind).toBe('playing');
  });

  it('pauses at gameEndMs once the clock reaches it', () => {
    const { playhead, timeSource } = playing(3000);
    timeSource.currentTime = 9.5;

    expect(advancePlayback(playhead, song)).toEqual(createPlayhead(10000));
  });

  it('keeps the playhead when the clock has not moved a whole millisecond', () => {
    const { playhead, timeSource } = playing(3000);
    timeSource.currentTime = 2.5;

    expect(advancePlayback(playhead, song)).toBe(playhead);
  });

  it('does not advance before the player plays or while paused', () => {
    const { player, timeSource } = makePlayer();
    const starting = togglePlayback(createPlayhead(3000), song, OFFSET_MS, player);
    const paused = createPlayhead(3000);
    timeSource.currentTime = 5;

    expect(advancePlayback(starting, song)).toBe(starting);
    expect(advancePlayback(paused, song)).toBe(paused);
  });
});

describe('seekPlayback', () => {
  it('pauses at the clamped edit time', () => {
    const { playhead } = playing(3000);

    expect(seekPlayback(playhead, song, 5000.4)).toEqual(createPlayhead(5000));
    expect(seekPlayback(playhead, song, 20000)).toEqual(createPlayhead(10000));
    expect(seekPlayback(playhead, song, 3000)).toEqual(createPlayhead(3000));
  });

  it('keeps a paused playhead at the same time', () => {
    const paused = createPlayhead(3000);

    expect(seekPlayback(paused, song, 3000)).toBe(paused);
    expect(pausePlayback(paused)).toBe(paused);
  });
});
