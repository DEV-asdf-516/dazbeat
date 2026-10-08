import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { AuthUser } from '../../backend/auth.js';
import { getAtlasPresentation } from '../celestial/celestialCatalog.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import {
  cancelSignIn,
  completeSignIn,
  createAccountState,
  failSignIn,
  startSignIn,
} from '../accountState.js';
import type { AccountAuth, AccountState } from '../accountState.js';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, exitScene } from '../config.js';
import type { SceneRequest } from '../config.js';
import { getMainMenuItems } from './mainMenu.js';
import type { MainMenuItem } from './mainMenu.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { Button } from '../ui/Button.js';
import type { ButtonVariant } from '../ui/Button.js';
import {
  addCelestialAtmosphere,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
  registerCelestialAnimations,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { queueImageLoads } from '../ui/imageLoad.js';
import { MenuFocus } from '../ui/MenuFocus.js';
import { addMenuKeyHintRow } from '../ui/keyHintView.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import {
  COLORS,
  DATA_FONT_FAMILY,
  MOTION,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  textStyle,
  typeStyle,
} from '../ui/theme.js';

type MenuItem = MainMenuItem | 'account' | 'youtube';

const LOGO_Y_PX = 300;
const MENU_ITEMS: Record<MainMenuItem, { label: string; variant: ButtonVariant }> = {
  play: { label: 'PLAY', variant: 'quiet' },
  chartEditor: { label: 'CHART EDITOR', variant: 'quiet' },
  settings: { label: 'SETTINGS', variant: 'quiet' },
  credits: { label: 'CREDITS', variant: 'quiet' },
};
// 첫 항목(PLAY)만 따로 두고, 그 뒤 항목은 표시 순서대로 간격을 두고 쌓는다.
const MENU_FIRST_Y_PX = 560;
const MENU_REST_TOP_Y_PX = 680;
const MENU_REST_SPACING_PX = 64;
const ACCOUNT_LABELS: Record<AccountState['kind'], string> = {
  guest: 'SIGN IN WITH GOOGLE',
  signingIn: 'CANCEL',
  signedIn: 'SIGN OUT',
};
const GOOGLE_ICON_TEXTURE_KEY = 'ui:google-g';
const GOOGLE_ICON_PATH = '/assets/ui/google-g.svg';
const GOOGLE_ICON_SIZE_PX = 64;
const QUIET_PADDING_X_PX = 16;
const QUIET_PADDING_Y_PX = 12;
// 계정 영역은 메뉴 여백(SCREEN_LAYOUT)을 따르지 않고 화면 모서리에 붙인다.
const ACCOUNT_EDGE_PX = 32;
/**
 * 이름·이메일·로그인 상태 문구는 배경 그림 위에 그대로 두면 떠 보이므로 반투명 카드 위에 얹는다.
 * 카드 안 줄은 오른쪽 끝을 ACCOUNT_RIGHT_X_PX 에 맞춰 위에서부터 정보 → 구분선 → 동작 순으로 쌓는다.
 */
const ACCOUNT_CARD_PADDING_X_PX = 20;
const ACCOUNT_CARD_PADDING_Y_PX = 16;
const ACCOUNT_CARD_FILL_ALPHA = 0.6;
const ACCOUNT_CARD_BORDER_ALPHA = 0.35;
const ACCOUNT_CARD_BORDER_PX = 1;
const ACCOUNT_RIGHT_X_PX = GAME_WIDTH - ACCOUNT_EDGE_PX - ACCOUNT_CARD_PADDING_X_PX;
const ACCOUNT_BUTTON_RIGHT_X_PX = ACCOUNT_RIGHT_X_PX + QUIET_PADDING_X_PX;
const ACCOUNT_TOP_Y_PX = ACCOUNT_EDGE_PX + ACCOUNT_CARD_PADDING_Y_PX;
/** 로그인 전 G 아이콘 버튼. 아이콘이 모서리에서 ACCOUNT_EDGE_PX 떨어지도록 quiet 여백을 뺀다. */
const GOOGLE_BUTTON_TOP_Y_PX = ACCOUNT_EDGE_PX - QUIET_PADDING_Y_PX;
const GOOGLE_BUTTON_RIGHT_X_PX = GAME_WIDTH - ACCOUNT_EDGE_PX + QUIET_PADDING_X_PX;
/** G 아이콘 아래 실패 안내 카드까지의 간격 */
const GOOGLE_STATUS_GAP_PX = 12;
const USER_NAME_EMAIL_GAP_PX = 2;
const USER_NAME_WEIGHT = 600;
/** 정보 줄과 동작 버튼 사이. 가운데에 구분선을 긋는다. */
const ACCOUNT_ACTION_GAP_PX = 24;
const ACCOUNT_DIVIDER_ALPHA = 0.3;
/** Pretendard 는 같은 px 에서 Cormorant 보다 커 보이므로 한 단계 줄여 이름보다 앞서지 않게 한다. */
const USER_EMAIL_TYPE = { sizePx: 18, weight: 400 } as const;
const YOUTUBE_URL = 'https://www.youtube.com/@dazbeeee';
const YOUTUBE_ICON_TEXTURE_KEY = 'ui:youtube';
const YOUTUBE_ICON_PATH = '/assets/ui/youtube.svg';
const YOUTUBE_ICON_SIZE_PX = 64;
// 계정 영역과 같은 방식으로 우하단 모서리에서 내용이 32px 떨어지도록 quiet 패딩을 뺀다.
const YOUTUBE_BUTTON_TOP_Y_PX = GAME_HEIGHT - 32 - 12 - YOUTUBE_ICON_SIZE_PX - 12;

