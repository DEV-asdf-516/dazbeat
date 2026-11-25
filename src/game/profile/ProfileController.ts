import type { AchievementId, AchievementSet } from '../../data/achievements.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import type { Nickname } from '../../data/nickname.js';
import type { Profile } from '../../data/profile.js';
import type { RankedChartPage, RankedChartQuery } from '../../data/ranking.js';
import {
  clickControlsHelp,
  isControlsPanelOpen,
  readControlsKey,
  readControlsWheel,
  withControlsOpen,
} from '../app/controlsGuide.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import { IDLE_WHEEL } from '../ui/state/wheelRows.js';
import {
  applyRankings,
  changeNicknameInput,
  clearHover,
  closeAccountDeletion,
  createProfileScreen,
  failAccountDeletion,
  failFeaturedSave,
  failNicknameEdit,
  failRankings,
  getRankingsQuery,
  clearRankingFilters,
  cycleRankingDifficulty,
  selectRankingDifficulty,
  selectRankingLane,
  toggleRankingSort,
  focusAccountDeletion,
  goBack,
  getFocusMoveSound,
  hasStartedRankingsLoad,
  hoverProfileButton,
  isEditingNickname,
  loadedState,
  moveFocus,
  openAccountDeletion,
  pressProfileButton,
  readAccountDeletionKey,
  readProfileConfirm,
  releaseProfileButton,
  retryRankings,
  markRankingsSlow,
  saveFeatured,
  saveNickname,
  scrollRankings,
  selectFocused,
  selectSet,
  selectSummaryTab,
  setHover,
  startAccountDeletion,
  startFeaturedSave,
  submitNicknameInput,
  switchSet,
  toLoadFailurePage,
  withCollection,
  toNicknameFailure,
  unhoverProfileButton,
  withPage,
} from './state/profileState.js';
import type {
  FocusDirection,
  LoadedProfileState,
  ProfileButton,
  ProfileScreenState,
  ProfileState,
  ProfileTarget,
  SummaryFocus,
  SummaryTab,
} from './state/profileState.js';
import type { SoundEffect } from '../ui/view/soundEffects.js';
import type { ListDirection } from '../../range.js';

export interface ProfilePorts {
  signOut(): void;
  isSignedIn(): boolean;
  loadProfile(): Promise<Profile>;
  changeNickname(nickname: Nickname): Promise<Nickname>;
  isNicknameAvailable(nickname: Nickname): Promise<boolean>;
  wait(delayMs: number): Promise<void>;
  setFeaturedAchievement(id: AchievementId | null): Promise<AchievementId | null>;
  deleteAccount(): Promise<void>;
  loadMyRankings(query: RankedChartQuery): Promise<RankedChartPage>;
}

export interface ProfileScreen {
  render(previous: ProfileScreenState | null, next: ProfileScreenState): void;
  playSound(sound: SoundEffect): void;
  leave(): void;
  leaveToMain(): void;
}

// 타이핑이 멈춘 뒤에만 물어 글자마다 요청하지 않는다.
const NICKNAME_CHECK_DELAY_MS = 300;
// 이보다 빨리 오는 응답은 로딩을 드러내지 않고 목록만 바꿔 깜박임을 없앤다.
const RANKINGS_SLOW_DELAY_MS = 300;

const GUEST_PAGE: ProfileState = { kind: 'guest' };
const LOADING_PAGE: ProfileState = { kind: 'loading' };

// 시작 전에는 그린 것이 없어 첫 render 의 직전 state 가 없다.
// 닫힌 뒤에는 입력과 늦은 결과를 받지 않는다.
type ControllerState =
  { readonly kind: 'unstarted' } | ProfileScreenState | { readonly kind: 'closed' };

export class ProfileController {
  private state: ControllerState = { kind: 'unstarted' };
  private loadToken: object | null = null;
  private nicknameToken: object | null = null;
  private nicknameCheckToken: object | null = null;
  private featuredToken: object | null = null;
  private rankingsToken: object | null = null;
  private wheel = IDLE_WHEEL;
  private deletionToken: object | null = null;

  constructor(
    private readonly ports: ProfilePorts,
    private readonly screen: ProfileScreen,
    private readonly wheelStepPx: number,
  ) {}

