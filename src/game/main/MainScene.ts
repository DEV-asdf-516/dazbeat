import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { AchievementCatalog } from '../../data/achievements.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import type { AccountAuth, SignInFailure } from '../app/accountState.js';
import { getControlsGuide } from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { SceneRequest } from '../app/sceneRoutes.js';
import { getAccountPanel } from './state/accountPanel.js';
import { MainController } from './MainController.js';
import type { CornerPanel, UserPanel } from './state/accountPanel.js';
import {
  getChangedRegions,
  getMainButtonView,
  getMainControlsCloseView,
  getMainMenuItems,
  isMainControlsEntryHovered,
  isMainFocused,
} from './state/mainMenu.js';
import type {
  MainButton,
  MainFocus,
  MainMenuItem,
  MainRegion,
  MainState,
} from './state/mainMenu.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { queueAchievementEmblemLoads } from '../ui/view/widgets/achievementEmblem.js';
import { requireDefined } from '../../invariant.js';
import { Button, QUIET_PADDING_PX } from '../ui/view/widgets/Button.js';
import {
  ACCOUNT_BUTTON_RIGHT_X_PX,
  ACCOUNT_CARD_PADDING_X_PX,
  ACCOUNT_CARD_PADDING_Y_PX,
  ACCOUNT_RIGHT_X_PX,
  IDENTITY_CENTER_Y_PX,
  AccountNameplate,
  addAccountActionButton,
  addAccountCard,
  fitAccountCard,
} from '../ui/view/widgets/accountCard.js';
import { MENU_KEY_HINT_STYLE } from '../ui/view/widgets/keyHintView.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { queueImageLoads } from '../ui/view/textures/imageLoad.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { YOUTUBE_HEART_IMAGE, playYoutubeHearts } from './view/youtubeHearts.js';
import { ListRowMarker, SelectedRowHalo } from '../ui/view/widgets/listRowFocus.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import {
  TITLE_CHARACTER_IMAGE,
  addTitleBackdrop,
  getTitleBackdropTextureUses,
} from '../ui/view/widgets/titleBackdrop.js';
import { LOADING_STAR_ID, LoadingStar } from '../ui/view/widgets/LoadingStar.js';
import { COLORS, LIST_ROW, SCREEN_LAYOUT, textStyle } from '../ui/view/theme.js';
import { MOTION } from '../ui/state/motion.js';

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
  data: {
    returnTo: {
      key: 'main',
      data: undefined,
    },
  },
};
const MENU_TOP_Y_PX = 560;
// 곡 선택과 설정의 선택 행과 같은 별과 고리를 포커스된 항목에 둔다. 배경 그림 위라 판은 쓰지 않는다. 좌표는 버튼 기준이다.
const MENU_FOCUS_NODE_ID = 'R17';
const MENU_FOCUS_HALO_ID = 'R29';
const MENU_FOCUS_NODE_X_PX = QUIET_PADDING_PX.xPx - LIST_ROW.nodeOffsetXPx;
const GOOGLE_ICON_TEXTURE_KEY = 'ui:google-g';
const GOOGLE_ICON_PATH = '/assets/ui/google-g.svg';
const GOOGLE_ICON_SIZE_PX = 64;
const GOOGLE_STATUS_GAP_PX = 12;
const SIGN_IN_FAILURE_KEYS = {
  failed: 'main.account.signInFailed',
  rejoinBlocked: 'main.account.rejoinBlocked',
} as const satisfies Record<SignInFailure, string>;
const YOUTUBE_URL = 'https://www.youtube.com/@dazbeeee';
const YOUTUBE_ICON_TEXTURE_KEY = 'ui:youtube';
const YOUTUBE_ICON_PATH = '/assets/ui/youtube.svg';
const YOUTUBE_ICON_SIZE_PX = 64;
const YOUTUBE_BUTTON_TOP_Y_PX =
  SCREEN_LAYOUT.hintYPx +
  (MENU_KEY_HINT_STYLE.capHeightPx - YOUTUBE_ICON_SIZE_PX) / 2 -
  QUIET_PADDING_PX.yPx;

interface MainView {
  chrome: MenuSceneChrome;
  account: AccountView;
  menuButtons: readonly {
    item: MainMenuItem;
    button: Button;
    marker: ListRowMarker;
    halo: SelectedRowHalo;
  }[];
}

