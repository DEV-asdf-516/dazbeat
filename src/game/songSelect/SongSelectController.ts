import { PreviewLoop } from '../../audio/PreviewLoop.js';
import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import type { ChartTopRank, MyChartRecord } from '../../data/ranking.js';
import { SONG_FILTERS } from '../../data/songs.js';
import type { ChartLevel, ChartRef, Song, SongFilter, SongQuery } from '../../data/songs.js';
import { cycleItem } from '../../range.js';
import type { ListDirection } from '../../range.js';
import { hasElapsed } from '../../time.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import { isShallowEqual } from '../../shallowEqual.js';
import type { ChartRecords } from '../../storage/chartRecords.js';
import type { SongFeed, SongFeeds } from '../app/SongFeed.js';
import type { SongSelectRestore } from '../app/sceneRoutes.js';
import { IDLE_WHEEL } from '../ui/state/wheelRows.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import {
  clickControlsHelp,
  isControlsPanelOpen,
  readControlsKey,
  readControlsWheel,
  withControlsOpen,
} from '../app/controlsGuide.js';
import {
  blurLevelSlider,
  canSelectRandomSong,
  clearHover,
  dragLevelSlider,
  failRecords,
  focusLevelSlider,
  getPlayableSelection,
  getSliderLevelRange,
  getSongPage,
  getSongSelectNotice,
  getSongSelectQuery,
  getSongSelectRestore,
  hoverSongSelectButton,
  isLoadingMoreSongs,
  isOnLastLoadedPage,
  isSameSongQuery,
  moveDifficulty,
  moveLevelHandle,
  moveSong,
  openSongSelect,
  pressLevelSlider,
  pressSongSelectButton,
  isFeedRetryInput,
  readLevelSliderKey,
  releaseHover,
  releaseLevelSlider,
  resetLevelSlider,
  releaseRetryHover,
  releaseSongSelectButton,
  retryRecords,
  selectDifficulty,
  selectRandomSong,
  selectSong,
  setHover,
  switchLevelHandle,
  unhoverSongSelectButton,
  withFilter,
  withLevelRange,
  withLocalRecords,
  withMyRecords,
  withSongs,
  withTopRanks,
} from './state/songSelectState.js';
import type {
  SongSelectButton,
  SongSelectHover,
  SongSelectNotice,
  SongSelectState,
  SongSelectView,
} from './state/songSelectState.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';

export interface SongSelectScreen {
  render(previous: SongSelectView | null, next: SongSelectView): void;
  playSound(sound: SoundEffect): void;
  play(chart: ChartRef, restore: SongSelectRestore): void;
  openSettings(restore: SongSelectRestore): void;
  openRanking(chart: ChartRef, restore: SongSelectRestore): void;
  backToMain(): void;
  openProfile(restore: SongSelectRestore): void;
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
  readonly rankings: {
    isSignedIn(): boolean;
    loadMyTopRanks(): Promise<readonly ChartTopRank[]>;
    loadMyRecords(): Promise<readonly MyChartRecord[]>;
  };
  loadLocalRecords(): ChartRecords;
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
// 키를 이어 누르는 동안에는 목록을 받지 않고 멈춘 뒤에 한 번 받는다.
const LEVEL_COMMIT_DELAY_MS = 300;

export class SongSelectController {
  private current: ControllerOrClosed;
  private previewState: PreviewState = { kind: 'none' };
  private randomRequest: object | null = null;
  private rankingsRequest: object | null = null;
  private recordsRequest: object | null = null;
  private wheel = IDLE_WHEEL;
  private shownView: SongSelectView | null = null;
  private levelCommitAtMs: number | null = null;

