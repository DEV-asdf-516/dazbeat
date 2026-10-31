import { PreviewLoop } from '../../audio/PreviewLoop.js';
import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import { SONG_FILTERS } from '../../data/songs.js';
import type { ChartRef, Song, SongFilter } from '../../data/songs.js';
import { cycleItem } from '../../range.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import { isShallowEqual } from '../../shallowEqual.js';
import type { ChartRecords } from '../../storage/chartRecords.js';
import type { SongFeed, SongFeeds } from '../app/SongFeed.js';
import type { SongSelectRestore } from '../app/sceneRoutes.js';
import { IDLE_WHEEL, readWheelRows } from '../ui/state/wheelRows.js';
import { readControlsKey, withControlsOpen } from '../app/controlsGuide.js';
import {
  canSelectRandomSong,
  clearHover,
  getPlayableSelection,
  getSongPage,
  getSongSelectNotice,
  getSongSelectTarget,
  hoverSongSelectButton,
  isLoadingMoreSongs,
  isOnLastLoadedPage,
  moveDifficulty,
  moveSong,
  openSongSelect,
  pressSongSelectButton,
  releaseHover,
  releaseSongSelectButton,
  selectDifficulty,
  selectRandomSong,
  selectSong,
  setHover,
  unhoverSongSelectButton,
  withFilter,
  withSongs,
} from './state/songSelectState.js';
import type {
  SongSelectButton,
  SongSelectHover,
  SongSelectNotice,
  SongSelectState,
  SongSelectView,
} from './state/songSelectState.js';

export interface SongSelectScreen {
  render(previous: SongSelectView | null, next: SongSelectView): void;
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

// 닫힌 뒤에는 입력과 늦은 결과를 받지 않는다.
type ControllerOrClosed = ControllerState | { readonly kind: 'closed' };

export type PreviewPlayer = Pick<YouTubePlayer, 'requestPlay' | 'setVolume' | 'destroy'>;

export interface PreviewPlayerFactory {
  loadApi(): Promise<void>;
  create(videoId: string, handlers: YouTubePlayerHandlers): PreviewPlayer;
}

export interface SongPreviewPorts {
  readonly players: PreviewPlayerFactory;
  readonly now: () => number;
  readonly volume: number;
}

export interface SongSelectPorts {
  readonly feeds: SongFeeds;
  readonly random: () => number;
  readonly preview: SongPreviewPorts;
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
  | { readonly kind: 'failed'; readonly song: Song };

type Transition = (state: SongSelectState) => SongSelectState;

const PREVIEW_DELAY_MS = 200;

export class SongSelectController {
  private current: ControllerOrClosed;
  private previewState: PreviewState = { kind: 'none' };
  private randomRequest: object | null = null;
  private wheel = IDLE_WHEEL;
  private shownView: SongSelectView | null = null;

  constructor(
    private readonly ports: SongSelectPorts,
    private readonly screen: SongSelectScreen,
    private readonly rowsPerPage: number,
    laneCount: LaneCount,
    restore: SongSelectRestore | undefined,
    private readonly records: ChartRecords,
    private readonly wheelStepPx: number,
  ) {
    const { feed, state } = openSongSelect(ports.feeds.catalog, laneCount, restore);
    const first = this.attach(feed, state);
    this.current = first;
    this.render(first);
    if (restore === undefined) {
      this.requestMoreFromUser();
    }
  }

  get view(): SongSelectView {
    if (this.shownView === null) {
      throw new Error('Song select is not rendered');
    }
    return this.shownView;
  }

  moveSong(delta: number): void {
    this.focusSongFromUser((state) => moveSong(state, delta));
  }

  scrollByWheel(deltaYPx: number, atMs: number): void {
    const current = this.open;
    if (current === null || current.state.isControlsOpen) {
      return;
    }
    const read = readWheelRows(this.wheel, deltaYPx, atMs, this.wheelStepPx);
    this.wheel = read.gesture;
    if (read.rows !== 0) {
      this.moveSong(read.rows);
    }
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
    const current = this.open;
    if (current === null) {
      return;
    }
    const { feed, state } = current;
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
    const current = this.open;
    if (current === null || filter === current.state.filter) {
      return;
    }
    const previous = current.state;
    this.randomRequest = null;
    current.unsubscribe();
    const feed = this.ports.feeds.create({
      category: filter,
      title: '',
    });
    this.commit(
      this.attach(feed, releaseHover(withFilter(previous, filter, feed.songs), this.rowsPerPage)),
    );
    this.requestMoreFromUser();
  }

  openControls(): void {
    this.setControlsOpen(true);
  }

