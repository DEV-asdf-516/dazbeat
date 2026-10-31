import type Phaser from 'phaser';
import { MV_MODES } from '../../../storage/settings.js';
import type { MvMode } from '../../../storage/settings.js';
import { requireDefined } from '../../../invariant.js';
import {
  MENU_KEY_HINT_STYLE,
  createKeyCap,
  placeKeyCap,
} from '../../ui/view/widgets/keyHintView.js';
import { CELESTIAL_COLORS, COLORS, GAMEPLAY_DEPTH, textStyle } from '../../ui/view/theme.js';
import { MOTION } from '../../ui/state/motion.js';

// 조작 안내(ControlsOverlay)가 MV 전환 키를 부르는 이름과 같다.
const KEY_LABEL = 'Tab';
const LABEL_GAP_PX = 10;
const PIP_RADIUS_PX = 3.5;
const PIP_GAP_PX = 10;
const PIP_VALUE_GAP_PX = 14;
const PIP_LOOKS = {
  selected: {
    color: CELESTIAL_COLORS.selected,
    alpha: 1,
  },
  idle: {
    color: COLORS.textMuted,
    alpha: 0.45,
  },
} as const;
const VALUE_WEIGHT = 600;
// 연타로 원하는 모드를 찾는 동안 사라지지 않을 만큼 두고, 갑자기 꺼지지 않게 천천히 뺀다.
const HOLD_MS = 1200;
const FADE_OUT_MS = 500;

export class MvModeIndicator {
  private readonly container: Phaser.GameObjects.Container;
  private readonly value: Phaser.GameObjects.Text;
  private readonly pips: readonly {
    readonly mode: MvMode;
    readonly dot: Phaser.GameObjects.Arc;
  }[];

  constructor(
    private readonly scene: Phaser.Scene,
    rightXPx: number,
    yPx: number,
  ) {
    const keyCap = createKeyCap(scene, KEY_LABEL, MENU_KEY_HINT_STYLE);
    placeKeyCap(keyCap, 0, 0);
    let xPx = keyCap.cap.width + MENU_KEY_HINT_STYLE.capLabelGapPx;
    const label = scene.add
      .text(xPx, 0, 'MV', textStyle('meta', COLORS.textMuted))
      .setOrigin(0, 0.5);
    xPx += label.width + LABEL_GAP_PX + PIP_RADIUS_PX;
    this.pips = MV_MODES.map((mode, index) => ({
      mode,
      dot: scene.add.circle(
        xPx + index * (PIP_RADIUS_PX * 2 + PIP_GAP_PX),
        0,
        PIP_RADIUS_PX,
        COLORS.textMuted,
      ),
    }));
    xPx +=
      (MV_MODES.length - 1) * (PIP_RADIUS_PX * 2 + PIP_GAP_PX) + PIP_RADIUS_PX + PIP_VALUE_GAP_PX;
    this.value = scene.add
      .text(xPx, 0, '', textStyle('secondary', COLORS.textPrimary, VALUE_WEIGHT))
      .setOrigin(0, 0.5);
    // 값 글자 폭이 모드마다 달라도 키캡이 움직이지 않게 가장 긴 모드 폭을 자리로 잡는다.
    const valueWidthPx = Math.max(
      ...MV_MODES.map((mode) => this.value.setText(mode.toUpperCase()).width),
    );
    this.container = scene.add
      .container(rightXPx - (xPx + valueWidthPx), yPx, [
        keyCap.cap,
        keyCap.key,
        label,
        ...this.pips.map(({ dot }) => dot),
        this.value,
      ])
      .setDepth(GAMEPLAY_DEPTH.text)
      .setAlpha(0);
  }

  show(
    selected: MvMode,
    marks: readonly { readonly mode: MvMode; readonly isSelected: boolean }[],
  ): void {
    this.value.setText(selected.toUpperCase());
    marks.forEach(({ mode, isSelected }) => {
      const { color, alpha } = PIP_LOOKS[isSelected ? 'selected' : 'idle'];
      requireDefined(
        this.pips.find((pip) => pip.mode === mode),
        'Missing MV mode pip',
        mode,
      )
        .dot.setFillStyle(color)
        .setAlpha(alpha);
    });
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: MOTION.fastMs,
      ease: 'Cubic.Out',
    });
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      delay: MOTION.fastMs + HOLD_MS,
      duration: FADE_OUT_MS,
      ease: 'Cubic.In',
    });
  }
}
