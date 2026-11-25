import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { AchievementCatalog } from '../../data/achievements.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import type { AccountAuth, SignInFailure } from '../app/accountState.js';
import {
  getControlsCloseView,
  getControlsGuide,
  getControlsHelpButtonView,
  isControlsEntryHovered,
  isControlsHelpShown,
  isControlsPanelOpen,
} from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { SceneRequest } from '../app/sceneRoutes.js';
import { getAccountPanel } from './state/accountPanel.js';
import { MainController } from './MainController.js';
import type { AccelerationNoticePorts, MainScreen } from './MainController.js';
import type { BrowserKind } from './state/accelerationNotice.js';
import {
  getAccelerationNoticeButtonViews,
  getChangedRegions,
  getMainButtonView,
  getMainMenuItems,
  isMainFocused,
} from './state/mainMenu.js';
import type { MainMenuItem } from './state/mainMenu.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { queueAchievementEmblemLoads } from '../ui/view/widgets/achievementEmblem.js';
import { Button, QUIET_PADDING_PX } from '../ui/view/widgets/Button.js';
import {
  ACCOUNT_BUTTON_RIGHT_X_PX,
  ACCOUNT_CARD_PADDING_X_PX,
  ACCOUNT_CARD_PADDING_Y_PX,
  ACCOUNT_RIGHT_X_PX,
  IDENTITY_CENTER_Y_PX,
  AccountNameplate,
  addAccountActionButton,
  GOOGLE_ICON_IMAGE,
  GOOGLE_ICON_SIZE_PX,
  addAccountCard,
  fitAccountCard,
} from '../ui/view/widgets/accountCard.js';
import { MENU_KEY_HINT_STYLE } from '../ui/view/widgets/keyHintView.js';
import { getControlsBaselineYPx } from '../ui/view/widgets/auxiliaryButton.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
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
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import { COLORS, LIST_ROW, SCREEN_LAYOUT, textStyle, typeStyle } from '../ui/view/theme.js';
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
const GOOGLE_STATUS_GAP_PX = 12;
const SIGN_IN_FAILURE_KEYS = {
  failed: 'main.account.signInFailed',
  rejoinBlocked: 'main.account.rejoinBlocked',
} as const satisfies Record<SignInFailure, string>;
const YOUTUBE_URL = 'https://www.youtube.com/@dazbeeee';
const YOUTUBE_ICON_TEXTURE_KEY = 'ui:youtube';
const YOUTUBE_ICON_PATH = '/assets/ui/youtube.svg';
const YOUTUBE_ICON_SIZE_PX = 54;
// youtube.svg 는 80 칸 높이에서 빨간 몸통이 64 칸에서 끝나, 그 바닥을 CONTROLS 기준선에 맞춘다.
const YOUTUBE_ICON_BODY_BOTTOM_RATIO = 64 / 80;
const VERSION_EDGE_PX = 24;
const VERSION_TYPE = {
  sizePx: 18,
  weight: 300,
};
// 그 밖의 브라우저는 설정 위치를 하나로 정할 수 없다.
const ACCELERATION_NOTICE_GUIDES = {
  chrome: {
    bodyKey: 'main.accelerationNotice.body.chrome',
    settingKey: 'main.accelerationNotice.setting.chrome',
  },
  edge: {
    bodyKey: 'main.accelerationNotice.body.edge',
    settingKey: 'main.accelerationNotice.setting.edge',
  },
  whale: {
    bodyKey: 'main.accelerationNotice.body.whale',
    settingKey: 'main.accelerationNotice.setting.whale',
  },
  opera: {
    bodyKey: 'main.accelerationNotice.body.opera',
    settingKey: 'main.accelerationNotice.setting.opera',
  },
  firefox: {
    bodyKey: 'main.accelerationNotice.body.firefox',
    settingKey: 'main.accelerationNotice.setting.firefox',
  },
  other: {
    bodyKey: 'main.accelerationNotice.body.other',
    settingKey: null,
  },
} as const satisfies Record<BrowserKind, { bodyKey: string; settingKey: string | null }>;

interface MainView {
  chrome: MenuSceneChrome;
  accelerationNotice: ConfirmDialog;
  account: AccountView;
  menuButtons: Readonly<Record<MainMenuItem, MenuButtonView>>;
}