  constructor(
    private readonly ports: SongSelectPorts,
    private readonly screen: SongSelectScreen,
    private readonly rowsPerPage: number,
    laneCount: LaneCount,
    restore: SongSelectRestore | undefined,
    private readonly wheelStepPx: number,
  ) {
    const { feed, state } = openSongSelect(ports.feeds.catalog, laneCount, restore);
    const isSignedIn = ports.rankings.isSignedIn();
    const first = this.attach(
      feed,
      isSignedIn ? state : withLocalRecords(state, ports.loadLocalRecords()),
    );
    this.current = first;
    this.render(first);
    this.applyLevelRangeToFeed();
    if (restore === undefined) {
      this.requestMoreFromUser();
    }
    if (isSignedIn) {
      this.requestTopRanks();
      this.requestRecords();
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
    if (current === null) {
      return;
    }
    const read = readControlsWheel(isControlsPanelOpen(current.state), this.wheel, {
      deltaYPx,
      atMs,
      rowPx: this.wheelStepPx,
    });
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

  moveDifficulty(direction: ListDirection): void {
    this.changeDifficultyFromUser((state) => moveDifficulty(state, direction));
  }

  selectDifficulty(difficulty: Difficulty): void {
    this.changeDifficultyFromUser((state) => selectDifficulty(state, difficulty));
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
    this.screen.playSound('click');
    if (feed.status !== 'hasMore' && feed.status !== 'loading') {
      this.pickRandomSong();
      return;
    }
    // 남은 곡을 받는 동안 방향키가 슬라이더 범위를 바꿔 이 요청을 취소하지 않도록 포커스를 먼저 푼다.
    this.apply(blurLevelSlider);
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
    this.screen.playSound('click');
    this.switchFeed(current, getSongSelectQuery(current.state, filter), (state, songs) =>
      withFilter(state, filter, songs),
    );
  }

  handleLevelSliderKey(action: MenuAction | null): boolean {
    const current = this.open;
    if (current === null) {
      return false;
    }
    const key = readLevelSliderKey(current.state, action);
    switch (key.kind) {
      case 'pass':
        return false;
      case 'block':
        return true;
      case 'focus':
        this.changeLevelFocus(focusLevelSlider);
        return true;
      case 'switchHandle':
        this.changeLevelFocus(switchLevelHandle);
        return true;
      case 'move':
        if (this.apply((state) => moveLevelHandle(state, key.direction))) {
          this.screen.playSound('click');
          this.levelCommitAtMs = this.ports.preview.now() + LEVEL_COMMIT_DELAY_MS;
        }
        return true;
      case 'blur':
        this.apply(blurLevelSlider);
        return true;
    }
  }

  pressLevelSlider(level: ChartLevel): void {
    this.apply((state) => pressLevelSlider(state, level));
  }

  dragLevelSlider(level: ChartLevel): void {
    this.apply((state) => dragLevelSlider(state, level));
  }

  resetLevelFilter(): void {
    if (this.apply(resetLevelSlider)) {
      this.screen.playSound('click');
      this.applyLevelRangeToFeed();
    }
  }

  releaseLevelSlider(): void {
    if (this.apply(releaseLevelSlider) && this.applyLevelRangeToFeed()) {
      this.screen.playSound('click');
    }
  }

  openControls(): void {
    this.screen.playSound('click');
    this.setControlsOpen(true);
  }

  closeControls(): void {
    this.setControlsOpen(false);
    this.screen.playSound('close');
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const current = this.open;
    if (current === null) {
      return false;
    }
    switch (readControlsKey(isControlsPanelOpen(current.state), event)) {
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
      case 'back':
        this.back();
        return;
      case 'ranking':
        this.openRanking();
        return;
      case 'retry':
        this.screen.playSound('click');
        this.requestMoreFromUser();
        return;
      case 'recordsRetry':
        this.screen.playSound('click');
        this.apply(retryRecords);
        this.requestRecords();
        return;
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
      case 'controlsHelp':
        this.screen.playSound('click');
        this.apply(clickControlsHelp);
        return;
      case 'levelReset':
        this.resetLevelFilter();
        return;
      case 'accountProfile':
        this.openProfile();
        return;
    }
  }

  cycleFilter(direction: ListDirection): void {
    const current = this.open;
    if (current !== null) {
      this.selectFilter(cycleItem(SONG_FILTERS, current.state.filter, direction));
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
      this.screen.playSound('click');
      this.screen.play(chart, getSongSelectRestore(state, feed));
      return;
    }
    if (isFeedRetryInput(state, feed.status)) {
      this.requestMoreFromUser();
    }
  }

  openRanking(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const { feed, state } = current;
    const chart = getPlayableSelection(state);
    if (chart !== null) {
      this.screen.playSound('click');
      this.screen.openRanking(chart, getSongSelectRestore(state, feed));
      return;
    }
    if (isFeedRetryInput(state, feed.status)) {
      this.requestMoreFromUser();
    }
  }

  private openProfile(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const { feed, state } = current;
    this.screen.playSound('click');
    this.screen.openProfile(getSongSelectRestore(state, feed));
  }

  openSettings(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const { feed, state } = current;
    this.screen.playSound('click');
    this.screen.openSettings(getSongSelectRestore(state, feed));
  }

  back(): void {
    if (this.open === null) {
      return;
    }
    this.screen.playSound('close');
    this.screen.backToMain();
  }

  tick(): void {
    const { levelCommitAtMs } = this;
    if (levelCommitAtMs !== null && this.ports.preview.now() >= levelCommitAtMs) {
      this.levelCommitAtMs = null;
      this.applyLevelRangeToFeed();
    }
    const { previewState } = this;
    switch (previewState.kind) {
      case 'waiting':
        if (hasElapsed(previewState.focusedAtMs, this.ports.preview.now(), PREVIEW_DELAY_MS)) {
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
    this.rankingsRequest = null;
    this.recordsRequest = null;
    this.levelCommitAtMs = null;
    current.unsubscribe();
    this.destroyPreviewPlayer();
    this.previewState = { kind: 'none' };
    this.current = { kind: 'closed' };
  }

  // TOP 표시는 선택 리소스라 실패해도 표시 없이 계속한다.
  private requestTopRanks(): void {
    const request = {};
    this.rankingsRequest = request;
    void this.ports.rankings.loadMyTopRanks().then(
      (ranked) => {
        if (this.rankingsRequest === request) {
          this.apply((state) => withTopRanks(state, ranked));
        }
      },
      (error: unknown) => {
        if (this.rankingsRequest === request) {
          console.warn('Failed to load my top ranks', error);
        }
      },
    );
  }

  private requestRecords(): void {
    const request = {};
    this.recordsRequest = request;
    void this.ports.rankings.loadMyRecords().then(
      (items) => {
        if (this.recordsRequest === request) {
          this.apply((state) => withMyRecords(state, items));
        }
      },
      (error: unknown) => {
        if (this.recordsRequest === request) {
          console.warn('Failed to load my records', error);
          this.apply(failRecords);
        }
      },
    );
  }

  // 다 받기 전에 실패했으면 받아 둔 곡에서 고르고, 실패 알림이 다시 받기를 안내한다.
  private pickRandomSong(): void {
    if (this.apply((state) => selectRandomSong(state, this.ports.random))) {
      this.requestMoreFromUser();
    }
  }

  private changeLevelFocus(transition: Transition): void {
    if (this.apply(transition)) {
      this.screen.playSound('menuFocus');
    }
  }

  private applyLevelRangeToFeed(): boolean {
    const current = this.open;
    if (current === null) {
      return false;
    }
    const query = getSongSelectQuery(current.state, current.state.filter);
    if (isSameSongQuery(query, current.feed.query)) {
      return false;
    }
    this.switchFeed(current, query, (state, songs) =>
      withLevelRange(state, getSliderLevelRange(state), songs),
    );
    return true;
  }

  private switchFeed(
    current: ControllerState,
    query: SongQuery,
    transition: (state: SongSelectState, songs: readonly Song[]) => SongSelectState,
  ): void {
    this.randomRequest = null;
    this.levelCommitAtMs = null;
    current.unsubscribe();
    const feed = this.ports.feeds.create(query);
    this.commit(
      this.attach(
        feed,
        releaseRetryHover(
          releaseHover(transition(current.state, feed.songs), this.rowsPerPage),
          feed.status,
        ),
      ),
    );
    this.requestMoreFromUser();
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
      this.screen.playSound('menuFocus');
    }
    this.requestMoreFromUser();
  }

  private changeDifficultyFromUser(transition: Transition): void {
    if (this.apply(transition)) {
      this.screen.playSound('click');
    }
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
    const next = releaseRetryHover(
      releaseHover(withSongs(state, feed.songs), this.rowsPerPage),
      feed.status,
    );
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