  closeControls(): void {
    this.setControlsOpen(false);
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const current = this.open;
    if (current === null) {
      return false;
    }
    switch (readControlsKey(current.state.isControlsOpen, event)) {
      case 'open':
        this.openControls();
        return true;
      case 'close':
        this.closeControls();
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  hover(target: SongSelectHover): void {
    this.apply((state) => setHover(state, target));
  }

  unhover(target: SongSelectHover): void {
    this.apply((state) => clearHover(state, target));
  }

  pointerOver(button: SongSelectButton): void {
    this.apply((state) => hoverSongSelectButton(state, button));
  }

  pointerOut(button: SongSelectButton): void {
    this.apply((state) => unhoverSongSelectButton(state, button));
  }

  pointerDown(button: SongSelectButton): void {
    this.apply((state) => pressSongSelectButton(state, button));
  }

  pointerUp(button: SongSelectButton): void {
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (!this.apply((state) => releaseSongSelectButton(state, button))) {
      return;
    }
    switch (button) {
      case 'settings':
        this.openSettings();
        return;
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
    }
  }

  cycleFilter(delta: 1 | -1): void {
    const current = this.open;
    if (current !== null) {
      this.selectFilter(cycleItem(SONG_FILTERS, current.state.filter, delta));
    }
  }

  play(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const { feed, state } = current;
    const chart = getPlayableSelection(state);
    if (chart !== null) {
      this.screen.play(chart, {
        feed,
        ...getSongSelectTarget(state),
      });
    }
  }

  openSettings(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const { feed, state } = current;
    this.screen.openSettings({
      feed,
      ...getSongSelectTarget(state),
    });
  }

  tick(): void {
    const { previewState } = this;
    switch (previewState.kind) {
      case 'waiting':
        if (this.ports.preview.now() - previewState.focusedAtMs >= PREVIEW_DELAY_MS) {
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
    const current = this.open;
    if (current === null) {
      return;
    }
    this.randomRequest = null;
    current.unsubscribe();
    this.destroyPreviewPlayer();
    this.previewState = { kind: 'none' };
    this.current = { kind: 'closed' };
  }

  // 다 받기 전에 실패했으면 받아 둔 곡에서 고르고, 실패 알림이 다시 받기를 안내한다.
  private pickRandomSong(): void {
    if (this.apply((state) => selectRandomSong(state, this.ports.random))) {
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
    const current = this.open;
    if (current === null) {
      return false;
    }
    return this.commit({
      ...current,
      state: releaseHover(transition(current.state), this.rowsPerPage),
    });
  }

  // 닫힌 뒤이거나 바뀐 게 없으면 아무것도 하지 않는다.
  private commit(next: ControllerState): boolean {
    const current = this.open;
    if (current === null || isShallowEqual(next, current)) {
      return false;
    }
    this.current = next;
    this.render(next);
    return true;
  }

  private handleFeedChange(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const { feed, state } = current;
    const next = releaseHover(withSongs(state, feed.songs), this.rowsPerPage);
    this.commit({
      ...current,
      state: next,
      notice: getSongSelectNotice(next.songs.length, feed.status),
      isLoadingMore: isLoadingMoreSongs(next.songs.length, feed.status),
    });
    if (isOnLastLoadedPage(next, this.rowsPerPage)) {
      void feed.requestMore();
    }
  }

  private setControlsOpen(isControlsOpen: boolean): void {
    this.apply((state) => withControlsOpen(state, isControlsOpen));
  }

  private get open(): ControllerState | null {
    return 'kind' in this.current ? null : this.current;
  }

  private requestMoreFromUser(): void {
    const current = this.open;
    if (current !== null && isOnLastLoadedPage(current.state, this.rowsPerPage)) {
      void current.feed.requestMoreFromUser();
    }
  }

  private render(current: ControllerState): void {
    const { feed, state, notice, isLoadingMore } = current;
    const next: SongSelectView = {
      state,
      notice,
      isLoadingMore,
      songCount: feed.songCount,
      records: this.records,
    };
    this.screen.render(this.shownView, next);
    this.shownView = next;
    this.focusPreview(state);
  }

  private focusPreview(state: SongSelectState): void {
    const { previewState } = this;
    const { current } = state;
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
            focusedAtMs: this.ports.preview.now(),
          };
  }

  private async startPreview(song: Song): Promise<void> {
    const loading: PreviewState = {
      kind: 'loadingApi',
      song,
    };
    this.previewState = loading;
    const { players, now, volume } = this.ports.preview;
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
              startMs: song.previewStartMs ?? song.gameStartMs,
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