interface MenuButtonView {
  item: MainMenuItem;
  button: Button;
  marker: ListRowMarker;
  halo: SelectedRowHalo;
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
    private readonly accelerationNotice: AccelerationNoticePorts,
    private readonly version: string,
  ) {
    super(SCENE_KEYS.main);
  }

  preload(): void {
    queueImageLoads(
      this,
      [
        GOOGLE_ICON_IMAGE,
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
    const screen: MainScreen = {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next)) {
          switch (region) {
            case 'account': {
              const { account } = mainView;
              const panel = getAccountPanel(next.account, account.hasGoogleIcon, this.catalog);
              if (panel.kind === 'user') {
                account.status.setVisible(false);
                account.card.setVisible(false);
                account.button.setVisible(false);
                account.nameplate.render(panel);
                account.loadingStar.show(null);
              } else {
                const { content } = panel;
                account.button
                  .setContent(
                    content.kind === 'icon'
                      ? {
                          kind: 'icon',
                          textureKey: GOOGLE_ICON_IMAGE.key,
                          sizePx: GOOGLE_ICON_SIZE_PX,
                        }
                      : {
                          kind: 'label',
                          label: content.text,
                        },
                  )
                  .alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
                account.button
                  .setY(IDENTITY_CENTER_Y_PX - account.button.height / 2)
                  .setVisible(true);
                account.nameplate.render(null);
                account.status.setVisible(panel.failureNotice !== 'none');
                if (panel.failureNotice === 'none') {
                  account.card.setVisible(false);
                } else {
                  account.status.setText(this.i18n.t(SIGN_IN_FAILURE_KEYS[panel.failureNotice]));
                  account.status.setY(
                    account.button.y +
                      account.button.height +
                      GOOGLE_STATUS_GAP_PX +
                      ACCOUNT_CARD_PADDING_Y_PX,
                  );
                  fitAccountCard(
                    account.card,
                    account.status.x - account.status.width - ACCOUNT_CARD_PADDING_X_PX,
                    account.status.y,
                    account.status.y + account.status.height,
                  );
                }
                account.loadingStar.show(
                  panel.isSigningIn
                    ? {
                        left: account.button.x + QUIET_PADDING_PX.xPx,
                        centerY: account.button.y + account.button.height / 2,
                      }
                    : null,
                );
              }
              break;
            }
            case 'menu': {
              Object.values(mainView.menuButtons).forEach(({ button }) => button.setVisible(false));
              let yPx = MENU_TOP_Y_PX;
              for (const item of getMainMenuItems(next.account)) {
                mainView.menuButtons[item].button.setY(yPx).setVisible(true);
                yPx += MENU_ITEMS[item].spacingAfterPx;
              }
              break;
            }
            case 'menuButtons':
              for (const { item, button, marker, halo } of Object.values(mainView.menuButtons)) {
                button.render(getMainButtonView(next, item));
                const isFocused = isMainFocused(next, item);
                marker.render(
                  isFocused
                    ? {
                        node: this.celestial.atlasPresentations[MENU_FOCUS_NODE_ID],
                        isSelected: false,
                      }
                    : null,
                );
                halo.render(isFocused ? marker : null);
              }
              break;
            case 'profileButton':
              mainView.account.nameplate.renderButton(getMainButtonView(next, 'profile'));
              break;
            case 'accountButton':
              mainView.account.button.render(getMainButtonView(next, 'account'));
              break;
            case 'youtubeButton':
              mainView.account.youtubeButton.render(getMainButtonView(next, 'youtube'));
              break;
            case 'controlsEntry':
              mainView.chrome.renderControlsEntry(isControlsEntryHovered(next.hover));
              break;
            case 'controlsClose':
              mainView.chrome.controls.closeButton.render(getControlsCloseView(next.hover));
              break;
            case 'controlsHelpCard':
              mainView.chrome.controls.helpCard.render(isControlsHelpShown(next));
              break;
            case 'controlsHelpButton':
              mainView.chrome.controls.renderHelpButton(getControlsHelpButtonView(next));
              break;
            case 'menuFocusMotion':
              Object.values(mainView.menuButtons).forEach(({ item, button }) =>
                button.playFocus(isMainFocused(next, item)),
              );
              mainView.account.youtubeButton.playFocus(isMainFocused(next, 'youtube'));
              break;
            case 'menuItemsMotion':
              Object.values(mainView.menuButtons).forEach(({ item, button }) =>
                button.playFocus(isMainFocused(next, item)),
              );
              break;
            case 'controls':
              mainView.chrome.controls.render(
                isControlsPanelOpen(next)
                  ? getControlsGuide(
                      this.i18n.t('controls', { returnObjects: true }),
                      this.save.loadSettings(),
                    )
                  : null,
              );
              break;
            case 'youtubeHearts':
              playYoutubeHearts(this, mainView.account.youtubeButton);
              break;
            case 'accelerationNotice': {
              const notice = next.accelerationNotice;
              if (notice.kind === 'closed') {
                mainView.accelerationNotice.render(null);
                break;
              }
              const { bodyKey, settingKey } = ACCELERATION_NOTICE_GUIDES[notice.browser];
              mainView.accelerationNotice.render({
                title: this.i18n.t('main.accelerationNotice.title'),
                body: this.i18n.t(bodyKey),
                ...(settingKey === null ? {} : { emphasis: this.i18n.t(settingKey) }),
                cancelLabel: this.i18n.t('main.accelerationNotice.dismiss'),
                acceptLabel: this.i18n.t('main.accelerationNotice.accept'),
                acceptTone: 'default',
              });
              break;
            }
            case 'accelerationNoticeButtons': {
              const { dismiss, accept } = getAccelerationNoticeButtonViews(next);
              mainView.accelerationNotice.renderButtons(dismiss, accept);
              break;
            }
          }
        }
      },
      playSound: (sound) => soundEffects.play(sound),
      // 씬 전환 중에는 이동하지 않는다.
      activate: (item) => {
        if (this.exit.kind === 'leaving') {
          return;
        }
        switch (item) {
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
      },
      isLeaving: () => this.exit.kind === 'leaving',
    };
    const controller = new MainController(this.auth, screen, this.accelerationNotice);
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'main',
        account: null,
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        captureKey: (event) => controller.handleAccelerationNoticeKey(event),
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => {
          switch (action) {
            case 'up':
              controller.moveFocus('previous');
              return;
            case 'down':
              controller.moveFocus('next');
              return;
            case 'confirm':
              controller.confirm();
              return;
            default:
              return;
          }
        },
      },
      controller,
    );
    this.cameras.main.fadeIn(MOTION.mediumMs);
    const logo = addTitleBackdrop(this, this.celestial);
    this.add
      .text(
        VERSION_EDGE_PX,
        VERSION_EDGE_PX,
        `v${this.version}`,
        typeStyle(VERSION_TYPE, COLORS.textMuted),
      )
      .setOrigin(0, 0);
    // 카드는 계정 버튼보다 아래에 그려지도록 먼저 만든다.
    const card = addAccountCard(this);
    const accountButton = addAccountActionButton(this, pointButton(controller, 'account'));
    const youtubeButton = new Button(this, 0, 0, {
      variant: 'quiet',
      focus: 'slide',
      label: 'YOUTUBE',
      pointer: pointButton(controller, 'youtube'),
    });
    if (this.textures.exists(YOUTUBE_ICON_TEXTURE_KEY)) {
      youtubeButton
        .setContent({
          kind: 'icon',
          textureKey: YOUTUBE_ICON_TEXTURE_KEY,
          sizePx: YOUTUBE_ICON_SIZE_PX,
        })
        .setY(
          getControlsBaselineYPx(this) -
            YOUTUBE_ICON_SIZE_PX * YOUTUBE_ICON_BODY_BOTTOM_RATIO -
            QUIET_PADDING_PX.yPx,
        );
    } else {
      youtubeButton.setY(
        SCREEN_LAYOUT.hintYPx + (MENU_KEY_HINT_STYLE.capHeightPx - youtubeButton.height) / 2,
      );
    }
    youtubeButton.alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1);
    const view: AccountView = {
      hasGoogleIcon: this.textures.exists(GOOGLE_ICON_IMAGE.key),
      button: accountButton,
      nameplate: new AccountNameplate(this, this.catalog, pointButton(controller, 'profile')),
      youtubeButton,
      card,
      status: this.add
        .text(ACCOUNT_RIGHT_X_PX, 0, '', textStyle('meta', COLORS.textSecondary))
        .setOrigin(1, 0),
      loadingStar: new LoadingStar(this, this.celestial),
    };
    // 메뉴 항목마다 버튼을 한 번만 만들고, 계정에 따라 보일 버튼과 자리는 menu 영역이 정한다.
    const createMenuButton = (item: MainMenuItem): MenuButtonView => {
      const button = new Button(this, SCREEN_LAYOUT.leftXPx, MENU_TOP_Y_PX, {
        label: MENU_ITEMS[item].label,
        variant: 'quiet',
        focus: 'slide',
        pointer: pointButton(controller, item),
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
      const halo = new SelectedRowHalo(this, this.celestial.atlasPresentations[MENU_FOCUS_HALO_ID]);
      // 버튼에 넣어 메뉴 자리와 숨김을 함께 따른다.
      button.addAt([...marker.getVisuals(), halo.sprite], 0);
      return {
        item,
        button,
        marker,
        halo,
      };
    };
    const mainView: MainView = {
      chrome,
      accelerationNotice: new ConfirmDialog(this, {
        cancel: pointButton(controller, 'accelerationNoticeDismiss'),
        accept: pointButton(controller, 'accelerationNoticeAccept'),
      }),
      account: view,
      menuButtons: {
        play: createMenuButton('play'),
        practice: createMenuButton('practice'),
        chartEditor: createMenuButton('chartEditor'),
        settings: createMenuButton('settings'),
        credits: createMenuButton('credits'),
      },
    };
    chrome.start(logo.getBounds());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
    controller.start();
  }
}
