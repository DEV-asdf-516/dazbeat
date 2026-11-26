import { PreviewLoop } from '../../audio/PreviewLoop.js';
import type { YouTubePlayer, YouTubePlayerHandlers } from '../../audio/YouTubePlayer.js';
import type { AuthUser } from '../../data/account.js';
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
  completeSongSelectSignIn,
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
  renderAccount(): void;
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
  signIn(): Promise<AuthUser | null>;
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
  private readonly isRestored: boolean;
  private readonly isSignedIn: boolean;

  constructor(
    private readonly ports: SongSelectPorts,
    private readonly screen: SongSelectScreen,
    private readonly rowsPerPage: number,
    laneCount: LaneCount,
    restore: SongSelectRestore | undefined,
    private readonly wheelStepPx: number,
  ) {
    const { feed, state } = openSongSelect(ports.feeds.catalog, laneCount, restore);
    this.isRestored = restore !== undefined;
    this.isSignedIn = ports.rankings.isSignedIn();
    this.current = this.attach(
      feed,
      this.isSignedIn ? state : withLocalRecords(state, ports.loadLocalRecords()),
    );
  }

  get view(): SongSelectView {
    if (this.shownView === null) {
      throw new Error('Song select is not rendered');
    }
    return this.shownView;
  }

  // 씬의 render 가 생성자 뒤에 만드는 위젯을 그리므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const switched = this.switchToLevelRangeFeed(current);
    const first = switched ?? current;
    this.current = first;
    const view: SongSelectView = {
      state: first.state,
      notice: first.notice,
      isLoadingMore: first.isLoadingMore,
      songCount: first.feed.songCount,
    };
    this.screen.render(null, view);
    this.shownView = view;
    this.focusPreview(first.state);
    if (switched !== null || !this.isRestored) {
      this.requestMoreFromUser();
    }
    if (this.isSignedIn) {
      this.requestTopRanks();
      this.requestRecords();
    }
  }

  /** 키 이동과 목록 클릭은 같은 곡 포커스 이동이라 곡이 바뀔 때 같은 효과음을 낸다. */
  moveSong(delta: number): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    if (this.apply(this.withState(current, moveSong(current.state, delta)))) {
      this.screen.playSound('menuFocus');
    }
    this.requestMoreFromUser();
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
    if (read.rows === 0) {
      return;
    }
    if (this.apply(this.withState(current, moveSong(current.state, read.rows)))) {
      this.screen.playSound('menuFocus');
    }
    this.requestMoreFromUser();
  }

  selectRow(slot: number): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const { state } = current;
    const next = selectSong(state, getSongPage(state, this.rowsPerPage).startIndex + slot);
    if (this.apply(this.withState(current, next))) {
      this.screen.playSound('menuFocus');
    }
    this.requestMoreFromUser();
  }

  moveDifficulty(direction: ListDirection): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    if (this.apply(this.withState(current, moveDifficulty(current.state, direction)))) {
      this.screen.playSound('click');
    }
    this.requestMoreFromUser();
  }

  selectDifficulty(difficulty: Difficulty): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    if (this.apply(this.withState(current, selectDifficulty(current.state, difficulty)))) {
      this.screen.playSound('click');
    }
    this.requestMoreFromUser();
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
      // 다 받기 전에 실패했으면 받아 둔 곡에서 고르고, 실패 알림이 다시 받기를 안내한다.
      if (this.apply(this.withState(current, selectRandomSong(state, this.ports.random)))) {
        this.requestMoreFromUser();
      }
      return;
    }
    // 남은 곡을 받는 동안 방향키가 슬라이더 범위를 바꿔 이 요청을 취소하지 않도록 포커스를 먼저 푼다.
    this.apply(this.withState(current, blurLevelSlider(state)));
    // 리듬게임 관례대로 받아 둔 곡이 아니라 필터의 곡 전체에서 고르도록 남은 곡을 다 받은 뒤 고른다.
    const request = {};
    this.randomRequest = request;
    void feed.requestRemaining().then(() => {
      const picking = this.open;
      if (this.randomRequest !== request || picking === null) {
        return;
      }
      this.randomRequest = null;
      if (this.apply(this.withState(picking, selectRandomSong(picking.state, this.ports.random)))) {
        this.requestMoreFromUser();
      }
    });
  }

  selectFilter(filter: SongFilter): void {
    const current = this.open;
    if (current === null || filter === current.state.filter) {
      return;
    }
    this.screen.playSound('click');
    this.apply(
      this.switchFeed(current, getSongSelectQuery(current.state, filter), (state, songs) =>
        withFilter(state, filter, songs),
      ),
    );
    this.requestMoreFromUser();
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
        if (this.apply(this.withState(current, focusLevelSlider(current.state)))) {
          this.screen.playSound('menuFocus');
        }
        return true;
      case 'switchHandle':
        if (this.apply(this.withState(current, switchLevelHandle(current.state)))) {
          this.screen.playSound('menuFocus');
        }
        return true;
      case 'move':
        if (this.apply(this.withState(current, moveLevelHandle(current.state, key.direction)))) {
          this.screen.playSound('click');
          this.levelCommitAtMs = this.ports.preview.now() + LEVEL_COMMIT_DELAY_MS;
        }
        return true;
      case 'blur':
        this.apply(this.withState(current, blurLevelSlider(current.state)));
        return true;
    }
  }

  pressLevelSlider(level: ChartLevel): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(this.withState(current, pressLevelSlider(current.state, level)));
  }

  dragLevelSlider(level: ChartLevel): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(this.withState(current, dragLevelSlider(current.state, level)));
  }

  resetLevelFilter(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const reset = this.withState(current, resetLevelSlider(current.state));
    if (reset.state === current.state) {
      return;
    }
    const switched = this.switchToLevelRangeFeed(reset);
    this.apply(switched ?? reset);
    this.screen.playSound('click');
    if (switched !== null) {
      this.requestMoreFromUser();
    }
  }

  releaseLevelSlider(): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const released = this.withState(current, releaseLevelSlider(current.state));
    if (released.state === current.state) {
      return;
    }
    const switched = this.switchToLevelRangeFeed(released);
    this.apply(switched ?? released);
    if (switched !== null) {
      this.screen.playSound('click');
      this.requestMoreFromUser();
    }
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const current = this.open;
    if (current === null) {
      return false;
    }
    switch (readControlsKey(isControlsPanelOpen(current.state), event)) {
      case 'open':
        this.apply(this.withState(current, withControlsOpen(current.state, true)));
        this.screen.playSound('click');
        return true;
      case 'close':
        this.apply(this.withState(current, withControlsOpen(current.state, false)));
        this.screen.playSound('close');
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  hover(target: SongSelectHover): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(this.withState(current, setHover(current.state, target)));
  }

  unhover(target: SongSelectHover): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(this.withState(current, clearHover(current.state, target)));
  }

  hoverFilterTab(filter: SongFilter): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(
      this.withState(
        current,
        setHover(current.state, {
          kind: 'filter',
          filter,
        }),
      ),
    );
  }

  unhoverFilterTab(filter: SongFilter): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(
      this.withState(
        current,
        clearHover(current.state, {
          kind: 'filter',
          filter,
        }),
      ),
    );
  }

  hoverDifficultyTab(difficulty: Difficulty): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(
      this.withState(
        current,
        setHover(current.state, {
          kind: 'difficulty',
          difficulty,
        }),
      ),
    );
  }

  unhoverDifficultyTab(difficulty: Difficulty): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(
      this.withState(
        current,
        clearHover(current.state, {
          kind: 'difficulty',
          difficulty,
        }),
      ),
    );
  }

  pointerOver(button: SongSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(this.withState(current, hoverSongSelectButton(current.state, button)));
  }

  pointerOut(button: SongSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(this.withState(current, unhoverSongSelectButton(current.state, button)));
  }

  pointerDown(button: SongSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    this.apply(this.withState(current, pressSongSelectButton(current.state, button)));
  }

  pointerUp(button: SongSelectButton): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const released = this.withState(current, releaseSongSelectButton(current.state, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released.state === current.state) {
      return;
    }
    const { feed, state } = released;
    switch (button) {
      case 'settings':
        this.apply(released);
        this.screen.playSound('click');
        this.screen.openSettings(getSongSelectRestore(state, feed));
        return;
      case 'back':
        this.apply(released);
        this.screen.playSound('close');
        this.screen.backToMain();
        return;
      case 'ranking': {
        this.apply(released);
        const chart = getPlayableSelection(state);
        if (chart !== null) {
          this.screen.playSound('click');
          this.screen.openRanking(chart, getSongSelectRestore(state, feed));
          return;
        }
        if (isFeedRetryInput(state, feed.status)) {
          this.requestMoreFromUser();
        }
        return;
      }
      case 'retry':
        this.apply(released);
        this.screen.playSound('click');
        this.requestMoreFromUser();
        return;
      case 'recordsRetry':
        this.apply(this.withState(released, retryRecords(state)));
        this.screen.playSound('click');
        this.requestRecords();
        return;
      case 'controlsEntry':
        this.apply(this.withState(released, withControlsOpen(state, true)));
        this.screen.playSound('click');
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.apply(this.withState(released, withControlsOpen(state, false)));
        this.screen.playSound('close');
        return;
      case 'controlsHelp':
        this.apply(this.withState(released, clickControlsHelp(state)));
        this.screen.playSound('click');
        return;
      case 'levelReset': {
        const reset = this.withState(released, resetLevelSlider(state));
        if (reset.state === state) {
          this.apply(released);
          return;
        }
        const switched = this.switchToLevelRangeFeed(reset);
        this.apply(switched ?? reset);
        this.screen.playSound('click');
        if (switched !== null) {
          this.requestMoreFromUser();
        }
        return;
      }
      case 'accountProfile':
        this.apply(released);
        this.screen.playSound('click');
        this.screen.openProfile(getSongSelectRestore(state, feed));
        return;
      case 'accountSignIn':
        this.apply(released);
        this.signIn();
        return;
    }
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  private signIn(): void {
    this.screen.playSound('click');
    void this.ports
      .signIn()
      .then((user) => {
        const current = this.open;
        if (user === null || current === null) {
          return;
        }
        this.screen.renderAccount();
        this.apply(this.withState(current, completeSongSelectSignIn(current.state)));
        this.requestTopRanks();
        this.requestRecords();
      })
      .catch((error: unknown) => {
        console.error('Failed to sign in with Google', error);
      });
  }

  cycleFilter(direction: ListDirection): void {
    const current = this.open;
    if (current === null) {
      return;
    }
    const filter = cycleItem(SONG_FILTERS, current.state.filter, direction);
    if (filter === current.state.filter) {
      return;
    }
    this.screen.playSound('click');
    this.apply(
      this.switchFeed(current, getSongSelectQuery(current.state, filter), (state, songs) =>
        withFilter(state, filter, songs),
      ),
    );
    this.requestMoreFromUser();
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
    this.screen.playSound('close');
    this.screen.backToMain();
  }

  tick(): void {
    const { levelCommitAtMs } = this;
    const current = this.open;
    if (
      levelCommitAtMs !== null &&
      current !== null &&
      this.ports.preview.now() >= levelCommitAtMs
    ) {
      this.levelCommitAtMs = null;
      const switched = this.switchToLevelRangeFeed(current);
      if (switched !== null) {
        this.apply(switched);
        this.requestMoreFromUser();
      }
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
        const current = this.open;
        if (this.rankingsRequest === request && current !== null) {
          this.apply(this.withState(current, withTopRanks(current.state, ranked)));
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
        const current = this.open;
        if (this.recordsRequest === request && current !== null) {
          this.apply(this.withState(current, withMyRecords(current.state, items)));
        }
      },
      (error: unknown) => {
        const current = this.open;
        if (this.recordsRequest === request && current !== null) {
          console.warn('Failed to load my records', error);
          this.apply(this.withState(current, failRecords(current.state)));
        }
      },
    );
  }

  private switchToLevelRangeFeed(current: ControllerState): ControllerState | null {
    const query = getSongSelectQuery(current.state, current.state.filter);
    if (isSameSongQuery(query, current.feed.query)) {
      return null;
    }
    return this.switchFeed(current, query, (state, songs) =>
      withLevelRange(state, getSliderLevelRange(state), songs),
    );
  }

  private switchFeed(
    current: ControllerState,
    query: SongQuery,
    transition: (state: SongSelectState, songs: readonly Song[]) => SongSelectState,
  ): ControllerState {
    this.randomRequest = null;
    this.levelCommitAtMs = null;
    current.unsubscribe();
    const feed = this.ports.feeds.create(query);
    return this.attach(
      feed,
      releaseRetryHover(
        releaseHover(transition(current.state, feed.songs), this.rowsPerPage),
        feed.status,
      ),
    );
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

  private withState(current: ControllerState, state: SongSelectState): ControllerState {
    return {
      ...current,
      state: releaseHover(state, this.rowsPerPage),
    };
  }

  // 닫힌 뒤이거나 바뀐 게 없으면 아무것도 하지 않는다.
  private apply(next: ControllerState): boolean {
    const current = this.open;
    if (current === null || isShallowEqual(next, current)) {
      return false;
    }
    this.current = next;
    const view: SongSelectView = {
      state: next.state,
      notice: next.notice,
      isLoadingMore: next.isLoadingMore,
      songCount: next.feed.songCount,
    };
    this.screen.render(this.shownView, view);
    this.shownView = view;
    this.focusPreview(next.state);
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
    this.apply({
      ...current,
      state: next,
      notice: getSongSelectNotice(next.songs.length, feed.status),
      isLoadingMore: isLoadingMoreSongs(next.songs.length, feed.status),
    });
    if (isOnLastLoadedPage(next, this.rowsPerPage)) {
      void feed.requestMore();
    }
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
