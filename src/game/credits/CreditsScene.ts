import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { SongFeed } from '../app/SongFeed.js';
import { getControlsGuide } from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { SceneRequest } from '../app/sceneRoutes.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { createHeaderAuxiliaryButtons } from '../ui/view/widgets/auxiliaryButton.js';
import type { Button } from '../ui/view/widgets/Button.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import { requireDefined } from '../../invariant.js';
import { setFittedText } from '../ui/view/widgets/fitText.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import type { MenuAction } from '../ui/state/menuAction.js';
import { ScrollBar } from '../ui/view/widgets/ScrollBar.js';
import { COLORS, SCREEN_LAYOUT, textStyle } from '../ui/view/theme.js';
import { CreditsController } from './CreditsController.js';
import {
  getBackButtonView,
  getChangedRegions,
  getCreditCells,
  getCreditScroll,
  getCreditsControlsCloseView,
  isCreditsControlsEntryHovered,
} from './state/creditsState.js';
import type {
  CreditsButton,
  CreditsGrid,
  CreditsRegion,
  CreditsState,
} from './state/creditsState.js';

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
  ) {
    super(SCENE_KEYS.credits);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'secondary'),
    ]);
  }

  create(): void {
    this.exit = STAYING;
    const pointer: ButtonPointer<CreditsButton> = {
      pointerOver: (button) => controller.pointerOver(button),
      pointerOut: (button) => controller.pointerOut(button),
      pointerDown: (button) => controller.pointerDown(button),
      pointerUp: (button) => controller.pointerUp(button),
    };
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'secondary',
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => this.handleMenuKey(action, controller),
      },
      pointer,
    );
    const title = this.add.text(
      SCREEN_LAYOUT.leftXPx,
      SCREEN_LAYOUT.headerYPx,
      this.i18n.t('credits.title'),
      textStyle('heading', COLORS.textPrimary),
    );
    const [backButton] = createHeaderAuxiliaryButtons(this, [
      {
        label: 'BACK',
        pointer: pointButton(pointer, 'back'),
      },
    ]);

    const view: CreditsView = {
      backButton: requireDefined(backButton, 'Missing credits header button', 'BACK'),
      cells: Array.from({ length: GRID.columnCount * GRID.visibleRowCount }, (_, index) =>
        this.createCell(index),
      ),
      scrollBar: new ScrollBar(this, SCROLLBAR_X_PX),
      chrome,
    };

    chrome.start(title.getBounds());
    const controller = new CreditsController(
      this.catalog,
      {
        render: (previous, next) => {
          for (const region of getChangedRegions(previous, next)) {
            this.renderRegion(view, next, region);
          }
        },
        leave: () => {
          this.exit = exitScene(this, this.exit, {
            key: 'main',
            data: undefined,
          });
        },
      },
      GRID,
      ROW_STRIDE_PX,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) => {
        controller.scrollByWheel(deltaY, this.time.now);
      },
    );
  }

  private handleMenuKey(action: MenuAction | null, controller: CreditsController): void {
    if (action === 'back' || action === 'confirm') {
      controller.back();
    } else if (action === 'up') {
      controller.scroll(-1);
    } else if (action === 'down') {
      controller.scroll(1);
    }
  }

  private renderRegion(view: CreditsView, state: CreditsState, region: CreditsRegion): void {
    switch (region) {
      case 'cells':
        getCreditCells(state, GRID).forEach((cell, index) => {
          const cellView = requireDefined(view.cells[index], 'Missing credit cell view', index);
          setFittedText(cellView.title, cell.title, COLUMN_WIDTH_PX);
          cell.lines.forEach((line, lineIndex) =>
            setFittedText(
              requireDefined(cellView.lines[lineIndex], 'Missing credit line view', lineIndex),
              line,
              COLUMN_WIDTH_PX,
            ),
          );
        });
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
      case 'backButton':
        view.backButton.render(getBackButtonView(state));
        return;
      case 'controlsEntry':
        view.chrome.renderControlsEntry(isCreditsControlsEntryHovered(state));
        return;
      case 'controlsClose':
        view.chrome.renderControlsClose(getCreditsControlsCloseView(state));
        return;
      case 'scrollBar':
        view.scrollBar.render(getCreditScroll(state, GRID), {
          topYPx: GRID_TOP_Y_PX,
          heightPx: GRID_HEIGHT_PX,
        });
        return;
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
