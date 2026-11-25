import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { SongFeed } from '../app/SongFeed.js';
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
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { createFooterAuxiliaryButtons } from '../ui/view/widgets/auxiliaryButton.js';
import type { Button } from '../ui/view/widgets/Button.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import { requireDefined } from '../../invariant.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import { getAccountPanelButtonView } from '../ui/state/accountIdentity.js';
import type { AccountSource } from '../ui/state/accountIdentity.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { ScrollBar } from '../ui/view/widgets/ScrollBar.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { COLORS, SCREEN_LAYOUT, textStyle } from '../ui/view/theme.js';
import { CreditsController } from './CreditsController.js';
import type { CreditsScreen } from './CreditsController.js';
import {
  getCreditsButtonView,
  getChangedRegions,
  getCreditCells,
  getCreditScroll,
} from './state/creditsState.js';
import type { CreditsGrid, CreditsLink } from './state/creditsState.js';

const CONTACT_URL = 'https://github.com/DEV-asdf-516/dazbeat/issues';
const GRID_TOP_Y_PX = 200;
const GRID: CreditsGrid = {
  columnCount: 2,
  visibleRowCount: 5,
  lineCount: 2,
};
const COLUMN_GAP_PX = 96;
const COLUMN_WIDTH_PX =
  (SCREEN_LAYOUT.rightXPx - SCREEN_LAYOUT.leftXPx - COLUMN_GAP_PX * (GRID.columnCount - 1)) /
  GRID.columnCount;
const CREDIT_LINE_SPACING_PX = 30;
const SONG_GAP_PX = 40;
const ROW_STRIDE_PX = CREDIT_LINE_SPACING_PX * (1 + GRID.lineCount) + SONG_GAP_PX;
const GRID_HEIGHT_PX = ROW_STRIDE_PX * GRID.visibleRowCount - SONG_GAP_PX;
const SCROLLBAR_X_PX = SCREEN_LAYOUT.rightXPx + 16;

interface CellView {
  title: Phaser.GameObjects.Text;
  lines: Phaser.GameObjects.Text[];
}

interface CreditsView {
  chrome: MenuSceneChrome;
  backButton: Button;
  contactButton: Button;
  privacyButton: Button | null;
  cells: CellView[];
  scrollBar: ScrollBar;
}

