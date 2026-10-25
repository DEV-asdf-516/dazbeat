import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { AuthUser } from '../../data/account.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import {
  cancelSignIn,
  completeSignIn,
  createAccountState,
  failSignIn,
  startSignIn,
} from '../accountState.js';
import type { AccountAuth, AccountState } from '../accountState.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { getControlsGuide } from '../controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../sceneRoutes.js';
import type { SceneRequest } from '../sceneRoutes.js';
import { getAccountPanel } from './accountPanel.js';
import type { CornerPanel, UserPanel } from './accountPanel.js';
import { addConstellationFigure } from './constellationFigure.js';
import { getMainMenuItems } from './mainMenu.js';
import type { MainMenuItem } from './mainMenu.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { Button, QUIET_PADDING_PX } from '../ui/Button.js';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
  getCelestialEntryTransitionUses,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
  setCelestialLoopActive,
} from '../celestial/celestialSprites.js';
import { queueImageLoads } from '../ui/imageLoad.js';
import { MenuFocus } from '../ui/MenuFocus.js';
import { SoundEffects, queueSoundEffects } from '../ui/soundEffects.js';
import { YOUTUBE_HEART_IMAGE, playYoutubeHearts } from './youtubeHearts.js';
import { ControlsOverlay, addControlsEntry } from '../ui/ControlsOverlay.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import {
  COLORS,
  MOTION,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  textStyle,
  typeStyle,
} from '../ui/theme.js';

type MenuItem = MainMenuItem | 'account' | 'youtube';

const LOGO_Y_PX = 300;
const MENU_ITEMS: Record<MainMenuItem, { label: string; request: SceneRequest }> = {
  play: {
    label: 'PLAY',
    request: {
      key: 'songSelect',
      data: { mode: 'standard' },
    },
  },
  practice: {
    label: 'PRACTICE',
    request: {
      key: 'songSelect',
      data: { mode: 'practice' },
    },
  },
  chartEditor: {
    label: 'CHART EDITOR',
    request: {
      key: 'chartEditorSelect',
      data: { kind: 'fresh' },
    },
  },
  settings: {
    label: 'SETTINGS',
    request: {
      key: 'settings',
      data: {
        returnTo: {
          key: 'main',
          data: undefined,
        },
      },
    },
  },
  credits: {
    label: 'CREDITS',
    request: {
      key: 'credits',
      data: undefined,
    },
  },
};
const MENU_FIRST_Y_PX = 560;
const MENU_REST_TOP_Y_PX = 680;
const MENU_REST_SPACING_PX = 64;
const GOOGLE_ICON_TEXTURE_KEY = 'ui:google-g';
const GOOGLE_ICON_PATH = '/assets/ui/google-g.svg';
const GOOGLE_ICON_SIZE_PX = 64;
// 계정 영역은 메뉴 여백(SCREEN_LAYOUT)을 따르지 않고 화면 모서리에 붙인다.
const ACCOUNT_EDGE_PX = 32;
/** 이름·이메일·로그인 상태 문구는 배경 그림 위에 그대로 두면 떠 보이므로 반투명 카드 위에 얹는다. */
const ACCOUNT_CARD_PADDING_X_PX = 20;
const ACCOUNT_CARD_PADDING_Y_PX = 16;
const ACCOUNT_CARD_FILL_ALPHA = 0.6;
const ACCOUNT_CARD_BORDER_ALPHA = 0.35;
const ACCOUNT_CARD_BORDER_PX = 1;
const ACCOUNT_RIGHT_X_PX = GAME_WIDTH - ACCOUNT_EDGE_PX - ACCOUNT_CARD_PADDING_X_PX;
const ACCOUNT_BUTTON_RIGHT_X_PX = ACCOUNT_RIGHT_X_PX + QUIET_PADDING_PX.xPx;
const ACCOUNT_TOP_Y_PX = ACCOUNT_EDGE_PX + ACCOUNT_CARD_PADDING_Y_PX;
const GOOGLE_BUTTON_TOP_Y_PX = ACCOUNT_EDGE_PX - QUIET_PADDING_PX.yPx;
const GOOGLE_BUTTON_RIGHT_X_PX = GAME_WIDTH - ACCOUNT_EDGE_PX + QUIET_PADDING_PX.xPx;
const GOOGLE_STATUS_GAP_PX = 12;
const USER_NAME_EMAIL_GAP_PX = 2;
const USER_NAME_WEIGHT = 600;
const ACCOUNT_ACTION_GAP_PX = 24;
const ACCOUNT_DIVIDER_ALPHA = 0.3;
/** 한 단계 줄여 이름보다 앞서지 않게 한다. */
const USER_EMAIL_TYPE = {
  sizePx: 18,
  weight: 400,
} as const;
const YOUTUBE_URL = 'https://www.youtube.com/@dazbeeee';
const YOUTUBE_ICON_TEXTURE_KEY = 'ui:youtube';
const YOUTUBE_ICON_PATH = '/assets/ui/youtube.svg';
const YOUTUBE_ICON_SIZE_PX = 64;
const YOUTUBE_BUTTON_TOP_Y_PX =
  GAME_HEIGHT -
  ACCOUNT_EDGE_PX -
  QUIET_PADDING_PX.yPx -
  YOUTUBE_ICON_SIZE_PX -
  QUIET_PADDING_PX.yPx;

