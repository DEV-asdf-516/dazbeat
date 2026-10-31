import type { AchievementId, AchievementSet } from '../../data/achievements.js';
import type { Nickname } from '../../data/nickname.js';
import type { Profile } from '../../data/profile.js';
import { readControlsKey, withControlsOpen } from '../app/controlsGuide.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import {
  changeNicknameInput,
  clearHover,
  createProfileScreen,
  failFeaturedSave,
  failNicknameEdit,
  focusAchievement,
  goBack,
  hasMovedFocus,
  hoverProfileButton,
  isEditingNickname,
  loadedState,
  moveFocus,
  pressProfileButton,
  releaseProfileButton,
  saveFeatured,
  saveNickname,
  selectFocused,
  selectSet,
  selectSummaryTab,
  setHover,
  startFeaturedSave,
  submitNicknameInput,
  switchSet,
  toLoadFailurePage,
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

export interface ProfilePorts {
  isSignedIn(): boolean;
  loadProfile(): Promise<Profile>;
  changeNickname(nickname: Nickname): Promise<Nickname>;
  isNicknameAvailable(nickname: Nickname): Promise<boolean>;
  wait(delayMs: number): Promise<void>;
  setFeaturedAchievement(id: AchievementId | null): Promise<AchievementId | null>;
}

export interface ProfileScreen {
  render(previous: ProfileScreenState | null, next: ProfileScreenState): void;
  playFocusSound(): void;
  leaveToMain(): void;
}

// 타이핑이 멈춘 뒤에만 물어 글자마다 요청하지 않는다.
const NICKNAME_CHECK_DELAY_MS = 300;

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

  constructor(
    private readonly ports: ProfilePorts,
    private readonly screen: ProfileScreen,
  ) {}

  // 씬의 render 가 controller 를 참조하므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    if (!('kind' in this.state) || this.state.kind !== 'unstarted') {
      return;
    }
    const isSignedIn = this.ports.isSignedIn();
    const first = createProfileScreen(isSignedIn ? LOADING_PAGE : GUEST_PAGE);
    this.state = first;
    this.screen.render(null, first);
    if (isSignedIn) {
      this.load();
    }
  }

  retry(): void {
    if (this.page?.kind === 'failed') {
      this.setPage(LOADING_PAGE);
      this.load();
    }
  }

  moveFocus(direction: FocusDirection): void {
    this.moveFocusFromUser((state) => moveFocus(state, direction));
  }

  /** 키 이동과 클릭은 같은 포커스 이동이라 포커스가 바뀔 때 같은 효과음을 낸다. */
  private moveFocusFromUser(transition: (state: LoadedProfileState) => LoadedProfileState): void {
    const before = this.page;
    if (before?.kind !== 'loaded') {
      return;
    }
    const after = transition(before);
    this.setPage(after);
    if (hasMovedFocus(before, after)) {
      this.screen.playFocusSound();
    }
  }

  switchSet(delta: -1 | 1): void {
    this.updateLoaded((state) => switchSet(state, delta));
  }

  selectTab(tab: SummaryTab): void {
    this.updateLoaded((state) => selectSummaryTab(state, tab));
  }

  selectSet(set: AchievementSet): void {
    this.updateLoaded((state) => selectSet(state, set));
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
      case 'controlsEntry':
        this.openControls();
        return;
      case 'controlsClose':
      case 'controlsBackdrop':
        this.closeControls();
        return;
    }
  }

  focusAchievement(id: AchievementId): void {
    this.moveFocusFromUser((state) => focusAchievement(state, id));
  }

  select(target?: SummaryFocus): void {
    const state = this.page;
    if (state?.kind !== 'loaded') {
      return;
    }
    const selection = selectFocused(state, target);
    switch (selection.kind) {
      case 'none':
        return;
      case 'state':
        this.setPage(selection.state);
        return;
      case 'saveFeatured':
        this.saveFeatured(state, selection.id);
        return;
    }
  }

  changeNicknameInput(input: string): void {
    const state = this.page;
    if (state?.kind !== 'loaded') {
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
    if (state?.kind !== 'loaded' || !isEditingNickname(state)) {
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
    this.apply((screen) => withControlsOpen(screen, true));
  }

  closeControls(): void {
    this.apply((screen) => withControlsOpen(screen, false));
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
    if (page === null) {
      return;
    }
    const action = goBack(page);
    if (action.kind === 'leave') {
      this.screen.leaveToMain();
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
        }
      },
      () => {
        if (this.featuredToken === token) {
          this.updateLoaded(failFeaturedSave);
        }
      },
    );
  }

  private get page(): ProfileState | null {
    return 'kind' in this.state ? null : this.state.page;
  }

  private updateLoaded(transition: (state: LoadedProfileState) => LoadedProfileState): void {
    const page = this.page;
    if (page?.kind === 'loaded') {
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
