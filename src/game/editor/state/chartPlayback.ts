import { RhythmClock } from '../../../audio/RhythmClock.js';
import type { YouTubePlayerState } from '../../../audio/YouTubePlayer.js';
import type { Song } from '../../../data/songs.js';
import { getPlayStartMs, toEditTimeMs, toVideoSec } from './editorTimeline.js';

export type Transport =
  | { readonly kind: 'paused' }
  | { readonly kind: 'starting'; readonly clock: RhythmClock }
  | { readonly kind: 'playing'; readonly clock: RhythmClock };

export interface Playhead {
  readonly currentTimeMs: number;
  readonly transport: Transport;
}

export interface PlaybackPlayer {
  play(fromSec: number): { readonly currentTime: number } | null;
  pause(): void;
}

const PAUSED: Transport = { kind: 'paused' };

export function createPlayhead(currentTimeMs: number): Playhead {
  return {
    currentTimeMs,
    transport: PAUSED,
  };
}

export function togglePlayback(
  playhead: Playhead,
  song: Song,
  offsetMs: number,
  player: PlaybackPlayer,
): Playhead {
  if (playhead.transport.kind !== 'paused') {
    return {
      ...playhead,
      transport: PAUSED,
    };
  }
  const startMs = getPlayStartMs(playhead.currentTimeMs, song);
  const timeSource = player.play(toVideoSec(startMs, offsetMs));
  if (timeSource === null) {
    return playhead;
  }
  return {
    currentTimeMs: startMs,
    transport: {
      kind: 'starting',
      clock: new RhythmClock(timeSource, 0, offsetMs, {
        audioStartTimeSec: 0,
        songStartMs: 0,
      }),
    },
  };
}

export function pausePlayback(playhead: Playhead): Playhead {
  return playhead.transport.kind === 'paused'
    ? playhead
    : {
        ...playhead,
        transport: PAUSED,
      };
}

/** YouTube 는 재생 중 seek 뒤 상태 이벤트를 항상 보내지 않으므로, seek 은 멈추고 재생 재개는 Play 경로 하나로만 한다. */
export function seekPlayback(playhead: Playhead, song: Song, targetMs: number): Playhead {
  const currentTimeMs = toEditTimeMs(targetMs, song);
  if (currentTimeMs === playhead.currentTimeMs) {
    return pausePlayback(playhead);
  }
  return {
    currentTimeMs,
    transport: PAUSED,
  };
}

export function followPlayerState(playhead: Playhead, playerState: YouTubePlayerState): Playhead {
  const { transport } = playhead;
  if (playerState === 'playing' && transport.kind === 'starting') {
    return {
      ...playhead,
      transport: {
        kind: 'playing',
        clock: transport.clock,
      },
    };
  }
  if (playerState === 'paused' || playerState === 'ended') {
    return pausePlayback(playhead);
  }
  return playhead;
}

export function advancePlayback(playhead: Playhead, song: Song): Playhead {
  const { transport } = playhead;
  if (transport.kind !== 'playing') {
    return playhead;
  }
  const playbackMs = transport.clock.getTimeMs();
  if (playbackMs >= song.gameEndMs) {
    return {
      currentTimeMs: song.gameEndMs,
      transport: PAUSED,
    };
  }
  const currentTimeMs = toEditTimeMs(playbackMs, song);
  return currentTimeMs === playhead.currentTimeMs
    ? playhead
    : {
        ...playhead,
        currentTimeMs,
      };
}
