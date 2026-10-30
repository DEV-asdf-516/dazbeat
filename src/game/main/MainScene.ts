import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { AchievementCatalog } from '../../data/achievements.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import type { AccountAuth } from '../app/accountState.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../app/config.js';
import { getControlsGuide } from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { SceneRequest } from '../app/sceneRoutes.js';
import { getAccountPanel } from './state/accountPanel.js';
import { MainController } from './MainController.js';
import type { CornerPanel, UserPanel } from './state/accountPanel.js';
import { addConstellationFigure } from './view/constellationFigure.js';
import {
  getChangedRegions,
  getMainButtonView,
  getMainControlsCloseView,
  getMainMenuItems,
  isMainControlsEntryHovered,
  isMainFocused,
} from './state/mainMenu.js';
import { getSignOutIconTexture } from './view/signOutIcon.js';
import type {
  MainButton,
  MainFocus,
  MainMenuItem,
  MainRegion,
  MainState,
} from './state/mainMenu.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { getAchievementEmblemTexture } from '../ui/view/widgets/achievementEmblem.js';
import { requireDefined } from '../../invariant.js';
import { Button, QUIET_PADDING_PX } from '../ui/view/widgets/Button.js';
import {
  addCelestialSprite,
  playCelestialOnce,
  queueCelestialTextures,
} from '../celestial/view/celestialSprites.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { queueImageLoads } from '../ui/view/textures/imageLoad.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { YOUTUBE_HEART_IMAGE, playYoutubeHearts } from './view/youtubeHearts.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { LOADING_STAR_ID, LoadingStar } from '../ui/view/widgets/LoadingStar.js';
import {
  CARD_PANEL,
  COLORS,
  MOTION,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  textStyle,
  typeStyle,
} from '../ui/view/theme.js';

const LOGO_Y_PX = 300;
const PLAY_SPACING_AFTER_PX = 120;
const MENU_SPACING_PX = 64;
const MENU_ITEMS: Record<
  MainMenuItem,
  { label: string; request: SceneRequest; spacingAfterPx: number }
> = {
  play: {
    label: 'PLAY',
    request: {
      key: 'songSelect',
      data: { mode: 'standard' },
    },
    spacingAfterPx: PLAY_SPACING_AFTER_PX,
  },
  practice: {
    label: 'PRACTICE',
    request: {
      key: 'songSelect',
      data: { mode: 'practice' },
    },
    spacingAfterPx: MENU_SPACING_PX,
  },
  chartEditor: {
    label: 'CHART EDITOR',
    request: {
      key: 'chartEditorSelect',
      data: { kind: 'fresh' },
    },
    spacingAfterPx: MENU_SPACING_PX,
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
    spacingAfterPx: MENU_SPACING_PX,
  },
  credits: {
    label: 'CREDITS',
    request: {
      key: 'credits',
      data: undefined,
    },
    spacingAfterPx: MENU_SPACING_PX,
  },
};
const PROFILE_REQUEST: SceneRequest = {
  key: 'profile',
  data: undefined,
};
const MENU_TOP_Y_PX = 560;
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

