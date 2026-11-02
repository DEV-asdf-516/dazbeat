import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
} from '../celestial/view/celestialAtmosphere.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import { SCENE_KEYS } from '../app/sceneRoutes.js';
import { readMenuAction } from '../ui/state/menuAction.js';
import { MOTION } from '../ui/state/motion.js';
import { pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import { handleEachEventOnce, requireKeyboard } from '../ui/view/input/menuInput.js';
import { queueImageLoads } from '../ui/view/textures/imageLoad.js';
import { Button } from '../ui/view/widgets/Button.js';
import {
  TITLE_CHARACTER_IMAGE,
  addTitleBackdrop,
  getTitleBackdropTextureUses,
} from '../ui/view/widgets/titleBackdrop.js';
import { COLORS, SCREEN_LAYOUT, textStyle } from '../ui/view/theme.js';
import { BootErrorController } from './BootErrorController.js';
import type { BootErrorPorts } from './BootErrorController.js';
import { getChangedRegions, getRetryButtonView } from './state/bootErrorState.js';
import type { BootErrorButton } from './state/bootErrorState.js';

const TITLE_Y_PX = 572;
const MESSAGE_Y_PX = 648;
const HINT_Y_PX = 692;
const MESSAGE_WEIGHT = 300;
const RETRY_TOP_Y_PX = 784;
const RETRY_WIDTH_PX = 320;
const RETRY_HEIGHT_PX = 64;

export class BootErrorScene extends Phaser.Scene {
  constructor(
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
    private readonly ports: BootErrorPorts,
  ) {
    super(SCENE_KEYS.bootError);
  }

  preload(): void {
    queueImageLoads(this, [TITLE_CHARACTER_IMAGE], 'boot error image');
    queueCelestialTextures(this, this.celestial, [
      ...getCelestialAtmosphereUses(this.celestial, 'main'),
      ...getTitleBackdropTextureUses(this.celestial),
    ]);
  }

  create(): void {
    const pointer: ButtonPointer<BootErrorButton> = {
      pointerOver: (button) => controller.pointerOver(button),
      pointerOut: (button) => controller.pointerOut(button),
      pointerDown: (button) => controller.pointerDown(button),
      pointerUp: (button) => controller.pointerUp(button),
    };
    addCelestialAtmosphere(this, this.celestial, 'main');
    this.cameras.main.fadeIn(MOTION.mediumMs);
    addTitleBackdrop(this, this.celestial);
    this.add.text(
      SCREEN_LAYOUT.leftXPx,
      TITLE_Y_PX,
      'LOAD FAILED',
      textStyle('heading', COLORS.textPrimary),
    );
    this.add.text(
      SCREEN_LAYOUT.leftXPx,
      MESSAGE_Y_PX,
      this.i18n.t('boot.loadFailed'),
      textStyle('secondary', COLORS.textSecondary, MESSAGE_WEIGHT),
    );
    this.add.text(
      SCREEN_LAYOUT.leftXPx,
      HINT_Y_PX,
      this.i18n.t('boot.checkConnection'),
      textStyle('secondary', COLORS.textSecondary, MESSAGE_WEIGHT),
    );
    const retryButton = new Button(this, SCREEN_LAYOUT.leftXPx, RETRY_TOP_Y_PX, {
      variant: 'primary',
      label: 'RETRY',
      widthPx: RETRY_WIDTH_PX,
      heightPx: RETRY_HEIGHT_PX,
      pointer: pointButton(pointer, 'retry'),
    });
    const controller = new BootErrorController(this.ports, {
      render: (previous, next) => {
        if (getChangedRegions(previous, next).includes('retryButton')) {
          retryButton.render(getRetryButtonView(next));
        }
      },
    });
    requireKeyboard(this).on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => {
        if (readMenuAction(event) === 'confirm') {
          controller.retry();
        }
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
  }
}