const TITLE_THREAD_ID = 'R26';
const TITLE_THREAD_POSITION_PX = { x: 540, y: 505 } as const;
const LOGO_GLINT_ID = 'R25';
const LOGO_GLINT_POSITION_PX = { x: 900, y: 478 } as const;
const LOADING_STAR_ID = 'R47';
const LOADING_STAR_GAP_PX = 24;

interface AccountView {
  button: Button;
  youtubeButton: Button;
  /** 정보 줄 뒤의 반투명 판. 버튼보다 먼저 만들어 그 아래에 그린다. */
  card: Phaser.GameObjects.Rectangle;
  divider: Phaser.GameObjects.Rectangle;
  status: Phaser.GameObjects.Text;
  userName: Phaser.GameObjects.Text;
  userEmail: Phaser.GameObjects.Text;
  loadingStar: Phaser.GameObjects.Sprite | null;
}

export class MainScene extends Phaser.Scene {
  private account: AccountState = { kind: 'guest', hasSignInFailed: false };
  private menuItems: readonly MainMenuItem[] = [];
  private menuButtons: readonly Button[] = [];
  private menu = new MenuFocus<MenuItem>([]);
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly i18n: I18n,
    private readonly auth: AccountAuth,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.main);
  }

  preload(): void {
    queueImageLoads(
      this,
      [
        { key: GOOGLE_ICON_TEXTURE_KEY, url: GOOGLE_ICON_PATH },
        { key: YOUTUBE_ICON_TEXTURE_KEY, url: YOUTUBE_ICON_PATH },
      ],
      'main scene image',
    );
    queueCelestialTextures(this, this.celestial);
  }

  create(): void {
    this.exit = STAYING;
    registerCelestialAnimations(this, this.celestial);
    addCelestialAtmosphere(this, this.celestial, 'main');
    this.account = this.restoreAccount();
    const keyboard = requireKeyboard(this);
    this.cameras.main.fadeIn(MOTION.mediumMs);
    const logo = this.add.text(
      SCREEN_LAYOUT.leftXPx,
      LOGO_Y_PX,
      'DAZBEAT',
      textStyle('display', COLORS.textPrimary),
    );
    addCelestialSprite(
      this,
      getAtlasPresentation(this.celestial, TITLE_THREAD_ID),
      TITLE_THREAD_POSITION_PX.x,
      TITLE_THREAD_POSITION_PX.y,
    );
    const logoGlint = addCelestialSprite(
      this,
      getAtlasPresentation(this.celestial, LOGO_GLINT_ID),
      LOGO_GLINT_POSITION_PX.x,
      LOGO_GLINT_POSITION_PX.y,
    );
    if (logoGlint !== null) {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () =>
        playCelestialOnce(logoGlint),
      );
    }
    // 카드와 구분선은 계정 버튼보다 아래에 그려지도록 먼저 만든다. 크기는 layoutAccount 가 정한다.
    const card = this.add
      .rectangle(0, 0, 0, 0, COLORS.background, ACCOUNT_CARD_FILL_ALPHA)
      .setOrigin(0, 0)
      .setStrokeStyle(ACCOUNT_CARD_BORDER_PX, COLORS.textMuted, ACCOUNT_CARD_BORDER_ALPHA)
      .setRounded(RADIUS.mediumPx);
    const divider = this.add
      .rectangle(0, 0, 0, ACCOUNT_CARD_BORDER_PX, COLORS.textMuted, ACCOUNT_DIVIDER_ALPHA)
      .setOrigin(0, 0.5);
    // 계정 동작은 메뉴보다 한 단계 작은 글자로 두어 PLAY 등 주 메뉴와 경쟁하지 않게 한다.
    const accountButton = new Button(this, 0, 0, {
      variant: 'quiet',
      label: '',
      labelType: TYPE_SCALE.secondary,
      onActivate: () => this.activate('account', view),
    });
    const youtubeButton = new Button(this, 0, YOUTUBE_BUTTON_TOP_Y_PX, {
      variant: 'quiet',
      label: 'YOUTUBE',
      onActivate: () => this.activate('youtube', view),
    });
    // 아이콘을 못 불러왔으면 글자 라벨을 그대로 둔다.
    if (this.textures.exists(YOUTUBE_ICON_TEXTURE_KEY)) {
      youtubeButton.setIcon(YOUTUBE_ICON_TEXTURE_KEY, YOUTUBE_ICON_SIZE_PX);
    }
    youtubeButton.alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
    const view: AccountView = {
      button: accountButton,
      youtubeButton,
      card,
      divider,
      status: this.add
        .text(ACCOUNT_RIGHT_X_PX, 0, '', textStyle('meta', COLORS.textSecondary))
        .setOrigin(1, 0),
      userName: this.add
        .text(
          ACCOUNT_RIGHT_X_PX,
          ACCOUNT_TOP_Y_PX,
          '',
          textStyle('secondary', COLORS.textPrimary, USER_NAME_WEIGHT),
        )
        .setOrigin(1, 0),
      userEmail: this.add
        .text(ACCOUNT_RIGHT_X_PX, 0, '', {
          ...typeStyle(USER_EMAIL_TYPE, COLORS.textMuted),
          fontFamily: DATA_FONT_FAMILY,
        })
        .setOrigin(1, 0),
      loadingStar: addCelestialSprite(
        this,
        getAtlasPresentation(this.celestial, LOADING_STAR_ID),
        0,
        0,
      ),
    };
    // 이전 create 의 Button 은 씬 종료와 함께 사라졌으므로 메뉴를 처음부터 구성한다.
    this.menuItems = [];
    this.menuButtons = [];
    this.renderMenu(view);
    addMenuKeyHintRow(this, this.i18n.t('main.hint'), SCREEN_LAYOUT.leftXPx);
    this.renderAccount(view);
    playCelestialEntryTransition(this, this.celestial, logo.getBounds());
    // 화면이 없어진 뒤 로그인 결과가 도착해도 반영되지 않도록 진행 중인 시도를 무효로 만든다.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.account.kind === 'signingIn') {
        this.auth.cancelSignIn();
        this.account = createAccountState(null);
      }
    });
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, view)),
    );
  }

  /** 계정 상태에서 파생한 메뉴 항목이 바뀌었을 때만 메뉴 Button 을 다시 만든다. 계정 Button 은 유지한다. */
  private renderMenu(view: AccountView, focusedItem?: MenuItem): void {
    const items = getMainMenuItems(this.account);
    if (
      items.length === this.menuItems.length &&
      items.every((item, index) => item === this.menuItems[index])
    ) {
      return;
    }
    this.menuButtons.forEach((button) => button.destroy());
    const entries = items.map((item, index) => ({
      item,
      button: new Button(
        this,
        SCREEN_LAYOUT.leftXPx,
        index === 0 ? MENU_FIRST_Y_PX : MENU_REST_TOP_Y_PX + (index - 1) * MENU_REST_SPACING_PX,
        {
          ...MENU_ITEMS[item],
          onActivate: () => this.activate(item, view),
        },
      ),
    }));
    this.menuItems = items;
    this.menuButtons = entries.map(({ button }) => button);
    // 화면 모서리에 있어도 키보드로 닿을 수 있도록 포커스 순서의 마지막에 둔다.
    this.menu = new MenuFocus<MenuItem>(
      [
        ...entries,
        { item: 'account', button: view.button },
        { item: 'youtube', button: view.youtubeButton },
      ],
      focusedItem,
    );
  }

  private handleKey(event: KeyboardEvent, view: AccountView): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    switch (readMenuAction(event)) {
      case 'up':
        this.menu.move(-1);
        break;
      case 'down':
        this.menu.move(1);
        break;
      case 'confirm':
        this.activate(this.menu.getFocused(), view);
        break;
      default:
        break;
    }
  }

  private activate(item: MenuItem, view: AccountView): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    switch (item) {
      case 'play':
        this.exit = exitScene(this, this.exit, { key: 'songSelect', data: undefined });
        return;
      case 'chartEditor':
        this.exit = exitScene(this, this.exit, {
          key: 'chartEditorSelect',
          data: { focusedSongId: null, filter: 'all' },
        });
        return;
      case 'settings':
        this.exit = exitScene(this, this.exit, {
          key: 'settings',
          data: { returnScene: 'main' },
        });
        return;
      case 'credits':
        this.exit = exitScene(this, this.exit, { key: 'credits', data: undefined });
        return;
      case 'account':
        this.activateAccount(view);
        return;
      case 'youtube':
        // 게임 화면을 유지하도록 새 탭으로 연다.
        window.open(YOUTUBE_URL, '_blank', 'noopener');
        return;
    }
  }

  /** 저장된 세션을 해석하지 못해도 인증은 플레이에 필요 없으므로 세션을 지우고 Guest 로 둔다. */
  private restoreAccount(): AccountState {
    let user: AuthUser | null;
    try {
      user = this.auth.getCurrentUser();
    } catch (error) {
      console.error('Failed to restore signed-in user', error);
      this.auth.signOut();
      return createAccountState(null);
    }
    return createAccountState(user);
  }

  /** popup 이 사용자 입력에 이어지도록 signIn 호출 앞에 await 를 두지 않는다. */
  private activateAccount(view: AccountView): void {
    switch (this.account.kind) {
      case 'guest': {
        const attempt = startSignIn();
        const signInResult = this.auth.signIn();
        this.applyAccount(view, attempt);
        void signInResult.then(
          (user) =>
            this.applyAccount(
              view,
              user === null
                ? cancelSignIn(this.account, attempt)
                : completeSignIn(this.account, attempt, user),
            ),
          (error: unknown) => {
            console.error('Failed to sign in with Google', error);
            this.applyAccount(view, failSignIn(this.account, attempt));
          },
        );
        return;
      }
      case 'signingIn':
        this.auth.cancelSignIn();
        this.applyAccount(view, createAccountState(null));
        return;
      case 'signedIn':
        this.auth.signOut();
        this.applyAccount(view, createAccountState(null));
        return;
    }
  }

  /** 상태가 그대로면 아무것도 다시 그리지 않는다. */
  private applyAccount(view: AccountView, next: AccountState): void {
    if (next === this.account) {
      return;
    }
    this.account = next;
    this.renderAccount(view);
    this.renderMenu(view, this.menu.getFocused());
  }

  private renderAccount(view: AccountView): void {
    const account = this.account;
    // 로그인 전·진행 중에는 G 아이콘만 둔다(진행 중에 누르면 취소). 아이콘을 못 불러왔으면 글자 라벨로 대신한다.
    const isIconButton =
      account.kind !== 'signedIn' && this.textures.exists(GOOGLE_ICON_TEXTURE_KEY);
    if (isIconButton) {
      view.button.setIcon(GOOGLE_ICON_TEXTURE_KEY, GOOGLE_ICON_SIZE_PX);
    } else {
      view.button.setLabel(ACCOUNT_LABELS[account.kind]);
    }
    // 내용에 따라 폭이 바뀌므로 오른쪽 끝을 다시 맞춘다.
    view.button.alignX(isIconButton ? GOOGLE_BUTTON_RIGHT_X_PX : ACCOUNT_BUTTON_RIGHT_X_PX, 1);
    const status = this.accountStatus(account);
    view.status.setText(status).setVisible(status !== '');
    const isSignedIn = account.kind === 'signedIn';
    view.userName.setText(isSignedIn ? account.user.name : '').setVisible(isSignedIn);
    view.userEmail.setText(isSignedIn ? account.user.email : '').setVisible(isSignedIn);
    this.layoutAccount(view, account);
    if (view.loadingStar !== null) {
      this.renderLoadingStar(view.loadingStar, view.button, account.kind === 'signingIn');
    }
  }

  /**
   * 상태별로 보이는 줄을 위에서부터 쌓고 그 둘레에 카드를 맞춘다.
   * 버튼 라벨의 윗선이 구분선 아래 간격에 오도록 quiet 버튼의 세로 여백만큼 버튼을 올린다.
   */
  private layoutAccount(view: AccountView, account: AccountState): void {
    const placeActionBelow = (infoBottomYPx: number, infoLeftXPx: number): void => {
      view.button.setY(infoBottomYPx + ACCOUNT_ACTION_GAP_PX - QUIET_PADDING_Y_PX);
      const labelLeftXPx = ACCOUNT_RIGHT_X_PX - (view.button.width - QUIET_PADDING_X_PX * 2);
      const contentLeftXPx = Math.min(infoLeftXPx, labelLeftXPx);
      this.fitAccountCard(
        view,
        contentLeftXPx,
        ACCOUNT_TOP_Y_PX,
        view.button.y + view.button.height - QUIET_PADDING_Y_PX,
      );
      view.divider
        .setPosition(contentLeftXPx, infoBottomYPx + ACCOUNT_ACTION_GAP_PX / 2)
        .setSize(ACCOUNT_RIGHT_X_PX - contentLeftXPx, ACCOUNT_CARD_BORDER_PX)
        .setVisible(true);
    };
    switch (account.kind) {
      case 'signedIn': {
        view.userEmail.setY(view.userName.y + view.userName.height + USER_NAME_EMAIL_GAP_PX);
        placeActionBelow(
          view.userEmail.y + view.userEmail.height,
          Math.min(getLeftXPx(view.userName), getLeftXPx(view.userEmail)),
        );
        return;
      }
      case 'signingIn':
      case 'guest':
        view.button.setY(GOOGLE_BUTTON_TOP_Y_PX);
        view.divider.setVisible(false);
        // 실패했을 때만 G 아이콘 아래에 안내 카드를 붙인다.
        if (!view.status.visible) {
          view.card.setVisible(false);
          return;
        }
        view.status.setY(
          view.button.y + view.button.height + GOOGLE_STATUS_GAP_PX + ACCOUNT_CARD_PADDING_Y_PX,
        );
        this.fitAccountCard(
          view,
          getLeftXPx(view.status),
          view.status.y,
          view.status.y + view.status.height,
        );
        return;
    }
  }

  /** 내용 사각형(오른쪽 끝은 ACCOUNT_RIGHT_X_PX)에 카드 여백을 더해 카드를 맞춘다. */
  private fitAccountCard(
    view: AccountView,
    contentLeftXPx: number,
    contentTopYPx: number,
    contentBottomYPx: number,
  ): void {
    view.card
      .setPosition(
        contentLeftXPx - ACCOUNT_CARD_PADDING_X_PX,
        contentTopYPx - ACCOUNT_CARD_PADDING_Y_PX,
      )
      .setSize(
        ACCOUNT_RIGHT_X_PX - contentLeftXPx + ACCOUNT_CARD_PADDING_X_PX * 2,
        contentBottomYPx - contentTopYPx + ACCOUNT_CARD_PADDING_Y_PX * 2,
      )
      .setVisible(true);
  }

  /** 로그인 진행 중에만 계정 버튼(G 아이콘) 내용 왼쪽에서 loop 한다. 진행 중 안내 문구는 따로 띄우지 않는다. */
  private renderLoadingStar(
    star: Phaser.GameObjects.Sprite,
    button: Button,
    isSigningIn: boolean,
  ): void {
    if (isSigningIn) {
      star.setPosition(
        button.x + QUIET_PADDING_X_PX - LOADING_STAR_GAP_PX,
        button.y + button.height / 2,
      );
    }
    setCelestialLoopActive(star, isSigningIn);
  }

  private accountStatus(account: AccountState): string {
    switch (account.kind) {
      case 'guest':
        return account.hasSignInFailed ? this.i18n.t('main.account.signInFailed') : '';
      case 'signingIn':
      case 'signedIn':
        return '';
    }
  }
}

/** 오른쪽 위 기준(origin 1, 0)으로 놓은 글자의 왼쪽 끝 */
function getLeftXPx(text: Phaser.GameObjects.Text): number {
  return text.x - text.width;
}
