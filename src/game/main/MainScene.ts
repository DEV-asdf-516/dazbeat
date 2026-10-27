import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import type { AccountAuth, AccountState } from '../accountState.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { SCENE_KEYS, exitScene } from '../sceneRoutes.js';
import type { SceneRequest } from '../sceneRoutes.js';
import { getAccountPanel } from './accountPanel.js';
import { MainController } from './MainController.js';
import type { CornerPanel, UserPanel } from './accountPanel.js';
import { addConstellationFigure } from './constellationFigure.js';
import { getMainMenuItems } from './mainMenu.js';
import { getSignOutIconTexture } from './signOutIcon.js';
import type { MainMenuItem } from './mainMenu.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { getAchievementEmblemTexture } from '../ui/achievementEmblem.js';
import { Button, QUIET_PADDING_PX } from '../ui/Button.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
} from '../celestial/celestialSprites.js';
import { queueImageLoads } from '../ui/imageLoad.js';
import { MenuFocus } from '../ui/MenuFocus.js';
import { SoundEffects, queueSoundEffects } from '../ui/soundEffects.js';
import { YOUTUBE_HEART_IMAGE, playYoutubeHearts } from './youtubeHearts.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/MenuSceneChrome.js';
import type { MenuAction } from '../ui/menuInput.js';
import { LOADING_STAR_ID, LoadingStar } from '../ui/LoadingStar.js';
import {
  CARD_PANEL,
  COLORS,
  MOTION,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  textStyle,
  typeStyle,
} from '../ui/theme.js';