const TITLE_THREAD_ID = 'R26';
const TITLE_THREAD_POSITION_PX = {
  x: 540,
  y: 505,
} as const;
const LOGO_GLINT_ID = 'R25';
const LOGO_GLINT_POSITION_PX = {
  x: 900,
  y: 478,
} as const;
const CHARACTER_TEXTURE_KEY = 'ui:dazbee-constellation';
const CHARACTER_PATH = '/assets/ui/main/dazbee-constellation-lineart.png';
const CHARACTER_CENTER_PX = {
  x: 1400,
  y: 560,
} as const;
const CHARACTER_SCALE = 0.64;
/**
 * 캐릭터 아랫단이 화면 끝에서 칼로 자른 듯 끊기지 않도록 배경 아래쪽 밤색으로 서서히 덮는다.
 * 색은 R01 배경 아래 띠의 평균색이다.
 */
const GROUND_FADE_COLOR = 0x050c1a;
const GROUND_FADE_TOP_Y_PX = 820;
const GROUND_FADE_MAX_ALPHA = 0.92;
const LOADING_STAR_ID = 'R47';
const LOADING_STAR_GAP_PX = 24;

interface AccountView {
  hasGoogleIcon: boolean;
  button: Button;
  youtubeButton: Button;
  card: Phaser.GameObjects.Rectangle;
  divider: Phaser.GameObjects.Rectangle;
  status: Phaser.GameObjects.Text;
  userName: Phaser.GameObjects.Text;
  userEmail: Phaser.GameObjects.Text;
  loadingStar: Phaser.GameObjects.Sprite;
}

