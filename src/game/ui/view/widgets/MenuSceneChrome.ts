import type Phaser from 'phaser';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
  getCelestialEntryTransitionUses,
  playCelestialEntryTransition,
} from '../../../celestial/view/celestialAtmosphere.js';
import type { CelestialCatalog } from '../../../celestial/state/celestialCatalog.js';
import type { CelestialScreen } from '../../../celestial/state/celestialPlacements.js';
import type { CelestialTextureUse } from '../../../celestial/view/celestialSprites.js';
import type { ButtonView } from '../../state/buttonPointer.js';
import type { ControlsButton, ControlsGroup } from '../../../app/controlsGuide.js';
import { ControlsOverlay, addControlsEntry } from './ControlsOverlay.js';
import type { ButtonPointer } from '../input/hoverTarget.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../input/menuInput.js';
import type { MenuAction } from '../input/menuInput.js';
import { renderTextEntry } from './textEntry.js';
import { SCREEN_LAYOUT } from '../theme.js';

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
}

export interface MenuSceneKeys {
  readonly isLeaving: () => boolean;
  /** 조작 안내 팝업보다 먼저 키를 받는 입력 모드. 받았으면 true. */
  readonly captureKey?: (event: KeyboardEvent) => boolean;
  /** 조작 안내 팝업을 열고 닫는 키와 열린 동안 막을 키를 받았으면 true. */
  readonly handleControlsKey: (event: KeyboardEvent) => boolean;
  readonly handleMenuKey: (action: MenuAction | null, event: KeyboardEvent) => void;
}

/** 메뉴 씬이 함께 쓰는 배경 분위기, 조작 안내 팝업과 진입 버튼, 진입 연출, 키 처리 앞부분. */
export class MenuSceneChrome {
  private readonly overlay: ControlsOverlay;
  private entryLabel: Phaser.GameObjects.Text | null = null;

  // 닫기 버튼과 막 포인터는 팝업을 만들 때 묶어야 해서 키·포인터 처리를 생성자에서 받는다.
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: MenuSceneChromeOptions,
    private readonly keys: MenuSceneKeys,
    private readonly pointer: ButtonPointer<ControlsButton>,
  ) {
    addCelestialAtmosphere(scene, options.celestial, options.screen);
    this.overlay = new ControlsOverlay(scene, pointer);
  }

  renderControls(guide: readonly ControlsGroup[] | null): void {
    this.overlay.render(guide);
  }

  renderControlsClose(view: ButtonView): void {
    this.overlay.renderCloseButton(view);
  }

  renderControlsEntry(isHovered: boolean): void {
    if (this.entryLabel === null) {
      throw new Error('Controls entry rendered before start');
    }
    renderTextEntry(this.entryLabel, isHovered);
  }

  start(focal: Phaser.Geom.Rectangle): Phaser.GameObjects.Container {
    const { keys } = this;
    const entry = addControlsEntry(
      this.scene,
      SCREEN_LAYOUT.leftXPx,
      SCREEN_LAYOUT.hintYPx,
      this.pointer,
    );
    this.entryLabel = entry.label;
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
        if (keys.handleControlsKey(event)) {
          return;
        }
        keys.handleMenuKey(readMenuAction(event), event);
      }),
    );
    return entry.container;
  }
}
