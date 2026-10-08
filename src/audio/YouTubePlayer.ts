export type YouTubePlayerState =
  'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

// https://developers.google.com/youtube/iframe_api_reference#onStateChange
const PLAYER_STATES: ReadonlyMap<number, YouTubePlayerState> = new Map([
  [-1, 'unstarted'],
  [0, 'ended'],
  [1, 'playing'],
  [2, 'paused'],
  [3, 'buffering'],
  [5, 'cued'],
]);

export type YouTubeErrorKind =
  'invalidParameter' | 'html5PlayerError' | 'videoNotFound' | 'embeddingNotAllowed' | 'unknown';

// https://developers.google.com/youtube/iframe_api_reference#onError
const ERROR_KINDS: ReadonlyMap<number, YouTubeErrorKind> = new Map([
  [2, 'invalidParameter'],
  [5, 'html5PlayerError'],
  [100, 'videoNotFound'],
  [101, 'embeddingNotAllowed'],
  [150, 'embeddingNotAllowed'],
]);

const UNKNOWN_ERROR_CODE = -1;

export interface YouTubePlayerHandlers {
  onReady(): void;
  onStateChange(state: YouTubePlayerState): void;
  onError(kind: YouTubeErrorKind, code: number): void;
}

interface YTPlayerEvent {
  readonly data: unknown;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars: Record<string, number>;
  events: {
    onReady(): void;
    onStateChange(event: YTPlayerEvent): void;
    onError(event: YTPlayerEvent): void;
  };
}

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: { Player?: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';

let pendingLoad: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window.YT?.Player === 'function') {
    return Promise.resolve();
  }
  if (pendingLoad !== null) {
    return pendingLoad;
  }
  pendingLoad = new Promise<void>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = IFRAME_API_URL;
    script.addEventListener('error', () => {
      pendingLoad = null;
      script.remove();
      reject(new Error('Failed to load YouTube IFrame API'));
    });
    document.head.append(script);
  });
  return pendingLoad;
}

export class YouTubePlayer {
  private readonly placeholder: HTMLDivElement;
  private readonly player: YTPlayer;
  private ready = false;
  private destroyed = false;

  constructor(container: HTMLElement, videoId: string, handlers: YouTubePlayerHandlers) {
    const Player = window.YT?.Player;
    if (typeof Player !== 'function') {
      throw new Error('YouTube IFrame API is not loaded');
    }
    this.placeholder = document.createElement('div');
    container.append(this.placeholder);
    this.player = new Player(this.placeholder, {
      videoId,
      playerVars: {
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        iv_load_policy: 3,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          this.ready = true;
          handlers.onReady();
        },
        onStateChange: (event) => {
          if (!this.ready) {
            return;
          }
          const state = typeof event.data === 'number' ? PLAYER_STATES.get(event.data) : undefined;
          if (state !== undefined) {
            handlers.onStateChange(state);
          }
        },
        onError: (event) => {
          const code = typeof event.data === 'number' ? event.data : UNKNOWN_ERROR_CODE;
          handlers.onError(getYouTubeErrorKind(code), code);
        },
      },
    });
  }

  requestPlay(fromSec: number): void {
    this.player.seekTo(fromSec, true);
    this.player.playVideo();
  }

  resume(): void {
    this.player.playVideo();
  }

  pause(): void {
    this.player.pauseVideo();
  }

  getCurrentTime(): number {
    return this.player.getCurrentTime();
  }

  setVolume(volume: number): void {
    this.player.setVolume(Math.round(volume * 100));
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.player.destroy();
    this.placeholder.remove();
  }
}

export function getYouTubeErrorKind(code: number): YouTubeErrorKind {
  return ERROR_KINDS.get(code) ?? 'unknown';
}
