import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { Song } from '../../data/songs.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { SCENE_KEYS, exitScene } from '../config.js';
import type { SceneRequest } from '../config.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import { createAuxiliaryButton } from '../ui/auxiliaryButton.js';
import {
  addCelestialAtmosphere,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  queueCelestialTextures,
  registerCelestialAnimations,
} from '../celestial/celestialSprites.js';
import { addMenuKeyHintRow } from '../ui/keyHintView.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { COLORS, SCREEN_LAYOUT, textStyle } from '../ui/theme.js';

const CREDITS_TOP_Y_PX = 200;
const CREDIT_LINE_SPACING_PX = 36;
const SONG_GAP_PX = 48;

export class CreditsScene extends Phaser.Scene {
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly songs: readonly Song[],
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.credits);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial);
  }

  create(): void {
    this.exit = STAYING;
    registerCelestialAnimations(this, this.celestial);
    addCelestialAtmosphere(this, this.celestial, 'secondary');
    const keyboard = requireKeyboard(this);
    const title = this.add.text(
      SCREEN_LAYOUT.leftXPx,
      SCREEN_LAYOUT.headerYPx,
      this.i18n.t('credits.title'),
      textStyle('heading', COLORS.textPrimary),
    );
    createAuxiliaryButton(this, 0, title.y + title.height / 2, {
      label: 'BACK',
      onActivate: () => this.back(),
    })
      .alignX(SCREEN_LAYOUT.rightXPx, 1)
      .setFocused(true);

    let yPx = CREDITS_TOP_Y_PX;
    this.songs.forEach((song) => {
      if (song.credit === undefined) {
        return;
      }
      this.add.text(
        SCREEN_LAYOUT.leftXPx,
        yPx,
        song.title,
        textStyle('primary', COLORS.textPrimary),
      );
      yPx += CREDIT_LINE_SPACING_PX;
      song.credit.forEach((line) => {
        this.add.text(
          SCREEN_LAYOUT.leftXPx,
          yPx,
          line,
          textStyle('secondary', COLORS.textSecondary),
        );
        yPx += CREDIT_LINE_SPACING_PX;
      });
      yPx += SONG_GAP_PX;
    });

    addMenuKeyHintRow(this, this.i18n.t('credits.hint'), SCREEN_LAYOUT.leftXPx);
    playCelestialEntryTransition(this, this.celestial, title.getBounds());
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event)),
    );
  }

  private handleKey(event: KeyboardEvent): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    const action = readMenuAction(event);
    if (action === 'back' || action === 'confirm') {
      this.back();
    }
  }

  private back(): void {
    this.exit = exitScene(this, this.exit, { key: 'main', data: undefined });
  }
}
