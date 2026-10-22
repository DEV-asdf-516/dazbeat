import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { getControlsGuide } from '../controlsGuide.js';
import type { SongFeed } from '../SongFeed.js';
import { SCENE_KEYS, exitScene } from '../sceneRoutes.js';
import type { SceneRequest } from '../sceneRoutes.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { createHeaderAuxiliaryButtons } from '../ui/auxiliaryButton.js';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
  getCelestialEntryTransitionUses,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import { queueCelestialTextures } from '../celestial/celestialSprites.js';
import { setFittedText } from '../ui/fitText.js';
import { ControlsOverlay, addControlsEntry } from '../ui/ControlsOverlay.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { CELESTIAL_COLORS, COLORS, SCREEN_LAYOUT, textStyle } from '../ui/theme.js';
import { IDLE_WHEEL, readWheelRows } from '../wheelRows.js';
import {
  INITIAL_CREDITS_STATE,
  getCreditRowCount,
  scrollCredits,
  withCreditSongs,
} from './creditsState.js';
import type { CreditsGrid, CreditsState } from './creditsState.js';

const GRID_TOP_Y_PX = 200;
const GRID: CreditsGrid = {
  columnCount: 2,
  visibleRowCount: 5,
};
const COLUMN_GAP_PX = 96;
const COLUMN_WIDTH_PX =
  (SCREEN_LAYOUT.rightXPx - SCREEN_LAYOUT.leftXPx - COLUMN_GAP_PX * (GRID.columnCount - 1)) /
  GRID.columnCount;
const CREDIT_LINE_SPACING_PX = 30;
/** 줄 간격이 고정이라 넘치는 줄은 그리지 않고, 마지막 줄 끝에 … 를 붙여 더 있음을 알린다. */
const CREDIT_LINE_COUNT = 2;
const SONG_GAP_PX = 40;
const ROW_STRIDE_PX = CREDIT_LINE_SPACING_PX * (1 + CREDIT_LINE_COUNT) + SONG_GAP_PX;
const GRID_HEIGHT_PX = ROW_STRIDE_PX * GRID.visibleRowCount - SONG_GAP_PX;
const SCROLLBAR_X_PX = SCREEN_LAYOUT.rightXPx + 16;
const SCROLLBAR_WIDTH_PX = 3;
const SCROLLBAR_TRACK_ALPHA = 0.3;

interface CellView {
  title: Phaser.GameObjects.Text;
  lines: Phaser.GameObjects.Text[];
}

interface CreditsView {
  cells: CellView[];
  scrollThumb: Phaser.GameObjects.Rectangle;
}

