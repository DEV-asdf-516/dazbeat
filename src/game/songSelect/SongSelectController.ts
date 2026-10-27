import { PreviewLoop } from '../../audio/PreviewLoop.js';
import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import { SONG_FILTERS } from '../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../data/songs.js';
import { cycleItem } from '../../range.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import { isShallowEqual } from '../../shallowEqual.js';
import type { SongFeed, SongFeeds } from '../SongFeed.js';
import type { SongSelectRestore } from '../sceneRoutes.js';
import {
  canSelectRandomSong,
  clearHover,
  getPlayableSelection,
  getSongPage,
  getSongSelectNotice,
  getSongSelectTarget,
  isLoadingMoreSongs,
  isOnLastLoadedPage,
  moveDifficulty,
  moveSong,
  openSongSelect,
  releaseHover,
  selectDifficulty,
  selectRandomSong,
  selectSong,
  setHover,
  withFilter,
  withSongs,
} from './songSelectState.js';
import type { SongSelectHover, SongSelectNotice, SongSelectState } from './songSelectState.js';

export interface SongSelectView {
  readonly state: SongSelectState;
  readonly notice: SongSelectNotice | null;
  readonly isLoadingMore: boolean;
  /** 아직 받지 않은 곡까지 포함한 목록 전체 곡 수. 페이지 수 표시에 쓴다. */
  readonly songCount: number;
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
  readonly isLoadingMore: boolean;
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

const PREVIEW_DELAY_MS = 200;

export class SongSelectController {
  private current: ControllerState;
  private previewState: PreviewState = { kind: 'none' };
  private randomRequest: object | null = null;

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
    this.focusSongFromUser((state) => moveSong(state, delta));
  }

  selectRow(slot: number): void {
    this.focusSongFromUser((state) =>
      selectSong(state, getSongPage(state, this.rowsPerPage).startIndex + slot),
    );
  }

  moveDifficulty(delta: 1 | -1): void {
    this.applyFromUser((state) => moveDifficulty(state, delta));
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.applyFromUser((state) => selectDifficulty(state, difficulty));
  }

  // 비활성 RANDOM 이 실패한 feed 를 다시 부르지 않도록 고를 곡이 없으면 아무것도 요청하지 않는다.
  selectRandomSong(): void {
    const { feed, state } = this.current;
    if (!canSelectRandomSong(state)) {
      return;
    }
    if (feed.status !== 'hasMore' && feed.status !== 'loading') {
      this.pickRandomSong();
      return;
    }
    // 리듬게임 관례대로 받아 둔 곡이 아니라 필터의 곡 전체에서 고르도록 남은 곡을 다 받은 뒤 고른다.
    const request = {};
    this.randomRequest = request;
    void feed.requestRemaining().then(() => {
      if (this.randomRequest === request) {
        this.randomRequest = null;
        this.pickRandomSong();
      }
    });
  }

  selectFilter(filter: SongFilter): void {
    if (filter === this.current.state.filter) {
      return;
    }
    const previous = this.current.state;
    this.randomRequest = null;
    this.current.unsubscribe();
    const feed =
      filter === 'all'
        ? this.deps.feeds.catalog
        : this.deps.feeds.create({
            category: filter,
            title: '',
          });
    this.current = this.attach(
      feed,
      releaseHover(withFilter(previous, filter, feed.songs), this.rowsPerPage),
    );
    this.render(previous);
    this.requestMoreFromUser();
  }

  hover(target: SongSelectHover): void {
    this.apply((state) => setHover(state, target));
  }

  unhover(target: SongSelectHover): void {
    this.apply((state) => clearHover(state, target));
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
    this.randomRequest = null;
    this.current.unsubscribe();
    this.destroyPreviewPlayer();
    this.previewState = { kind: 'closed' };
  }

  // 다 받기 전에 실패했으면 받아 둔 곡에서 고르고, 실패 알림이 다시 받기를 안내한다.
  private pickRandomSong(): void {
    if (this.apply((state) => selectRandomSong(state, this.deps.random))) {
      this.requestMoreFromUser();
    }
  }

  private attach(feed: SongFeed, state: SongSelectState): ControllerState {
    return {
      feed,
      state,
      notice: getSongSelectNotice(state.songs.length, feed.status),
      isLoadingMore: isLoadingMoreSongs(state.songs.length, feed.status),
      unsubscribe: feed.subscribe(() => this.handleFeedChange()),
    };
  }

  /** 키 이동과 목록 클릭은 같은 곡 포커스 이동이라 곡이 바뀔 때 같은 효과음을 낸다. */
  private focusSongFromUser(transition: Transition): void {
    if (this.apply(transition)) {
      this.screen.playFocusSound();
    }
    this.requestMoreFromUser();
  }

  private applyFromUser(transition: Transition): void {
    this.apply(transition);
    this.requestMoreFromUser();
  }

  private apply(transition: Transition): boolean {
    const previous = this.current.state;
    const next = releaseHover(transition(previous), this.rowsPerPage);
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
    const { feed, state } = this.current;
    const next = releaseHover(withSongs(state, feed.songs), this.rowsPerPage);
    const nextCurrent = {
      ...this.current,
      state: next,
      notice: getSongSelectNotice(next.songs.length, feed.status),
      isLoadingMore: isLoadingMoreSongs(next.songs.length, feed.status),
    };
    if (!isShallowEqual(nextCurrent, this.current)) {
      this.current = nextCurrent;
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
    const { feed, state, notice, isLoadingMore } = this.current;
    this.screen.render(
      {
        state,
        notice,
        isLoadingMore,
        songCount: feed.songCount,
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
    let player: PreviewPlayer;
    const getLoop = (): PreviewLoop | null => {
      const { previewState } = this;
      return previewState.kind === 'playing' && previewState.player === player
        ? previewState.loop
        : null;
    };
    try {
      await players.loadApi();
      if (this.previewState !== loading) {
        return;
      }
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
      if (this.previewState === loading) {
        this.failPreview(song, error);
      }
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