interface AccountView {
  hasGoogleIcon: boolean;
  button: Button;
  nameplate: AccountNameplate;
  youtubeButton: Button;
  card: Phaser.GameObjects.Image;
  status: Phaser.GameObjects.Text;
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
        TITLE_CHARACTER_IMAGE,
      ],
      'main scene image',
    );
    queueAchievementEmblemLoads(this);
    queueSoundEffects(this);
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'main'),
      ...getTitleBackdropTextureUses(this.celestial),
      this.celestial.atlasPresentations[LOADING_STAR_ID],
      this.celestial.atlasPresentations[MENU_FOCUS_NODE_ID],
      this.celestial.atlasPresentations[MENU_FOCUS_HALO_ID],
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
        account: null,
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
    this.cameras.main.fadeIn(MOTION.mediumMs);
    const logo = addTitleBackdrop(this, this.celestial);
    // 카드는 계정 버튼보다 아래에 그려지도록 먼저 만든다.
    const card = addAccountCard(this);
    const accountButton = addAccountActionButton(this, pointButton(pointer, 'account'));
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
      nameplate: new AccountNameplate(this, this.catalog, pointButton(pointer, 'profile')),
      youtubeButton,
      card,
      status: this.add
        .text(ACCOUNT_RIGHT_X_PX, 0, '', textStyle('meta', COLORS.textSecondary))
        .setOrigin(1, 0),
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
      menuButtons: menuItems.map((item) => {
        const button = new Button(this, SCREEN_LAYOUT.leftXPx, MENU_TOP_Y_PX, {
          label: MENU_ITEMS[item].label,
          variant: 'quiet',
          focus: 'slide',
          pointer: pointButton(pointer, item),
        });
        const marker = new ListRowMarker(
          this,
          {
            topYPx: 0,
            heightPx: button.height,
            nodeXPx: MENU_FOCUS_NODE_X_PX,
            fillXPx: MENU_FOCUS_NODE_X_PX,
            fillWidthPx: 0,
          },
          this.celestial.atlasPresentations[MENU_FOCUS_NODE_ID],
        );
        const halo = new SelectedRowHalo(
          this,
          this.celestial.atlasPresentations[MENU_FOCUS_HALO_ID],
        );
        // 버튼에 넣어 메뉴 자리와 숨김을 함께 따른다.
        button.addAt([...marker.getVisuals(), halo.sprite], 0);
        return {
          item,
          button,
          marker,
          halo,
        };
      }),
    };
    chrome.start(logo.getBounds());
    const controller = new MainController(this.auth, {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next)) {
          this.renderRegion(mainView, next, region);
        }
      },
      playSound: (sound) => soundEffects.play(sound),
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
        view.menuButtons.forEach(({ item, button, marker, halo }) => {
          button.render(getMainButtonView(state, item));
          const isFocused = isMainFocused(state, item);
          marker.render(
            isFocused
              ? {
                  node: this.celestial.atlasPresentations[MENU_FOCUS_NODE_ID],
                  isSelected: false,
                }
              : null,
          );
          halo.render(isFocused ? marker : null);
        });
        return;
      case 'profileButton':
        view.account.nameplate.renderButton(getMainButtonView(state, 'profile'));
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
    view.status.setVisible(false);
    view.card.setVisible(false);
    view.button.setVisible(false);
    view.nameplate.render(panel);
  }

  private renderCornerPanel(view: AccountView, panel: CornerPanel): void {
    switch (panel.content.kind) {
      case 'icon':
        view.button
          .setIcon(GOOGLE_ICON_TEXTURE_KEY, GOOGLE_ICON_SIZE_PX)
          .alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
        break;
      case 'label':
        view.button.setLabel(panel.content.text).alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
        break;
    }
    view.button.setY(IDENTITY_CENTER_Y_PX - view.button.height / 2).setVisible(true);
    view.nameplate.render(null);
    view.status.setVisible(panel.failureNotice !== 'none');
    if (panel.failureNotice === 'none') {
      view.card.setVisible(false);
      return;
    }
    view.status.setText(this.i18n.t(SIGN_IN_FAILURE_KEYS[panel.failureNotice]));
    view.status.setY(
      view.button.y + view.button.height + GOOGLE_STATUS_GAP_PX + ACCOUNT_CARD_PADDING_Y_PX,
    );
    fitAccountCard(
      view.card,
      getLeftXPx(view.status) - ACCOUNT_CARD_PADDING_X_PX,
      view.status.y,
      view.status.y + view.status.height,
    );
  }
}

function getLeftXPx(text: Phaser.GameObjects.Text): number {
  return text.x - text.width;
}
