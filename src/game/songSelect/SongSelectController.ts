import { SONG_FILTERS } from '../../data/songs.js';
import type { ChartRef, SongFilter } from '../../data/songs.js';
import { cycleItem } from '../../range.js';
import type { Difficulty } from '../../rhythm/types.js';
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
}

interface ControllerState {
  readonly feed: SongFeed;
  readonly state: SongSelectState;
  readonly notice: SongSelectNotice | null;
  readonly unsubscribe: () => void;
}

type Transition = (state: SongSelectState) => SongSelectState;

export class SongSelectController {
  private current: ControllerState;

  constructor(
    private readonly feeds: SongFeeds,
    private readonly screen: SongSelectScreen,
    private readonly rowsPerPage: number,
    restore: SongSelectRestore | undefined,
  ) {
    const { feed, state } = openSongSelect(feeds.catalog, restore);
    this.current = this.attach(feed, state);
    this.render(null);
    if (restore === undefined) {
      this.requestMoreFromUser();
    }
  }

  moveSong(delta: number): void {
    this.applyFromUser((state) => moveSong(state, delta));
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

  selectFilter(filter: SongFilter): void {
    if (filter === this.current.state.filter) {
      return;
    }
    const previous = this.current.state;
    this.current.unsubscribe();
    const feed =
      filter === 'all'
        ? this.feeds.catalog
        : this.feeds.create({
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

  close(): void {
    this.current.unsubscribe();
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
    const previous = this.current.state;
    const next = transition(previous);
    if (next !== previous) {
      this.current = {
        ...this.current,
        state: next,
      };
      this.render(previous);
    }
    this.requestMoreFromUser();
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
  }
}