interface MainView {
  chrome: MenuSceneChrome;
  account: AccountView;
  menuButtons: readonly { item: MainMenuItem; button: Button }[];
}

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
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly auth: AccountAuth,
    private readonly celestial: CelestialCatalog,
    private readonly catalog: AchievementCatalog,
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
    const pointer: ButtonPointer<MainButton> = {
      pointerOver: (button) => controller.pointerOver(button),
      pointerOut: (button) => controller.pointerOut(button),
      pointerDown: (button) => controller.pointerDown(button),
      pointerUp: (button) => controller.pointerUp(button),
    };
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'main',
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => {
          switch (action) {
            case 'up':
              controller.moveFocus(-1);
              return;
            case 'down':
              controller.moveFocus(1);
              return;
            case 'confirm':
              controller.confirm();
              return;
            default:
              return;
          }
        },
      },
      pointer,
    );
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
      pointer: pointButton(pointer, 'profile'),
    }).setVisible(false);
    // 계정 동작은 메뉴보다 한 단계 작은 글자로 두어 PLAY 등 주 메뉴와 경쟁하지 않게 한다.
    const accountButton = new Button(this, 0, 0, {
      variant: 'quiet',
      focus: 'slide',
      label: '',
      labelType: TYPE_SCALE.secondary,
      pointer: pointButton(pointer, 'account'),
    });
    const youtubeButton = new Button(this, 0, YOUTUBE_BUTTON_TOP_Y_PX, {
      variant: 'quiet',
      focus: 'slide',
      label: 'YOUTUBE',
      pointer: pointButton(pointer, 'youtube'),
    });
    if (this.textures.exists(YOUTUBE_ICON_TEXTURE_KEY)) {
      youtubeButton.setIcon(YOUTUBE_ICON_TEXTURE_KEY, YOUTUBE_ICON_SIZE_PX);
    }
    youtubeButton.alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
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
    // 메뉴 항목마다 버튼을 한 번만 만들고, 계정에 따라 보일 버튼과 자리는 menu 영역이 정한다.
    const menuItems: readonly MainMenuItem[] = [
      'play',
      'practice',
      'chartEditor',
      'settings',
      'credits',
    ];
    const mainView: MainView = {
      chrome,
      account: view,
      menuButtons: menuItems.map((item) => ({
        item,
        button: new Button(this, SCREEN_LAYOUT.leftXPx, MENU_TOP_Y_PX, {
          label: MENU_ITEMS[item].label,
          variant: 'quiet',
          focus: 'slide',
          pointer: pointButton(pointer, item),
        }),
      })),
    };
    chrome.start(logo.getBounds());
    const controller = new MainController(this.auth, {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next)) {
          this.renderRegion(mainView, next, region);
        }
      },
      playFocusSound: () => soundEffects.play('menuFocus'),
      activate: (button) => this.activate(button, controller),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
  }

  private renderRegion(view: MainView, state: MainState, region: MainRegion): void {
    switch (region) {
      case 'account':
        this.renderAccount(view.account, state);
        return;
      case 'menu': {
        view.menuButtons.forEach(({ button }) => button.setVisible(false));
        let yPx = MENU_TOP_Y_PX;
        for (const item of getMainMenuItems(state.account)) {
          requireDefined(
            view.menuButtons.find((entry) => entry.item === item),
            'Missing main menu button',
            item,
          )
            .button.setY(yPx)
            .setVisible(true);
          yPx += MENU_ITEMS[item].spacingAfterPx;
        }
        return;
      }
      case 'menuButtons':
        view.menuButtons.forEach(({ item, button }) =>
          button.render(getMainButtonView(state, item)),
        );
        return;
      case 'profileButton':
        view.account.profileButton.render(getMainButtonView(state, 'profile'));
        return;
      case 'accountButton':
        view.account.button.render(getMainButtonView(state, 'account'));
        return;
      case 'youtubeButton':
        view.account.youtubeButton.render(getMainButtonView(state, 'youtube'));
        return;
      case 'controlsEntry':
        view.chrome.renderControlsEntry(isMainControlsEntryHovered(state));
        return;
      case 'controlsClose':
        view.chrome.renderControlsClose(getMainControlsCloseView(state));
        return;
      case 'menuFocusMotion':
        view.menuButtons.forEach(({ item, button }) =>
          button.playFocus(isMainFocused(state, item)),
        );
        view.account.profileButton.playFocus(isMainFocused(state, 'profile'));
        view.account.youtubeButton.playFocus(isMainFocused(state, 'youtube'));
        return;
      case 'menuItemsMotion':
        view.menuButtons.forEach(({ item, button }) =>
          button.playFocus(isMainFocused(state, item)),
        );
        return;
      case 'controls':
        view.chrome.renderControls(
          state.isControlsOpen
            ? getControlsGuide(
                this.i18n.t('controls', { returnObjects: true }),
                this.save.loadSettings(),
              )
            : null,
        );
        return;
      case 'youtubeHearts':
        playYoutubeHearts(this, view.account.youtubeButton);
        return;
    }
  }

  // 씬 전환 중에는 이동하지 않고 계정 로그인·로그아웃도 시작하지 않는다.
  private activate(item: MainFocus | 'account', controller: MainController): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    switch (item) {
      case 'account':
        controller.activateAccount();
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

  private renderAccount(view: AccountView, state: MainState): void {
    const panel = getAccountPanel(state.account, view.hasGoogleIcon, this.catalog);
    switch (panel.kind) {
      case 'user':
        this.renderUserPanel(view, panel);
        view.loadingStar.show(null);
        return;
      case 'corner':
        this.renderCornerPanel(view, panel);
        view.loadingStar.show(
          panel.isSigningIn
            ? {
                left: view.button.x + QUIET_PADDING_PX.xPx,
                centerY: view.button.y + view.button.height / 2,
              }
            : null,
        );
        return;
    }
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
          getAchievementEmblemTexture(
            this,
            this.catalog,
            panel.featuredAchievement,
            USER_EMBLEM_SIZE_PX,
          ),
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
