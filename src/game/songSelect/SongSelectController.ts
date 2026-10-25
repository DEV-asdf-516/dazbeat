import { PreviewLoop } from '../../audio/PreviewLoop.js';
import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import { SONG_FILTERS } from '../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../data/songs.js';
import { cycleItem } from '../../range.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import type { SongFeed, SongFeeds } from '../SongFeed.js';
import type { SongSelectRestore } from '../sceneRoutes.js';
import {
  getPlayableSelection,
  getSongPage,
  getSongSelectNotice,
  getSongSelectTarget,
  isOnLastLoadedPage,
  moveDifficulty,
  moveSong,
  openSongSelect,
  selectDifficulty,
  selectRandomSong,
  selectSong,
  withFilter,
  withSongs,
} from './songSelectState.js';
import type { SongSelectNotice, SongSelectState } from './songSelectState.js';

export interface SongSelectView {
  readonly state: SongSelectState;
  readonly notice: SongSelectNotice | null;
}

export interface SongSelectScreen {
  render(view: SongSelectView, previous: SongSelectState | null): void;
  play(chart: ChartRef, restore: SongSelectRestore): void;
  openSettings(restore: SongSelectRestore): void;
  playFocusSound(): void;
}

interface ControllerState {
  readonly feed: SongFeed;
  readonly state: SongSelectState;
  readonly notice: SongSelectNotice | null;
  readonly unsubscribe: () => void;
}

export type PreviewPlayer = Pick<YouTubePlayer, 'requestPlay' | 'setVolume' | 'destroy'>;

export interface PreviewPlayerFactory {
  loadApi(): Promise<void>;
  create(videoId: string, handlers: YouTubePlayerHandlers): PreviewPlayer;
}

export interface SongPreviewDeps {
  readonly players: PreviewPlayerFactory;
  readonly now: () => number;
  readonly volume: number;
}

export interface SongSelectDeps {
  readonly feeds: SongFeeds;
  readonly random: () => number;
  readonly preview: SongPreviewDeps;
}

type PreviewState =
  | { readonly kind: 'none' }
  | { readonly kind: 'waiting'; readonly song: Song; readonly focusedAtMs: number }
  | { readonly kind: 'loadingApi'; readonly song: Song }
  | { readonly kind: 'loadingPlayer'; readonly song: Song; readonly player: PreviewPlayer }
  | {
      readonly kind: 'playing';
      readonly song: Song;
      readonly player: PreviewPlayer;
      readonly loop: PreviewLoop;
    }
  | { readonly kind: 'failed'; readonly song: Song }
  | { readonly kind: 'closed' };

type Transition = (state: SongSelectState) => SongSelectState;

// 빠르게 넘기는 동안 지나가는 곡마다 플레이어를 만들지 않도록 포커스가 이만큼 머문 뒤 재생한다.
const PREVIEW_DELAY_MS = 200;

export class SongSelectController {
  private current: ControllerState;
  private previewState: PreviewState = { kind: 'none' };

  constructor(
    private readonly deps: SongSelectDeps,
    private readonly screen: SongSelectScreen,
    private readonly rowsPerPage: number,
    laneCount: LaneCount,
    restore: SongSelectRestore | undefined,
  ) {
    const { feed, state } = openSongSelect(deps.feeds.catalog, laneCount, restore);
    this.current = this.attach(feed, state);
    this.render(null);
    if (restore === undefined) {
      this.requestMoreFromUser();
    }
  }

  moveSong(delta: number): void {
    if (this.apply((state) => moveSong(state, delta))) {
      this.screen.playFocusSound();
    }
    this.requestMoreFromUser();
  }

  selectRow(slot: number): void {
    this.applyFromUser((state) =>
      selectSong(state, getSongPage(state, this.rowsPerPage).startIndex + slot),
    );
  }

  moveDifficulty(delta: 1 | -1): void {
    this.applyFromUser((state) => moveDifficulty(state, delta));
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.applyFromUser((state) => selectDifficulty(state, difficulty));
  }

  // 비활성 RANDOM 이 실패한 feed 를 다시 부르지 않도록 다음 배치는 곡이 바뀐 경우에만 요청한다.
  selectRandomSong(): void {
    if (this.apply((state) => selectRandomSong(state, this.deps.random))) {
      this.requestMoreFromUser();
    }
  }

  selectFilter(filter: SongFilter): void {
    if (filter === this.current.state.filter) {
      return;
    }
    const previous = this.current.state;
    this.current.unsubscribe();
    const feed =
      filter === 'all'
        ? this.deps.feeds.catalog
        : this.deps.feeds.create({
            category: filter,
            title: '',
          });
    this.current = this.attach(feed, withFilter(previous, filter, feed.songs));
    this.render(previous);
    this.requestMoreFromUser();
  }

  cycleFilter(delta: 1 | -1): void {
    this.selectFilter(cycleItem(SONG_FILTERS, this.current.state.filter, delta));
  }