type MenuItem = MainMenuItem | 'account' | 'profile' | 'youtube';

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
const PROFILE_REQUEST: SceneRequest = {
  key: 'profile',
  data: undefined,
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
const ACCOUNT_RIGHT_X_PX = GAME_WIDTH - ACCOUNT_EDGE_PX - ACCOUNT_CARD_PADDING_X_PX;
const ACCOUNT_BUTTON_RIGHT_X_PX = ACCOUNT_RIGHT_X_PX + QUIET_PADDING_PX.xPx;
const ACCOUNT_TOP_Y_PX = ACCOUNT_EDGE_PX + ACCOUNT_CARD_PADDING_Y_PX;
const GOOGLE_BUTTON_TOP_Y_PX = ACCOUNT_EDGE_PX - QUIET_PADDING_PX.yPx;
const GOOGLE_BUTTON_RIGHT_X_PX = GAME_WIDTH - ACCOUNT_EDGE_PX + QUIET_PADDING_PX.xPx;
const GOOGLE_STATUS_GAP_PX = 12;
const USER_NAME_EMAIL_GAP_PX = 2;
const USER_EMBLEM_SIZE_PX = 28;
const USER_EMBLEM_GAP_PX = 8;
const USER_NAME_WEIGHT = 600;
const ACCOUNT_ACTION_ICON_SIZE_PX = 32;
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

interface AccountView {
  hasGoogleIcon: boolean;
  button: Button;
  profileButton: Button;
  youtubeButton: Button;
  card: Phaser.GameObjects.Rectangle;
  divider: Phaser.GameObjects.Rectangle;
  status: Phaser.GameObjects.Text;
  userName: Phaser.GameObjects.Text;
  userEmblem: Phaser.GameObjects.Image;
  userEmail: Phaser.GameObjects.Text;
  loadingStar: LoadingStar;
}

export class MainScene extends Phaser.Scene {
  private menuEntries: readonly { item: MainMenuItem; button: Button }[] = [];
  private menu = new MenuFocus<MenuItem>([], () => undefined);
  private playFocusSound: () => void = () => undefined;
  private activateAccount: () => void = () => undefined;
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
      ...getMenuSceneTextureUses(this.celestial, 'main'),
      this.celestial.atlasPresentations[TITLE_THREAD_ID],
      this.celestial.atlasPresentations[LOGO_GLINT_ID],
      this.celestial.atlasPresentations[LOADING_STAR_ID],
    ]);
  }

  create(): void {
    this.exit = STAYING;
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    this.playFocusSound = () => soundEffects.play('menuFocus');
    const chrome = new MenuSceneChrome(this, {
      celestial: this.celestial,
      screen: 'main',
      readControlsMessages: () => this.i18n.t('controls', { returnObjects: true }),
      readSettings: () => this.save.loadSettings(),
    });
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
      .rectangle(0, 0, 0, 0, CARD_PANEL.fillColor, CARD_PANEL.fillAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(CARD_PANEL.borderPx, CARD_PANEL.borderColor, CARD_PANEL.borderAlpha)
      .setRounded(RADIUS.mediumPx);
    const divider = this.add
      .rectangle(0, 0, 0, CARD_PANEL.borderPx, COLORS.textMuted, ACCOUNT_DIVIDER_ALPHA)
      .setOrigin(0.5, 0);
    // 이름과 이메일 줄을 덮는 프로필 진입 버튼이다. hover 배경이 글자 아래에 오도록 글자보다 먼저 만든다.
    const profileButton = new Button(this, 0, 0, {
      variant: 'quiet',
      focus: 'outline',
      label: '',
      colors: { hoverFill: COLORS.surfaceRaised },
      onActivate: () => this.activate('profile'),
    }).setVisible(false);
    // 계정 동작은 메뉴보다 한 단계 작은 글자로 두어 PLAY 등 주 메뉴와 경쟁하지 않게 한다.
    const accountButton = new Button(this, 0, 0, {
      variant: 'quiet',
      focus: 'slide',
      label: '',
      labelType: TYPE_SCALE.secondary,
      onActivate: () => this.activate('account'),
    });
    const youtubeButton = new Button(this, 0, YOUTUBE_BUTTON_TOP_Y_PX, {
      variant: 'quiet',
      focus: 'slide',
      label: 'YOUTUBE',
      onActivate: () => this.activate('youtube'),
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
      profileButton,
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
        .setOrigin(0, 0),
      // 엠블럼 텍스처는 표시 크기로 그려지므로 기본 텍스처에 크기를 맞추지 않는다.
      userEmblem: this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0.5).setVisible(false),
      userEmail: this.add
        .text(ACCOUNT_RIGHT_X_PX, 0, '', typeStyle(USER_EMAIL_TYPE, COLORS.textMuted))
        .setOrigin(0, 0),
      loadingStar: new LoadingStar(this, this.celestial),
    };
    // 이전 create 의 Button 은 씬 종료와 함께 사라졌으므로 메뉴를 처음부터 구성한다.
    this.menuEntries = [];
    // 지난 방문의 메뉴 포커스는 이어받지 않고 첫 그리기는 첫 항목에 둔다.
    let isMenuDrawn = false;
    const controller = new MainController(this.auth, {
      showAccount: (account) => {
        this.renderAccount(view, account);
        this.renderMenu(view, account, isMenuDrawn ? this.menu.getFocused() : undefined);
        isMenuDrawn = true;
      },
    });
    this.activateAccount = () => controller.activateAccount();
    chrome.start(logo.getBounds(), {
      isLeaving: () => this.exit.kind === 'leaving',
      handleMenuKey: (action) => this.handleMenuKey(action),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
  }

  private renderMenu(view: AccountView, account: AccountState, focusedItem?: MenuItem): void {
    const items = getMainMenuItems(account);
    if (
      items.length !== this.menuEntries.length ||
      items.some((item, index) => item !== this.menuEntries[index]?.item)
    ) {
      this.menuEntries.forEach(({ button }) => button.destroy());
      this.menuEntries = items.map((item, index) => ({
        item,
        button: new Button(
          this,
          SCREEN_LAYOUT.leftXPx,
          index === 0 ? MENU_FIRST_Y_PX : MENU_REST_TOP_Y_PX + (index - 1) * MENU_REST_SPACING_PX,
          {
            label: MENU_ITEMS[item].label,
            variant: 'quiet',
            focus: 'slide',
            onActivate: () => this.activate(item),
          },
        ),
      }));
    }
    // 프로필 진입은 로그인 상태에 따라 생기고 없어지므로, 메뉴 항목이 그대로여도 포커스 순서는 다시 만든다.
    // 화면 모서리에 있어도 키보드로 닿을 수 있도록 포커스 순서의 마지막에 둔다.
    this.menu = new MenuFocus<MenuItem>(
      [
        ...this.menuEntries,
        ...(account.kind === 'signedIn'
          ? [
              {
                item: 'profile' as const,
                button: view.profileButton,
              },
            ]
          : []),
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

  private handleMenuKey(action: MenuAction | null): void {
    switch (action) {
      case 'up':
        this.menu.move(-1);
        break;
      case 'down':
        this.menu.move(1);
        break;
      case 'confirm':
        this.activate(this.menu.getFocused());
        break;
      default:
        break;
    }
  }

  private activate(item: MenuItem): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    switch (item) {
      case 'account':
        this.activateAccount();
        return;
      case 'profile':
        this.exit = exitScene(this, this.exit, PROFILE_REQUEST);
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

  private renderAccount(view: AccountView, account: AccountState): void {
    const panel = getAccountPanel(account, view.hasGoogleIcon);
    switch (panel.kind) {
      case 'user':
        this.renderUserPanel(view, panel);
        break;
      case 'corner':
        this.renderCornerPanel(view, panel);
        break;
    }
    // 진행 중 안내 문구는 따로 띄우지 않고 버튼 글자 옆에서 별만 돌린다.
    view.loadingStar.show(
      account.kind === 'signingIn'
        ? {
            left: view.button.x + QUIET_PADDING_PX.xPx,
            centerY: view.button.y + view.button.height / 2,
          }
        : null,
    );
  }

  private renderUserPanel(view: AccountView, panel: UserPanel): void {
    view.button
      .setIcon(
        getSignOutIconTexture(this, ACCOUNT_ACTION_ICON_SIZE_PX),
        ACCOUNT_ACTION_ICON_SIZE_PX,
      )
      .alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
    view.status.setVisible(false);
    view.userName.setText(panel.nickname).setVisible(true);
    view.userEmail.setText(panel.email).setVisible(true);
    const infoTopYPx = ACCOUNT_TOP_Y_PX;
    view.userEmail.setY(view.userName.y + view.userName.height + USER_NAME_EMAIL_GAP_PX);
    const infoBottomYPx = view.userEmail.y + view.userEmail.height;
    view.button.setY((infoTopYPx + infoBottomYPx) / 2 - view.button.height / 2);
    const dividerXPx = ACCOUNT_RIGHT_X_PX - ACCOUNT_ACTION_ICON_SIZE_PX - ACCOUNT_CARD_PADDING_X_PX;
    const infoRightXPx = dividerXPx - ACCOUNT_CARD_PADDING_X_PX;
    const indentPx =
      panel.featuredAchievement === null ? 0 : USER_EMBLEM_SIZE_PX + USER_EMBLEM_GAP_PX;
    const infoWidthPx = indentPx + Math.max(view.userName.width, view.userEmail.width);
    const contentLeftXPx = infoRightXPx - infoWidthPx;
    if (panel.featuredAchievement === null) {
      view.userEmblem.setVisible(false);
    } else {
      view.userEmblem
        .setTexture(
          getAchievementEmblemTexture(this, panel.featuredAchievement, USER_EMBLEM_SIZE_PX),
        )
        .setPosition(contentLeftXPx, view.userName.y + view.userName.height / 2)
        .setVisible(true);
    }
    view.userName.setX(contentLeftXPx + indentPx);
    view.userEmail.setX(contentLeftXPx + indentPx);
    this.fitAccountCard(view, contentLeftXPx, infoTopYPx, infoBottomYPx);
    view.divider
      .setPosition(dividerXPx, infoTopYPx)
      .setSize(CARD_PANEL.borderPx, infoBottomYPx - infoTopYPx)
      .setVisible(true);
    view.profileButton
      .setFixedSize(
        infoWidthPx + QUIET_PADDING_PX.xPx * 2,
        infoBottomYPx - infoTopYPx + QUIET_PADDING_PX.yPx * 2,
      )
      .setPosition(contentLeftXPx - QUIET_PADDING_PX.xPx, infoTopYPx - QUIET_PADDING_PX.yPx)
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
    view.userEmblem.setVisible(false);
    view.userEmail.setVisible(false);
    view.profileButton.setVisible(false);
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
}

function getLeftXPx(text: Phaser.GameObjects.Text): number {
  return text.x - text.width;
}
