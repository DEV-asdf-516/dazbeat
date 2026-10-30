import type Phaser from 'phaser';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
  getCelestialEntryTransitionUses,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import type { CelestialScreen } from '../celestial/celestialPlacements.js';
import type { CelestialTextureUse } from '../celestial/celestialSprites.js';
import { getControlsGuide } from '../controlsGuide.js';
import type { Messages } from '../../i18n/messages/ko.js';
import type { Settings } from '../../storage/settings.js';
import { ControlsOverlay, addControlsEntry } from './ControlsOverlay.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from './menuInput.js';
import type { MenuAction } from './menuInput.js';
import { SCREEN_LAYOUT } from './theme.js';

export function getMenuSceneTextureUses(
  catalog: CelestialCatalog,
  screen: CelestialScreen,
): readonly CelestialTextureUse[] {
  return [
    ...getCelestialAtmosphereUses(catalog, screen),
    ...getCelestialEntryTransitionUses(catalog),
  ];
}

export interface MenuSceneChromeOptions {
  readonly celestial: CelestialCatalog;
  readonly screen: CelestialScreen;
  readonly readControlsMessages: () => Messages['controls'];
  readonly readSettings: () => Pick<Settings, 'keyBindings' | 'laneMode'>;
}

export interface MenuSceneKeys {
  readonly isLeaving: () => boolean;
  /** 조작 안내 팝업보다 먼저 키를 받는 입력 모드. 받았으면 true. */
  readonly captureKey?: (event: KeyboardEvent) => boolean;
  readonly handleMenuKey: (action: MenuAction | null, event: KeyboardEvent) => void;
}

/** 메뉴 씬이 함께 쓰는 배경 분위기, 조작 안내 팝업과 진입 버튼, 진입 연출, 키 처리 앞부분. */
export class MenuSceneChrome {
  private readonly overlay: ControlsOverlay;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: MenuSceneChromeOptions,
  ) {
    addCelestialAtmosphere(scene, options.celestial, options.screen);
    this.overlay = new ControlsOverlay(scene, () =>
      getControlsGuide(options.readControlsMessages(), options.readSettings()),
    );
  }

  get isControlsOpen(): boolean {
    return this.overlay.isOpen;
  }

  start(focal: Phaser.Geom.Rectangle, keys: MenuSceneKeys): Phaser.GameObjects.Container {
    const entry = addControlsEntry(this.scene, SCREEN_LAYOUT.leftXPx, SCREEN_LAYOUT.hintYPx, () =>
      this.overlay.open(),
    );
    playCelestialEntryTransition(this.scene, this.options.celestial, focal);
    requireKeyboard(this.scene).on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => {
        if (keys.isLeaving()) {
          return;
        }
        if (keys.captureKey !== undefined && keys.captureKey(event)) {
          return;
        }
        if (this.overlay.handleKey(event)) {
          return;
        }
        keys.handleMenuKey(readMenuAction(event), event);
      }),
    );
    return entry;
  }
}