  play(): void {
    const { feed, state } = this.current;
    const chart = getPlayableSelection(state);
    if (chart !== null) {
      this.screen.play(chart, {
        feed,
        ...getSongSelectTarget(state),
      });
    }
  }

  openSettings(): void {
    const { feed, state } = this.current;
    this.screen.openSettings({
      feed,
      ...getSongSelectTarget(state),
    });
  }

  tick(): void {
    const { previewState } = this;
    switch (previewState.kind) {
      case 'waiting':
        if (this.deps.preview.now() - previewState.focusedAtMs >= PREVIEW_DELAY_MS) {
          void this.startPreview(previewState.song);
        }
        return;
      case 'playing':
        previewState.loop.tick();
        return;
      default:
        return;
    }
  }

  close(): void {
    this.current.unsubscribe();
    this.destroyPreviewPlayer();
    this.previewState = { kind: 'closed' };
  }

  private attach(feed: SongFeed, state: SongSelectState): ControllerState {
    return {
      feed,
      state,
      notice: getSongSelectNotice(state.songs.length, feed.status),
      unsubscribe: feed.subscribe(() => this.handleFeedChange()),
    };
  }

  private applyFromUser(transition: Transition): void {
    this.apply(transition);
    this.requestMoreFromUser();
  }

  private apply(transition: Transition): boolean {
    const previous = this.current.state;
    const next = transition(previous);
    if (next === previous) {
      return false;
    }
    this.current = {
      ...this.current,
      state: next,
    };
    this.render(previous);
    return true;
  }

  private handleFeedChange(): void {
    const { feed, state, notice } = this.current;
    const next = withSongs(state, feed.songs);
    const nextNotice = getSongSelectNotice(next.songs.length, feed.status);
    if (next !== state || nextNotice !== notice) {
      this.current = {
        ...this.current,
        state: next,
        notice: nextNotice,
      };
      this.render(state);
    }
    if (isOnLastLoadedPage(next, this.rowsPerPage)) {
      void feed.requestMore();
    }
  }

  private requestMoreFromUser(): void {
    if (isOnLastLoadedPage(this.current.state, this.rowsPerPage)) {
      void this.current.feed.requestMoreFromUser();
    }
  }

  private render(previous: SongSelectState | null): void {
    const { state, notice } = this.current;
    this.screen.render(
      {
        state,
        notice,
      },
      previous,
    );
    this.focusPreview();
  }

  private focusPreview(): void {
    const { previewState } = this;
    if (previewState.kind === 'closed') {
      return;
    }
    const { current } = this.current.state;
    const song = current.kind === 'song' ? current.song : null;
    const previewSongId = previewState.kind === 'none' ? null : previewState.song.id;
    if ((song?.id ?? null) === previewSongId) {
      return;
    }
    this.destroyPreviewPlayer();
    this.previewState =
      song === null
        ? { kind: 'none' }
        : {
            kind: 'waiting',
            song,
            focusedAtMs: this.deps.preview.now(),
          };
  }

  private async startPreview(song: Song): Promise<void> {
    const loading: PreviewState = {
      kind: 'loadingApi',
      song,
    };
    this.previewState = loading;
    const { players, now, volume } = this.deps.preview;
    try {
      await players.loadApi();
    } catch (error) {
      if (this.previewState === loading) {
        this.failPreview(song, error);
      }
      return;
    }
    if (this.previewState !== loading) {
      return;
    }

    let player: PreviewPlayer;
    const getLoop = (): PreviewLoop | null => {
      const { previewState } = this;
      return previewState.kind === 'playing' && previewState.player === player
        ? previewState.loop
        : null;
    };
    try {
      player = players.create(song.youtubeVideoId, {
        onReady: () => {
          const { previewState } = this;
          if (previewState.kind !== 'loadingPlayer' || previewState.player !== player) {
            return;
          }
          this.previewState = {
            kind: 'playing',
            song,
            player,
            loop: new PreviewLoop(player, now, {
              startMs: song.gameStartMs,
              songEndMs: song.gameEndMs,
              volume,
            }),
          };
        },
        onStateChange: (state) => getLoop()?.handleStateChange(state),
        onPositionReport: () => getLoop()?.handlePositionReport(),
        onError: (kind, code) => {
          const { previewState } = this;
          if ('player' in previewState && previewState.player === player) {
            this.failPreview(song, {
              kind,
              code,
            });
          }
        },
      });
    } catch (error) {
      this.failPreview(song, error);
      return;
    }
    this.previewState = {
      kind: 'loadingPlayer',
      song,
      player,
    };
  }

  private failPreview(song: Song, cause: unknown): void {
    console.warn('Song preview failed', song.id, cause);
    this.destroyPreviewPlayer();
    this.previewState = {
      kind: 'failed',
      song,
    };
  }

  private destroyPreviewPlayer(): void {
    if ('player' in this.previewState) {
      this.previewState.player.destroy();
    }
  }
}