export class MainScene extends Phaser.Scene {
  private account: AccountState = {
    kind: 'guest',
    hasSignInFailed: false,
  };
  private menuItems: readonly MainMenuItem[] = [];
  private menuButtons: readonly Button[] = [];
  private menu = new MenuFocus<MenuItem>([], () => undefined);
  private playFocusSound: () => void = () => undefined;
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
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
        {
          key: GOOGLE_ICON_TEXTURE_KEY,
          url: GOOGLE_ICON_PATH,
        },
        {
          key: YOUTUBE_ICON_TEXTURE_KEY,
          url: YOUTUBE_ICON_PATH,
        },
        YOUTUBE_HEART_IMAGE,
        {
          key: CHARACTER_TEXTURE_KEY,
          url: CHARACTER_PATH,
        },
      ],
      'main scene image',
    );
    queueSoundEffects(this);
    queueCelestialTextures(this, this.celestial, [
      ...getCelestialAtmosphereUses(this.celestial, 'main'),
      ...getCelestialEntryTransitionUses(this.celestial),
      this.celestial.atlasPresentations[TITLE_THREAD_ID],
      this.celestial.atlasPresentations[LOGO_GLINT_ID],
      this.celestial.atlasPresentations[LOADING_STAR_ID],
    ]);
  }

  create(): void {
    this.exit = STAYING;
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    this.playFocusSound = () => soundEffects.play('menuFocus');
    addCelestialAtmosphere(this, this.celestial, 'main');
    // 배경 바로 위에 두어 로고·메뉴·계정 UI 가 캐릭터 앞에 그려지게 한다.
    if (this.textures.exists(CHARACTER_TEXTURE_KEY)) {
      addConstellationFigure(
        this,
        CHARACTER_TEXTURE_KEY,
        CHARACTER_CENTER_PX.x,
        CHARACTER_CENTER_PX.y,
        CHARACTER_SCALE,
      );
    }
    this.add
      .graphics()
      .fillGradientStyle(
        GROUND_FADE_COLOR,
        GROUND_FADE_COLOR,
        GROUND_FADE_COLOR,
        GROUND_FADE_COLOR,
        0,
        0,
        GROUND_FADE_MAX_ALPHA,
        GROUND_FADE_MAX_ALPHA,
      )
      .fillRect(0, GROUND_FADE_TOP_Y_PX, GAME_WIDTH, GAME_HEIGHT - GROUND_FADE_TOP_Y_PX);
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
      this.celestial.atlasPresentations[TITLE_THREAD_ID],
      TITLE_THREAD_POSITION_PX.x,
      TITLE_THREAD_POSITION_PX.y,
    );
    const logoGlint = addCelestialSprite(
      this,
      this.celestial.atlasPresentations[LOGO_GLINT_ID],
      LOGO_GLINT_POSITION_PX.x,
      LOGO_GLINT_POSITION_PX.y,
    );
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () =>
      playCelestialOnce(logoGlint),
    );
    // 카드와 구분선은 계정 버튼보다 아래에 그려지도록 먼저 만든다.
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
      focus: 'slide',
      label: '',
      labelType: TYPE_SCALE.secondary,
      onActivate: () => this.activate('account', view),
    });
    const youtubeButton = new Button(this, 0, YOUTUBE_BUTTON_TOP_Y_PX, {
      variant: 'quiet',
      focus: 'slide',
      label: 'YOUTUBE',
      onActivate: () => this.activate('youtube', view),
    });
    if (this.textures.exists(YOUTUBE_ICON_TEXTURE_KEY)) {
      youtubeButton.setIcon(YOUTUBE_ICON_TEXTURE_KEY, YOUTUBE_ICON_SIZE_PX);
    }
    youtubeButton.alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
    youtubeButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () =>
      playYoutubeHearts(this, youtubeButton),
    );
    const view: AccountView = {
      hasGoogleIcon: this.textures.exists(GOOGLE_ICON_TEXTURE_KEY),
      button: accountButton,
      youtubeButton,
      card,
      divider,
      status: this.add
        .text(
          ACCOUNT_RIGHT_X_PX,
          0,
          this.i18n.t('main.account.signInFailed'),
          textStyle('meta', COLORS.textSecondary),
        )
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
        .text(ACCOUNT_RIGHT_X_PX, 0, '', typeStyle(USER_EMAIL_TYPE, COLORS.textMuted))
        .setOrigin(1, 0),
      loadingStar: addCelestialSprite(
        this,
        this.celestial.atlasPresentations[LOADING_STAR_ID],
        0,
        0,
      ),
    };
    // 이전 create 의 Button 은 씬 종료와 함께 사라졌으므로 메뉴를 처음부터 구성한다.
    this.menuItems = [];
    this.menuButtons = [];
    this.renderMenu(view);
    this.renderAccount(view);
    playCelestialEntryTransition(this, this.celestial, logo.getBounds());
    const overlay = new ControlsOverlay(this, () =>
      getControlsGuide(this.i18n.t('controls', { returnObjects: true }), this.save.loadSettings()),
    );
    addControlsEntry(this, SCREEN_LAYOUT.leftXPx, SCREEN_LAYOUT.hintYPx, () => overlay.open());
    // 화면이 없어진 뒤 로그인 결과가 도착해도 반영되지 않도록 진행 중인 시도를 무효로 만든다.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.account.kind === 'signingIn') {
        this.auth.cancelSignIn();
        this.account = createAccountState(null);
      }
    });
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, view, overlay)),
    );
  }

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
          label: MENU_ITEMS[item].label,
          variant: 'quiet',
          focus: 'slide',
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
        {
          item: 'youtube',
          button: view.youtubeButton,
        },
      ],
      (item) => {
        this.playFocusSound();
        if (item === 'youtube') {
          playYoutubeHearts(this, view.youtubeButton);
        }
      },
      focusedItem,
    );
  }

  private handleKey(event: KeyboardEvent, view: AccountView, overlay: ControlsOverlay): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    if (overlay.handleKey(event)) {
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
      case 'account':
        this.activateAccount(view);
        return;
      case 'youtube':
        // 게임 화면을 유지하도록 새 탭으로 연다.
        window.open(YOUTUBE_URL, '_blank', 'noopener');
        return;
      default:
        this.exit = exitScene(this, this.exit, MENU_ITEMS[item].request);
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

  private applyAccount(view: AccountView, next: AccountState): void {
    if (next === this.account) {
      return;
    }
    this.account = next;
    this.renderAccount(view);
    this.renderMenu(view, this.menu.getFocused());
  }

  private renderAccount(view: AccountView): void {
    const panel = getAccountPanel(this.account, view.hasGoogleIcon);
    switch (panel.kind) {
      case 'user':
        this.renderUserPanel(view, panel);
        break;
      case 'corner':
        this.renderCornerPanel(view, panel);
        break;
    }
    this.renderLoadingStar(view.loadingStar, view.button, this.account.kind === 'signingIn');
  }

  private renderUserPanel(view: AccountView, panel: UserPanel): void {
    view.button.setLabel(panel.actionLabel).alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
    view.status.setVisible(false);
    view.userName.setText(panel.name).setVisible(true);
    view.userEmail
      .setText(panel.email)
      .setY(view.userName.y + view.userName.height + USER_NAME_EMAIL_GAP_PX)
      .setVisible(true);
    const infoBottomYPx = view.userEmail.y + view.userEmail.height;
    view.button.setY(infoBottomYPx + ACCOUNT_ACTION_GAP_PX - QUIET_PADDING_PX.yPx);
    const labelLeftXPx = ACCOUNT_RIGHT_X_PX - (view.button.width - QUIET_PADDING_PX.xPx * 2);
    const contentLeftXPx = Math.min(
      getLeftXPx(view.userName),
      getLeftXPx(view.userEmail),
      labelLeftXPx,
    );
    this.fitAccountCard(
      view,
      contentLeftXPx,
      ACCOUNT_TOP_Y_PX,
      view.button.y + view.button.height - QUIET_PADDING_PX.yPx,
    );
    view.divider
      .setPosition(contentLeftXPx, infoBottomYPx + ACCOUNT_ACTION_GAP_PX / 2)
      .setSize(ACCOUNT_RIGHT_X_PX - contentLeftXPx, ACCOUNT_CARD_BORDER_PX)
      .setVisible(true);
  }

  private renderCornerPanel(view: AccountView, panel: CornerPanel): void {
    switch (panel.content.kind) {
      case 'icon':
        view.button
          .setIcon(GOOGLE_ICON_TEXTURE_KEY, GOOGLE_ICON_SIZE_PX)
          .alignX(GOOGLE_BUTTON_RIGHT_X_PX, 1);
        break;
      case 'label':
        view.button.setLabel(panel.content.text).alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
        break;
    }
    view.button.setY(GOOGLE_BUTTON_TOP_Y_PX);
    view.userName.setVisible(false);
    view.userEmail.setVisible(false);
    view.divider.setVisible(false);
    view.status.setVisible(panel.hasFailureNotice);
    if (!panel.hasFailureNotice) {
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
  }

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

  /** 진행 중 안내 문구는 따로 띄우지 않는다. */
  private renderLoadingStar(
    star: Phaser.GameObjects.Sprite,
    button: Button,
    isSigningIn: boolean,
  ): void {
    if (isSigningIn) {
      star.setPosition(
        button.x + QUIET_PADDING_PX.xPx - LOADING_STAR_GAP_PX,
        button.y + button.height / 2,
      );
    }
    setCelestialLoopActive(star, isSigningIn);
  }
}

function getLeftXPx(text: Phaser.GameObjects.Text): number {
  return text.x - text.width;
}