export class CreditsScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
    private readonly catalog: SongFeed,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly account: AccountSource,
    private readonly privacyPolicyUrl: string | null,
  ) {
    super(SCENE_KEYS.credits);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'secondary'),
    ]);
    queueSoundEffects(this);
  }

  create(): void {
    this.exit = STAYING;
    const screen: CreditsScreen = {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next)) {
          switch (region) {
            case 'cells':
              for (const [index, cell] of getCreditCells(next, GRID).entries()) {
                const cellView = requireDefined(
                  view.cells[index],
                  'Missing credit cell view',
                  index,
                );
                setFittedText(cellView.title, cell.title, COLUMN_WIDTH_PX);
                cell.lines.forEach((line, lineIndex) =>
                  setFittedText(
                    requireDefined(
                      cellView.lines[lineIndex],
                      'Missing credit line view',
                      lineIndex,
                    ),
                    line,
                    COLUMN_WIDTH_PX,
                  ),
                );
              }
              break;
            case 'controls':
              view.chrome.controls.render(
                isControlsPanelOpen(next)
                  ? getControlsGuide(
                      this.i18n.t('controls', { returnObjects: true }),
                      this.save.loadSettings(),
                    )
                  : null,
              );
              break;
            case 'backButton':
              view.backButton.render(getCreditsButtonView(next, 'back'));
              break;
            case 'contactButton':
              view.contactButton.render(getCreditsButtonView(next, 'contact'));
              break;
            case 'privacyButton':
              view.privacyButton?.render(getCreditsButtonView(next, 'privacy'));
              break;
            case 'controlsEntry':
              view.chrome.renderControlsEntry(isControlsEntryHovered(next.hover));
              break;
            case 'controlsClose':
              view.chrome.controls.closeButton.render(getControlsCloseView(next.hover));
              break;
            case 'controlsHelpCard':
              view.chrome.controls.helpCard.render(isControlsHelpShown(next));
              break;
            case 'controlsHelpButton':
              view.chrome.controls.renderHelpButton(getControlsHelpButtonView(next));
              break;
            case 'accountButton': {
              const views = getAccountPanelButtonView(next.hover);
              view.chrome.accountCorner.nameplate.renderButton(views.accountProfile);
              view.chrome.accountCorner.signInButton.render(views.accountSignIn);
              break;
            }
            case 'scrollBar':
              view.scrollBar.render(getCreditScroll(next, GRID), {
                topYPx: GRID_TOP_Y_PX,
                heightPx: GRID_HEIGHT_PX,
              });
              break;
          }
        }
      },
      playSound: (sound) => soundEffects.play(sound),
      renderAccount: () => {
        const identity = this.account.getIdentity();
        view.chrome.accountCorner.nameplate.render(identity);
        view.chrome.accountCorner.renderSignIn(identity);
      },
      openProfile: () => {
        this.exit = exitScene(this, this.exit, {
          key: 'profile',
          data: {
            returnTo: {
              key: 'credits',
              data: undefined,
            },
          },
        });
      },
      leave: () => {
        this.exit = exitScene(this, this.exit, {
          key: 'main',
          data: undefined,
        });
      },
      // 게임 화면을 유지하도록 새 탭으로 연다.
      openLink: (link) => {
        window.open(this.getLinkUrl(link), '_blank', 'noopener');
      },
    };
    const controller = new CreditsController(this.catalog, screen, GRID, ROW_STRIDE_PX, {
      signIn: () => this.account.signIn(),
    });
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'secondary',
        account: {
          kind: 'corner',
          catalog: this.account.catalog,
          pointer: controller,
        },
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => {
          if (action === 'back' || action === 'confirm') {
            controller.back();
          } else if (action === 'up') {
            controller.scroll(-1);
          } else if (action === 'down') {
            controller.scroll(1);
          }
        },
      },
      controller,
    );
    const identity = this.account.getIdentity();
    chrome.accountCorner.nameplate.render(identity);
    chrome.accountCorner.renderSignIn(identity);
    const title = this.add.text(
      SCREEN_LAYOUT.leftXPx,
      SCREEN_LAYOUT.headerYPx,
      this.i18n.t('credits.title'),
      textStyle('heading', COLORS.textPrimary),
    );
    // 처리방침 주소가 없으면 PRIVACY 를 만들지 않는다. 오른쪽부터 BACK, CONTACT, PRIVACY 순으로 붙는다.
    const [backButton, contactButton, privacyButton] = createFooterAuxiliaryButtons(this, [
      ...(this.privacyPolicyUrl === null
        ? []
        : [
            {
              label: 'PRIVACY',
              pointer: pointButton(controller, 'privacy'),
            },
          ]),
      {
        label: 'CONTACT',
        pointer: pointButton(controller, 'contact'),
      },
      {
        label: 'BACK',
        pointer: pointButton(controller, 'back'),
      },
    ]).toReversed();

    const view: CreditsView = {
      backButton: requireDefined(backButton, 'Missing credits footer button', 'BACK'),
      contactButton: requireDefined(contactButton, 'Missing credits footer button', 'CONTACT'),
      privacyButton: privacyButton ?? null,
      cells: Array.from({ length: GRID.columnCount * GRID.visibleRowCount }, (_, index) =>
        this.createCell(index),
      ),
      scrollBar: new ScrollBar(this, SCROLLBAR_X_PX),
      chrome,
    };

    chrome.start(title.getBounds());
    const soundEffects = new SoundEffects(this, this.save.loadSettings());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) => {
        controller.scrollByWheel(deltaY, this.time.now);
      },
    );
    controller.start();
  }

  private getLinkUrl(link: CreditsLink): string {
    // eslint-disable-next-line dazbeat/two-way-switch -- CREDITS 링크는 늘어난다.
    switch (link) {
      case 'contact':
        return CONTACT_URL;
      case 'privacy':
        // 주소가 없으면 PRIVACY 버튼을 만들지 않으므로 여기 오면 개발 오류다.
        if (this.privacyPolicyUrl === null) {
          throw new Error('Privacy link opened without a privacy policy URL');
        }
        return this.privacyPolicyUrl;
    }
  }

  private createCell(index: number): CellView {
    const leftPx =
      SCREEN_LAYOUT.leftXPx + (index % GRID.columnCount) * (COLUMN_WIDTH_PX + COLUMN_GAP_PX);
    const topPx = GRID_TOP_Y_PX + Math.floor(index / GRID.columnCount) * ROW_STRIDE_PX;
    return {
      title: this.add.text(leftPx, topPx, '', textStyle('secondary', COLORS.textPrimary, 600)),
      lines: Array.from({ length: GRID.lineCount }, (_, lineIndex) =>
        this.add.text(
          leftPx,
          topPx + (lineIndex + 1) * CREDIT_LINE_SPACING_PX,
          '',
          textStyle('meta', COLORS.textSecondary),
        ),
      ),
    };
  }
}
