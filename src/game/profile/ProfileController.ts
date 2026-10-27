import type { AchievementId, AchievementSet } from '../../data/achievements.js';
import type { Nickname } from '../../data/nickname.js';
import { ProfileRequestError } from '../../data/profile.js';
import type { NicknameChangeFailure, Profile } from '../../data/profile.js';
import type { MenuAction } from '../ui/menuInput.js';
import {
  changeNicknameInput,
  clearHover,
  failFeaturedSave,
  failNicknameEdit,
  focusAchievement,
  goBack,
  hasMovedFocus,
  isEditingNickname,
  loadedState,
  moveFocus,
  saveFeatured,
  saveNickname,
  selectFocused,
  selectSet,
  selectSummaryTab,
  setHover,
  startFeaturedSave,
  submitNicknameInput,
  switchSet,
} from './profileState.js';
import type {
  FocusDirection,
  LoadedProfileState,
  ProfileHover,
  ProfileState,
  SummaryFocus,
  SummaryTab,
} from './profileState.js';

export interface ProfileDeps {
  isSignedIn(): boolean;
  loadProfile(): Promise<Profile>;
  changeNickname(nickname: Nickname): Promise<string>;
  isNicknameAvailable(nickname: Nickname): Promise<boolean>;
  wait(delayMs: number): Promise<void>;
  setFeaturedAchievement(id: AchievementId | null): Promise<AchievementId | null>;
}

export interface ProfileScreen {
  render(state: ProfileState, previous: ProfileState | null): void;
  playFocusSound(): void;
  leaveToMain(): void;
}

// 타이핑이 멈춘 뒤에만 물어 글자마다 요청하지 않는다.
const NICKNAME_CHECK_DELAY_MS = 300;

function toNicknameFailure(error: unknown): NicknameChangeFailure {
  if (error instanceof ProfileRequestError) {
    if (error.kind === 'invalidNickname') {
      return 'invalid';
    }
    if (error.kind === 'nicknameTaken') {
      return 'taken';
    }
  }
  return 'failed';
}

// 시작 전에는 그린 것이 없어 첫 render 의 직전 state 가 없다.
// 닫힌 뒤에는 입력과 늦은 결과를 받지 않고, 들고 있던 프로필도 놓는다.
type ControllerState = { readonly kind: 'unstarted' } | ProfileState | { readonly kind: 'closed' };

export class ProfileController {
  private state: ControllerState = { kind: 'unstarted' };
  private loadToken: object | null = null;
  private nicknameToken: object | null = null;
  private nicknameCheckToken: object | null = null;
  private featuredToken: object | null = null;

  constructor(
    private readonly deps: ProfileDeps,
    private readonly screen: ProfileScreen,
  ) {}

  // 씬의 render 가 controller 를 참조하므로 생성자가 아니라 생성 뒤에 시작한다.
  start(): void {
    if (this.state.kind === 'closed') {
      return;
    }
    if (!this.deps.isSignedIn()) {
      this.setState({ kind: 'guest' });
      return;
    }
    this.load();
  }

  retry(): void {
    if (this.state.kind === 'failed') {
      this.load();
    }
  }

  moveFocus(direction: FocusDirection): void {
    this.moveFocusFromUser((state) => moveFocus(state, direction));
  }

  /** 키 이동과 클릭은 같은 포커스 이동이라 포커스가 바뀔 때 같은 효과음을 낸다. */
  private moveFocusFromUser(transition: (state: LoadedProfileState) => LoadedProfileState): void {
    const before = this.state;
    if (before.kind !== 'loaded') {
      return;
    }
    const after = transition(before);
    this.setState(after);
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

  hover(target: ProfileHover): void {
    this.updateLoaded((state) => setHover(state, target));
  }

  unhover(target: ProfileHover): void {
    this.updateLoaded((state) => clearHover(state, target));
  }

  focusAchievement(id: AchievementId): void {
    this.moveFocusFromUser((state) => focusAchievement(state, id));
  }

  select(target?: SummaryFocus): void {
    const state = this.state;
    if (state.kind !== 'loaded') {
      return;
    }
    const selection = selectFocused(state, target);
    switch (selection.kind) {
      case 'none':
        return;
      case 'state':
        this.setState(selection.state);
        return;
      case 'saveFeatured':
        this.saveFeatured(state, selection.id);
        return;
    }
  }

  changeNicknameInput(input: string): void {
    const state = this.state;
    if (state.kind !== 'loaded') {
      return;
    }
    const change = changeNicknameInput(state, input);
    if (change.kind === 'none') {
      return;
    }
    const token = {};
    this.nicknameCheckToken = token;
    this.setState(change.state);
    if (change.kind === 'check') {
      void this.checkNickname(change.nickname, token).catch((error: unknown) => {
        console.warn('Failed to check nickname availability', error);
      });
    }
  }

  /** 닉네임 편집 중이면 Enter 와 Esc 만 처리하고, 친 글자가 단축키로 읽히지 않게 나머지 키도 삼킨다. */
  captureNicknameKey(action: MenuAction | null, input: string): boolean {
    const state = this.state;
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
    if (submission.kind === 'none') {
      return;
    }
    this.nicknameCheckToken = null;
    this.setState(submission.state);
    if (submission.kind !== 'save') {
      return;
    }
    const token = {};
    this.nicknameToken = token;
    void this.deps.changeNickname(submission.nickname).then(
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

  back(): void {
    const state = this.state;
    if (state.kind === 'unstarted' || state.kind === 'closed') {
      return;
    }
    const action = goBack(state);
    if (action.kind === 'leave') {
      this.screen.leaveToMain();
      return;
    }
    this.nicknameCheckToken = null;
    this.setState(action.state);
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
    this.setState({ kind: 'loading' });
    void this.deps.loadProfile().then(
      (profile) => {
        if (this.loadToken === token) {
          this.setState(loadedState(profile));
        }
      },
      (error: unknown) => {
        if (this.loadToken !== token) {
          return;
        }
        // 인증 만료는 다시 로그인해야 하므로 게스트 안내로 보낸다.
        this.setState(
          error instanceof ProfileRequestError && error.kind === 'unauthorized'
            ? { kind: 'guest' }
            : { kind: 'failed' },
        );
      },
    );
  }

  private async checkNickname(nickname: Nickname, token: object): Promise<void> {
    await this.deps.wait(NICKNAME_CHECK_DELAY_MS);
    if (this.nicknameCheckToken !== token) {
      return;
    }
    const isAvailable = await this.deps.isNicknameAvailable(nickname);
    if (this.nicknameCheckToken === token && !isAvailable) {
      this.updateLoaded((current) => failNicknameEdit(current, 'taken'));
    }
  }

  private saveFeatured(state: LoadedProfileState, id: AchievementId | null): void {
    const token = {};
    this.featuredToken = token;
    this.setState(startFeaturedSave(state));
    void this.deps.setFeaturedAchievement(id).then(
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

  private updateLoaded(transition: (state: LoadedProfileState) => LoadedProfileState): void {
    if (this.state.kind === 'loaded') {
      this.setState(transition(this.state));
    }
  }

  private setState(next: ProfileState): void {
    const previous = this.state;
    if (next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(
      next,
      previous.kind === 'unstarted' || previous.kind === 'closed' ? null : previous,
    );
  }
}