  // 씬의 render 가 controller 를 참조하므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    const isSignedIn = this.ports.isSignedIn();
    const first = createProfileScreen(isSignedIn ? LOADING_PAGE : GUEST_PAGE);
    this.state = first;
    this.screen.render(null, first);
    if (isSignedIn) {
      this.load();
    }
  }

  confirm(): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    const confirm = readProfileConfirm(screen.page);
    switch (confirm.kind) {
      case 'none':
        return;
      case 'retryLoad':
        this.apply(withPage(screen, LOADING_PAGE));
        this.load();
        return;
      case 'retryRankings': {
        const retrying = retryRankings(confirm.state);
        this.apply(withPage(screen, retrying));
        this.loadRankings(retrying);
        return;
      }
      case 'select': {
        const { page } = screen;
        if (page.kind !== 'loaded') {
          return;
        }
        const selection = selectFocused(page);
        switch (selection.kind) {
          case 'none':
            return;
          case 'state':
            this.apply(withPage(screen, selection.state));
            if (selection.hasMovedFocus) {
              this.screen.playSound('menuFocus');
            }
            return;
          case 'saveFeatured': {
            this.apply(withPage(screen, startFeaturedSave(page)));
            this.requestFeaturedSave(selection.id);
            return;
          }
        }
      }
    }
  }

  moveFocus(direction: FocusDirection): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = moveFocus(loaded.page, direction);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(loaded.page, after);
  }

  scrollByWheel(deltaYPx: number, atMs: number): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    const read = readControlsWheel(isControlsPanelOpen(screen), this.wheel, {
      deltaYPx,
      atMs,
      rowPx: this.wheelStepPx,
    });
    this.wheel = read.gesture;
    const { page } = screen;
    if (page.kind !== 'loaded') {
      return;
    }
    const after = scrollRankings(page, read.rows);
    this.apply(withPage(screen, after));
    this.followFocusMove(page, after);
  }

  /** Q, E 는 컬렉션에서는 세트를, RANKING 탭에서는 난이도를 넘긴다. */
  switchTab(direction: ListDirection): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const before = loaded.page;
    const cycled = cycleRankingDifficulty(before, direction);
    const after = switchSet(cycled, direction);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(before, cycled);
    if (after !== cycled) {
      this.screen.playSound('click');
    }
  }

  toggleRankingSort(): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = toggleRankingSort(loaded.page);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(loaded.page, after);
  }

  clearRankingFilters(): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = clearRankingFilters(loaded.page);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(loaded.page, after);
  }

  selectRankingLane(filter: LaneCount): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = selectRankingLane(loaded.page, filter);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(loaded.page, after);
  }

  selectRankingDifficulty(filter: Difficulty): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = selectRankingDifficulty(loaded.page, filter);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(loaded.page, after);
  }

  selectTab(tab: SummaryTab): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = selectSummaryTab(loaded.page, tab);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(loaded.page, after);
  }

  selectSet(set: AchievementSet): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = selectSet(loaded.page, set);
    this.apply(withPage(loaded.screen, after));
    if (after !== loaded.page) {
      this.screen.playSound('click');
    }
  }

  hover(target: ProfileTarget): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(setHover(screen, target));
  }

  unhover(target: ProfileTarget): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(clearHover(screen, target));
  }

  hoverSummaryTab(tab: SummaryTab): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(
      setHover(screen, {
        kind: 'summaryTab',
        tab,
      }),
    );
  }

  unhoverSummaryTab(tab: SummaryTab): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(
      clearHover(screen, {
        kind: 'summaryTab',
        tab,
      }),
    );
  }

  hoverCollectionTab(set: AchievementSet): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(
      setHover(screen, {
        kind: 'collectionTab',
        set,
      }),
    );
  }

  unhoverCollectionTab(set: AchievementSet): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(
      clearHover(screen, {
        kind: 'collectionTab',
        set,
      }),
    );
  }

  pointerOver(button: ProfileButton): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(hoverProfileButton(screen, button));
  }

  pointerOut(button: ProfileButton): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(unhoverProfileButton(screen, button));
  }

  pointerDown(button: ProfileButton): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.apply(pressProfileButton(screen, button));
  }

  pointerUp(button: ProfileButton): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    const released = releaseProfileButton(screen, button);
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (released === screen) {
      return;
    }
    const { page } = released;
    switch (button) {
      case 'equip':
      case 'unequip': {
        if (page.kind !== 'loaded') {
          this.apply(released);
          return;
        }
        const selection = selectFocused(page);
        switch (selection.kind) {
          case 'none':
            this.apply(released);
            return;
          case 'state':
            this.apply(withPage(released, selection.state));
            if (selection.hasMovedFocus) {
              this.screen.playSound('menuFocus');
            }
            return;
          case 'saveFeatured': {
            this.apply(withPage(released, startFeaturedSave(page)));
            this.requestFeaturedSave(selection.id);
            return;
          }
        }
        return;
      }
      case 'back': {
        const action = goBack(page);
        if (action.kind === 'leave') {
          this.apply(released);
          this.screen.playSound('close');
          this.screen.leave();
          return;
        }
        this.nicknameCheckToken = null;
        this.apply(withPage(released, action.state));
        this.screen.playSound('close');
        return;
      }
      case 'retry': {
        this.screen.playSound('click');
        const confirm = readProfileConfirm(page);
        switch (confirm.kind) {
          case 'none':
            this.apply(released);
            return;
          case 'retryLoad':
            this.apply(withPage(released, LOADING_PAGE));
            this.load();
            return;
          case 'retryRankings': {
            const retrying = retryRankings(confirm.state);
            this.apply(withPage(released, retrying));
            this.loadRankings(retrying);
            return;
          }
          case 'select': {
            if (page.kind !== 'loaded') {
              this.apply(released);
              return;
            }
            const selection = selectFocused(page);
            switch (selection.kind) {
              case 'none':
                this.apply(released);
                return;
              case 'state':
                this.apply(withPage(released, selection.state));
                if (selection.hasMovedFocus) {
                  this.screen.playSound('menuFocus');
                }
                return;
              case 'saveFeatured': {
                this.apply(withPage(released, startFeaturedSave(page)));
                this.requestFeaturedSave(selection.id);
                return;
              }
            }
            return;
          }
        }
        return;
      }
      case 'controlsEntry':
        this.apply(withControlsOpen(released, true));
        this.screen.playSound('click');
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.apply(withControlsOpen(released, false));
        this.screen.playSound('close');
        return;
      case 'controlsHelp':
        this.apply(clickControlsHelp(released));
        this.screen.playSound('click');
        return;
      case 'accountSignOut':
        this.apply(released);
        this.screen.playSound('click');
        this.ports.signOut();
        this.screen.leaveToMain();
        return;
      case 'deleteEntry':
      case 'deleteCancel': {
        if (page.kind !== 'loaded') {
          this.apply(released);
          return;
        }
        const after =
          button === 'deleteEntry' ? openAccountDeletion(page) : closeAccountDeletion(page);
        this.apply(withPage(released, after));
        if (after !== page) {
          this.screen.playSound(button === 'deleteEntry' ? 'click' : 'close');
        }
        return;
      }
      case 'deleteAccept': {
        if (page.kind !== 'loaded') {
          this.apply(released);
          return;
        }
        // 처리 중에는 state 가 수락을 받지 않으므로 바뀐 경우에만 요청해 한 번만 보낸다.
        const after = startAccountDeletion(page);
        this.apply(withPage(released, after));
        if (after !== page) {
          this.screen.playSound('click');
          this.requestAccountDeletion();
        }
        return;
      }
    }
  }

  /** 계정 삭제 확인 창이 열린 동안에는 모든 키를 이 창이 받아 뒤 화면으로 넘기지 않는다. */
  captureDeletionKey(action: MenuAction | null): boolean {
    const loaded = this.loaded;
    if (loaded === null) {
      return false;
    }
    const { screen, page } = loaded;
    const key = readAccountDeletionKey(page, action);
    switch (key.kind) {
      case 'pass':
        return false;
      case 'block':
        return true;
      case 'focus': {
        const after = focusAccountDeletion(page, key.focus);
        this.apply(withPage(screen, after));
        if (after !== page) {
          this.screen.playSound('menuFocus');
        }
        return true;
      }
      case 'cancel': {
        const after = closeAccountDeletion(page);
        this.apply(withPage(screen, after));
        if (after !== page) {
          this.screen.playSound('close');
        }
        return true;
      }
      case 'accept': {
        // 처리 중에는 state 가 수락을 받지 않으므로 바뀐 경우에만 요청해 한 번만 보낸다.
        const after = startAccountDeletion(page);
        this.apply(withPage(screen, after));
        if (after !== page) {
          this.screen.playSound('click');
          this.requestAccountDeletion();
        }
        return true;
      }
    }
  }

  focusAchievement(id: AchievementId): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const after = withCollection(loaded.page, loaded.page.collection.set, id);
    this.apply(withPage(loaded.screen, after));
    this.followFocusMove(loaded.page, after);
  }

  select(target?: SummaryFocus): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const selection = selectFocused(loaded.page, target);
    switch (selection.kind) {
      case 'none':
        return;
      case 'state':
        this.apply(withPage(loaded.screen, selection.state));
        if (selection.hasMovedFocus) {
          this.screen.playSound('menuFocus');
        }
        return;
      case 'saveFeatured': {
        this.apply(withPage(loaded.screen, startFeaturedSave(loaded.page)));
        this.requestFeaturedSave(selection.id);
        return;
      }
    }
  }

  changeNicknameInput(input: string): void {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    const change = changeNicknameInput(loaded.page, input);
    if (change.kind === 'none') {
      return;
    }
    const token = {};
    this.nicknameCheckToken = token;
    this.apply(withPage(loaded.screen, change.state));
    if (change.kind === 'check') {
      void this.checkNickname(change.nickname, token).catch((error: unknown) => {
        console.warn('Failed to check nickname availability', error);
      });
    }
  }

  /** 닉네임 편집 중이면 Enter 와 Esc 만 처리하고, 친 글자가 단축키로 읽히지 않게 나머지 키도 삼킨다. */
  captureNicknameKey(action: MenuAction | null, input: string): boolean {
    const loaded = this.loaded;
    if (loaded === null || !isEditingNickname(loaded.page)) {
      return false;
    }
    const { screen, page } = loaded;
    if (action === 'confirm') {
      const submission = submitNicknameInput(page, input);
      this.nicknameCheckToken = null;
      this.apply(withPage(screen, submission.state));
      if (submission.kind === 'save') {
        const token = {};
        this.nicknameToken = token;
        void this.ports.changeNickname(submission.nickname).then(
          (saved) => {
            const current = this.loaded;
            if (this.nicknameToken === token && current !== null) {
              this.apply(withPage(current.screen, saveNickname(current.page, saved)));
            }
          },
          (error: unknown) => {
            const current = this.loaded;
            if (this.nicknameToken === token && current !== null) {
              this.apply(
                withPage(current.screen, failNicknameEdit(current.page, toNicknameFailure(error))),
              );
            }
          },
        );
      }
    } else if (action === 'back') {
      this.screen.playSound('close');
      const back = goBack(page);
      if (back.kind === 'leave') {
        this.screen.leave();
      } else {
        this.nicknameCheckToken = null;
        this.apply(withPage(screen, back.state));
      }
    }
    return true;
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    const screen = this.open;
    if (screen === null) {
      return false;
    }
    switch (readControlsKey(isControlsPanelOpen(screen), event)) {
      case 'open':
        this.apply(withControlsOpen(screen, true));
        this.screen.playSound('click');
        return true;
      case 'close':
        this.apply(withControlsOpen(screen, false));
        this.screen.playSound('close');
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  back(): void {
    const screen = this.open;
    if (screen === null) {
      return;
    }
    this.screen.playSound('close');
    const action = goBack(screen.page);
    if (action.kind === 'leave') {
      this.screen.leave();
      return;
    }
    this.nicknameCheckToken = null;
    this.apply(withPage(screen, action.state));
  }

  close(): void {
    this.state = { kind: 'closed' };
    this.loadToken = null;
    this.nicknameToken = null;
    this.nicknameCheckToken = null;
    this.featuredToken = null;
    this.deletionToken = null;
    this.rankingsToken = null;
  }

  /** 키 이동과 클릭은 같은 이동이라 포커스가 바뀌면 같은 포커스음을, 요약 탭이 바뀌면 같은 클릭음을 낸다. */
  private followFocusMove(before: LoadedProfileState, after: LoadedProfileState): void {
    if (hasStartedRankingsLoad(before, after)) {
      this.loadRankings(after);
    }
    const sound = getFocusMoveSound(before, after);
    if (sound !== null) {
      this.screen.playSound(sound);
    }
  }

  private requestFeaturedSave(id: AchievementId | null): void {
    const token = {};
    this.featuredToken = token;
    void this.ports.setFeaturedAchievement(id).then(
      (saved) => {
        const loaded = this.loaded;
        if (this.featuredToken === token && loaded !== null) {
          this.apply(withPage(loaded.screen, saveFeatured(loaded.page, saved)));
          this.screen.playSound(saved === null ? 'unequip' : 'equip');
        }
      },
      () => {
        const loaded = this.loaded;
        if (this.featuredToken === token && loaded !== null) {
          this.apply(withPage(loaded.screen, failFeaturedSave(loaded.page)));
        }
      },
    );
  }

  private requestAccountDeletion(): void {
    const token = {};
    this.deletionToken = token;
    void this.ports.deleteAccount().then(
      () => {
        if (this.deletionToken === token) {
          this.screen.leaveToMain();
        }
      },
      (error: unknown) => {
        const loaded = this.loaded;
        if (this.deletionToken === token && loaded !== null) {
          this.apply(withPage(loaded.screen, failAccountDeletion(loaded.page, error)));
        }
      },
    );
  }

  private load(): void {
    const token = {};
    this.loadToken = token;
    void this.ports.loadProfile().then(
      (profile) => {
        const screen = this.open;
        if (this.loadToken === token && screen !== null) {
          this.apply(withPage(screen, loadedState(profile)));
        }
      },
      (error: unknown) => {
        const screen = this.open;
        if (this.loadToken === token && screen !== null) {
          this.apply(withPage(screen, toLoadFailurePage(error)));
        }
      },
    );
  }

  private loadRankings(state: LoadedProfileState): void {
    const token = {};
    this.rankingsToken = token;
    void this.ports.loadMyRankings(getRankingsQuery(state)).then(
      (page) => {
        const loaded = this.loaded;
        if (this.rankingsToken === token && loaded !== null) {
          this.apply(withPage(loaded.screen, applyRankings(loaded.page, page)));
        }
      },
      (error: unknown) => {
        const loaded = this.loaded;
        if (this.rankingsToken === token && loaded !== null) {
          this.apply(withPage(loaded.screen, failRankings(loaded.page, error)));
        }
      },
    );
    void this.ports.wait(RANKINGS_SLOW_DELAY_MS).then(() => {
      const loaded = this.loaded;
      if (this.rankingsToken === token && loaded !== null) {
        this.apply(withPage(loaded.screen, markRankingsSlow(loaded.page)));
      }
    });
  }

  private async checkNickname(nickname: Nickname, token: object): Promise<void> {
    await this.ports.wait(NICKNAME_CHECK_DELAY_MS);
    if (this.nicknameCheckToken !== token) {
      return;
    }
    const isAvailable = await this.ports.isNicknameAvailable(nickname);
    const loaded = this.loaded;
    if (this.nicknameCheckToken === token && !isAvailable && loaded !== null) {
      this.apply(withPage(loaded.screen, failNicknameEdit(loaded.page, 'taken')));
    }
  }

  private get open(): ProfileScreenState | null {
    return 'kind' in this.state ? null : this.state;
  }

  private get loaded(): {
    readonly screen: ProfileScreenState;
    readonly page: LoadedProfileState;
  } | null {
    const screen = this.open;
    return screen === null || screen.page.kind !== 'loaded'
      ? null
      : {
          screen,
          page: screen.page,
        };
  }

  private apply(next: ProfileScreenState): void {
    const previous = this.open;
    if (previous === null || next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
