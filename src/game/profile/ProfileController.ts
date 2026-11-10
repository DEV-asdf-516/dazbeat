import type { AchievementId, AchievementSet } from '../../data/achievements.js';
import type { Difficulty, LaneCount } from '../../rhythm/types.js';
import type { Nickname } from '../../data/nickname.js';
import type { Profile } from '../../data/profile.js';
import type { RankedChartPage, RankedChartQuery } from '../../data/ranking.js';
import { readControlsKey, readControlsWheel, withControlsOpen } from '../app/controlsGuide.js';
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

const GUEST_PAGE: ProfileState = { kind: 'guest' };
const LOADING_PAGE: ProfileState = { kind: 'loading' };
const INACTIVE_PAGE = { kind: 'inactive' } as const;

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
    const page = this.page;
    if (page.kind === 'inactive') {
      return;
    }
    const confirm = readProfileConfirm(page);
    switch (confirm.kind) {
      case 'none':
        return;
      case 'retryLoad':
        this.setPage(LOADING_PAGE);
        this.load();
        return;
      case 'retryRankings': {
        const retrying = retryRankings(confirm.state);
        this.setPage(retrying);
        this.loadRankings(retrying);
        return;
      }
      case 'select':
        this.select();
        return;
    }
  }

  moveFocus(direction: FocusDirection): void {
    this.moveFocusFromUser((state) => moveFocus(state, direction));
  }

  /** 키 이동과 클릭은 같은 이동이라 포커스가 바뀌면 같은 포커스음을, 요약 탭이 바뀌면 같은 클릭음을 낸다. */
  private moveFocusFromUser(transition: (state: LoadedProfileState) => LoadedProfileState): void {
    const before = this.page;
    if (before.kind !== 'loaded') {
      return;
    }
    const after = transition(before);
    this.setPage(after);
    if (hasStartedRankingsLoad(before, after)) {
      this.loadRankings(after);
    }
    const sound = getFocusMoveSound(before, after);
    if (sound !== null) {
      this.screen.playSound(sound);
    }
  }

  scrollByWheel(deltaYPx: number, atMs: number): void {
    if ('kind' in this.state) {
      return;
    }
    const read = readControlsWheel(this.state.isControlsOpen, this.wheel, {
      deltaYPx,
      atMs,
      rowPx: this.wheelStepPx,
    });
    this.wheel = read.gesture;
    this.moveFocusFromUser((state) => scrollRankings(state, read.rows));
  }

  switchSet(delta: -1 | 1): void {
    this.changeLoadedFromUser((state) => switchSet(state, delta), 'click');
  }

  /** Q, E 는 컬렉션에서는 세트를, RANKING 탭에서는 난이도를 넘긴다. */
  switchTab(delta: -1 | 1): void {
    this.moveFocusFromUser((state) => cycleRankingDifficulty(state, delta));
    this.switchSet(delta);
  }

  toggleRankingSort(): void {
    this.moveFocusFromUser(toggleRankingSort);
  }

  clearRankingFilters(): void {
    this.moveFocusFromUser(clearRankingFilters);
  }

  selectRankingLane(filter: LaneCount): void {
    this.moveFocusFromUser((state) => selectRankingLane(state, filter));
  }

  selectRankingDifficulty(filter: Difficulty): void {
    this.moveFocusFromUser((state) => selectRankingDifficulty(state, filter));
  }

  selectTab(tab: SummaryTab): void {
    this.moveFocusFromUser((state) => selectSummaryTab(state, tab));
  }

  selectSet(set: AchievementSet): void {
    this.changeLoadedFromUser((state) => selectSet(state, set), 'click');
  }

  hover(target: ProfileTarget): void {
    this.apply((screen) => setHover(screen, target));
  }

  unhover(target: ProfileTarget): void {
    this.apply((screen) => clearHover(screen, target));
  }

  pointerOver(button: ProfileButton): void {
    this.apply((screen) => hoverProfileButton(screen, button));
  }

  pointerOut(button: ProfileButton): void {
    this.apply((screen) => unhoverProfileButton(screen, button));
  }

  pointerDown(button: ProfileButton): void {
    this.apply((screen) => pressProfileButton(screen, button));
  }

  pointerUp(button: ProfileButton): void {
    const previous = this.state;
    this.apply((screen) => releaseProfileButton(screen, button));
    // 눌린 그 버튼이었을 때만 눌림이 풀려 state 가 바뀐다.
    if (this.state === previous) {
      return;
    }
    switch (button) {
      case 'equip':
      case 'unequip':
        this.select();
        return;
      case 'back':
        this.back();
        return;
      case 'retry':
        this.screen.playSound('click');
        this.confirm();
        return;
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
      case 'accountSignOut':
        this.screen.playSound('click');
        this.ports.signOut();
        this.screen.leaveToMain();
        return;
      case 'deleteEntry':
        this.changeLoadedFromUser(openAccountDeletion, 'click');
        return;
      case 'deleteCancel':
        this.changeLoadedFromUser(closeAccountDeletion, 'close');
        return;
      case 'deleteAccept':
        this.startAccountDeletion();
        return;
    }
  }

  /** 계정 삭제 확인 창이 열린 동안에는 모든 키를 이 창이 받아 뒤 화면으로 넘기지 않는다. */
  captureDeletionKey(action: MenuAction | null): boolean {
    const state = this.page;
    if (state.kind !== 'loaded') {
      return false;
    }
    const key = readAccountDeletionKey(state, action);
    switch (key.kind) {
      case 'pass':
        return false;
      case 'block':
        return true;
      case 'focus':
        this.changeLoadedFromUser(
          (current) => focusAccountDeletion(current, key.focus),
          'menuFocus',
        );
        return true;
      case 'cancel':
        this.changeLoadedFromUser(closeAccountDeletion, 'close');
        return true;
      case 'accept':
        this.startAccountDeletion();
        return true;
    }
  }

  private changeLoadedFromUser(
    transition: (state: LoadedProfileState) => LoadedProfileState,
    sound: SoundEffect,
  ): boolean {
    const before = this.page;
    this.updateLoaded(transition);
    if (this.page === before) {
      return false;
    }
    this.screen.playSound(sound);
    return true;
  }

  // 처리 중에는 state 가 수락을 받지 않으므로 바뀐 경우에만 요청해 한 번만 보낸다.
  private startAccountDeletion(): void {
    if (!this.changeLoadedFromUser(startAccountDeletion, 'click')) {
      return;
    }
    const token = {};
    this.deletionToken = token;
    void this.ports.deleteAccount().then(
      () => {
        if (this.deletionToken === token) {
          this.screen.leaveToMain();
        }
      },
      (error: unknown) => {
        if (this.deletionToken === token) {
          this.updateLoaded((current) => failAccountDeletion(current, error));
        }
      },
    );
  }

  focusAchievement(id: AchievementId): void {
    this.moveFocusFromUser((state) => withCollection(state, state.collection.set, id));
  }

  select(target?: SummaryFocus): void {
    const state = this.page;
    if (state.kind !== 'loaded') {
      return;
    }
    const selection = selectFocused(state, target);
    switch (selection.kind) {
      case 'none':
        return;
      case 'state':
        if (selection.hasMovedFocus) {
          this.screen.playSound('menuFocus');
        }
        this.setPage(selection.state);
        return;
      case 'saveFeatured':
        this.saveFeatured(state, selection.id);
        return;
    }
  }

  changeNicknameInput(input: string): void {
    const state = this.page;
    if (state.kind !== 'loaded') {
      return;
    }
    const change = changeNicknameInput(state, input);
    if (change.kind === 'none') {
      return;
    }
    const token = {};
    this.nicknameCheckToken = token;
    this.setPage(change.state);
    if (change.kind === 'check') {
      void this.checkNickname(change.nickname, token).catch((error: unknown) => {
        console.warn('Failed to check nickname availability', error);
      });
    }
  }

  /** 닉네임 편집 중이면 Enter 와 Esc 만 처리하고, 친 글자가 단축키로 읽히지 않게 나머지 키도 삼킨다. */
  captureNicknameKey(action: MenuAction | null, input: string): boolean {
    const state = this.page;
    if (state.kind !== 'loaded' || !isEditingNickname(state)) {
      return false;
    }
    if (action === 'confirm') {
      this.submitNickname(state, input);
    } else if (action === 'back') {
      this.back();
    }
    return true;
  }

  private submitNickname(state: LoadedProfileState, input: string): void {
    const submission = submitNicknameInput(state, input);
    this.nicknameCheckToken = null;
    this.setPage(submission.state);
    if (submission.kind !== 'save') {
      return;
    }
    const token = {};
    this.nicknameToken = token;
    void this.ports.changeNickname(submission.nickname).then(
      (saved) => {
        if (this.nicknameToken === token) {
          this.updateLoaded((current) => saveNickname(current, saved));
        }
      },
      (error: unknown) => {
        if (this.nicknameToken === token) {
          this.updateLoaded((current) => failNicknameEdit(current, toNicknameFailure(error)));
        }
      },
    );
  }

  openControls(): void {
    this.screen.playSound('click');
    this.apply((screen) => withControlsOpen(screen, true));
  }

  closeControls(): void {
    this.apply((screen) => withControlsOpen(screen, false));
    this.screen.playSound('close');
  }

  handleControlsKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    if ('kind' in this.state) {
      return false;
    }
    switch (readControlsKey(this.state.isControlsOpen, event)) {
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

  back(): void {
    const page = this.page;
    if (page.kind === 'inactive') {
      return;
    }
    this.screen.playSound('close');
    const action = goBack(page);
    if (action.kind === 'leave') {
      this.screen.leave();
      return;
    }
    this.nicknameCheckToken = null;
    this.setPage(action.state);
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

  private load(): void {
    const token = {};
    this.loadToken = token;
    void this.ports.loadProfile().then(
      (profile) => {
        if (this.loadToken === token) {
          this.setPage(loadedState(profile));
        }
      },
      (error: unknown) => {
        if (this.loadToken !== token) {
          return;
        }
        this.setPage(toLoadFailurePage(error));
      },
    );
  }

  private loadRankings(state: LoadedProfileState): void {
    const token = {};
    this.rankingsToken = token;
    void this.ports
      .loadMyRankings(getRankingsQuery(state))
      .then(
        (page) => (current: LoadedProfileState) => applyRankings(current, page),
        (error: unknown) => (current: LoadedProfileState) => failRankings(current, error),
      )
      .then((transition) => {
        if (this.rankingsToken === token) {
          this.updateLoaded(transition);
        }
      });
  }

  private async checkNickname(nickname: Nickname, token: object): Promise<void> {
    await this.ports.wait(NICKNAME_CHECK_DELAY_MS);
    if (this.nicknameCheckToken !== token) {
      return;
    }
    const isAvailable = await this.ports.isNicknameAvailable(nickname);
    if (this.nicknameCheckToken === token && !isAvailable) {
      this.updateLoaded((current) => failNicknameEdit(current, 'taken'));
    }
  }

  private saveFeatured(state: LoadedProfileState, id: AchievementId | null): void {
    const token = {};
    this.featuredToken = token;
    this.setPage(startFeaturedSave(state));
    void this.ports.setFeaturedAchievement(id).then(
      (saved) => {
        if (this.featuredToken === token) {
          this.updateLoaded((current) => saveFeatured(current, saved));
          this.screen.playSound(saved === null ? 'unequip' : 'equip');
        }
      },
      () => {
        if (this.featuredToken === token) {
          this.updateLoaded(failFeaturedSave);
        }
      },
    );
  }

  private get page(): ProfileState | typeof INACTIVE_PAGE {
    return 'kind' in this.state ? INACTIVE_PAGE : this.state.page;
  }

  private updateLoaded(transition: (state: LoadedProfileState) => ProfileState): void {
    const page = this.page;
    if (page.kind === 'loaded') {
      this.setPage(transition(page));
    }
  }

  private setPage(page: ProfileState): void {
    this.apply((screen) => withPage(screen, page));
  }

  private apply(transition: (screen: ProfileScreenState) => ProfileScreenState): void {
    if ('kind' in this.state) {
      return;
    }
    const previous = this.state;
    const next = transition(previous);
    if (next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