export class CreditsScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;
  private state: CreditsState = INITIAL_CREDITS_STATE;

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
      ...getCelestialAtmosphereUses(this.celestial, 'secondary'),
      ...getCelestialEntryTransitionUses(this.celestial),
    ]);
  }

  create(): void {
    this.exit = STAYING;
    this.state = INITIAL_CREDITS_STATE;
    addCelestialAtmosphere(this, this.celestial, 'secondary');
    const keyboard = requireKeyboard(this);
    const title = this.add.text(
      SCREEN_LAYOUT.leftXPx,
      SCREEN_LAYOUT.headerYPx,
      this.i18n.t('credits.title'),
      textStyle('heading', COLORS.textPrimary),
    );
    createHeaderAuxiliaryButtons(this, [
      {
        label: 'BACK',
        onActivate: () => this.back(),
      },
    ]);

    this.add
      .rectangle(
        SCROLLBAR_X_PX,
        GRID_TOP_Y_PX,
        SCROLLBAR_WIDTH_PX,
        GRID_HEIGHT_PX,
        CELESTIAL_COLORS.border,
        SCROLLBAR_TRACK_ALPHA,
      )
      .setOrigin(0, 0);
    const view: CreditsView = {
      cells: Array.from({ length: GRID.columnCount * GRID.visibleRowCount }, (_, index) =>
        this.createCell(index),
      ),
      scrollThumb: this.add
        .rectangle(SCROLLBAR_X_PX, GRID_TOP_Y_PX, SCROLLBAR_WIDTH_PX, 0, CELESTIAL_COLORS.selected)
        .setOrigin(0, 0),
    };

    const applyCatalogChange = (): void =>
      this.applyTransition(view, (state) => withCreditSongs(state, this.catalog.songs));
    applyCatalogChange();
    const unsubscribe = this.catalog.subscribe(applyCatalogChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    void this.catalog.requestRemaining();

    const overlay = new ControlsOverlay(this, () =>
      getControlsGuide(
        this.i18n.t('controls', { returnObjects: true }),
        this.save.loadSettings().keyBindings,
      ),
    );
    let wheel = IDLE_WHEEL;
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) => {
        if (overlay.isOpen) {
          return;
        }
        const read = readWheelRows(wheel, deltaY, this.time.now, ROW_STRIDE_PX);
        wheel = read.gesture;
        this.applyTransition(view, (state) => scrollCredits(state, GRID, read.rows));
      },
    );

    addControlsEntry(this, SCREEN_LAYOUT.leftXPx, SCREEN_LAYOUT.hintYPx, () => overlay.open());
    playCelestialEntryTransition(this, this.celestial, title.getBounds());
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, view, overlay)),
    );
  }

  private handleKey(event: KeyboardEvent, view: CreditsView, overlay: ControlsOverlay): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    if (overlay.handleKey(event)) {
      return;
    }
    const action = readMenuAction(event);
    if (action === 'back' || action === 'confirm') {
      this.back();
    } else if (action === 'up') {
      this.applyTransition(view, (state) => scrollCredits(state, GRID, -1));
    } else if (action === 'down') {
      this.applyTransition(view, (state) => scrollCredits(state, GRID, 1));
    }
  }

  private applyTransition(
    view: CreditsView,
    transition: (state: CreditsState) => CreditsState,
  ): void {
    const next = transition(this.state);
    if (next === this.state) {
      return;
    }
    this.state = next;
    this.render(view);
  }

  private render(view: CreditsView): void {
    const { entries, topRow } = this.state;
    view.cells.forEach((cell, index) => {
      const entry = entries[topRow * GRID.columnCount + index];
      setFittedText(cell.title, entry?.title ?? '', COLUMN_WIDTH_PX);
      const hasHiddenLines = (entry?.credit.length ?? 0) > CREDIT_LINE_COUNT;
      cell.lines.forEach((line, lineIndex) => {
        const value = entry?.credit[lineIndex] ?? '';
        const isLastLine = lineIndex === CREDIT_LINE_COUNT - 1;
        setFittedText(line, hasHiddenLines && isLastLine ? `${value}…` : value, COLUMN_WIDTH_PX);
      });
    });
    const rowCount = Math.max(getCreditRowCount(this.state, GRID), 1);
    view.scrollThumb
      .setVisible(rowCount > GRID.visibleRowCount)
      .setPosition(SCROLLBAR_X_PX, GRID_TOP_Y_PX + (GRID_HEIGHT_PX * topRow) / rowCount)
      .setSize(SCROLLBAR_WIDTH_PX, (GRID_HEIGHT_PX * GRID.visibleRowCount) / rowCount);
  }

  private createCell(index: number): CellView {
    const leftPx =
      SCREEN_LAYOUT.leftXPx + (index % GRID.columnCount) * (COLUMN_WIDTH_PX + COLUMN_GAP_PX);
    const topPx = GRID_TOP_Y_PX + Math.floor(index / GRID.columnCount) * ROW_STRIDE_PX;
    return {
      title: this.add.text(leftPx, topPx, '', textStyle('secondary', COLORS.textPrimary, 600)),
      lines: Array.from({ length: CREDIT_LINE_COUNT }, (_, lineIndex) =>
        this.add.text(
          leftPx,
          topPx + (lineIndex + 1) * CREDIT_LINE_SPACING_PX,
          '',
          textStyle('meta', COLORS.textSecondary),
        ),
      ),
    };
  }

  private back(): void {
    this.exit = exitScene(this, this.exit, {
      key: 'main',
      data: undefined,
    });
  }
}
