import Phaser from 'phaser';
import { HOVER_CURSOR } from '../../ui/view/input/cursor.js';
import { CELESTIAL_COLORS, RADIUS, setTextColor, typeStyle } from '../../ui/view/theme.js';
import { MOTION } from '../../ui/state/motion.js';
import { addBakedRoundedRect, bakeTexture } from '../../ui/view/textures/bakedTexture.js';
import { EDITOR_TYPE_SCALE } from './editorTheme.js';
import { requireDefined } from '../../../invariant.js';
import type { SegmentAppearance } from '../state/segmentAppearance.js';

/** graphics 원점은 그림 왼쪽·세로 가운데다. */
export interface SegmentGlyph {
  widthPx: number;
  draw: (graphics: Phaser.GameObjects.Graphics, color: number) => void;
}

export interface SegmentOption<T> {
  value: T;
  label: string;
  glyph?: SegmentGlyph;
}

interface Segment<T> {
  option: SegmentOption<T>;
  label: Phaser.GameObjects.Text;
  glyph: Phaser.GameObjects.Image | null;
  centerXPx: number;
}

export const SEGMENTED_CONTROL_HEIGHT_PX = 44;
const TRACK_INSET_PX = 4;
const LABEL_TYPE = {
  sizePx: EDITOR_TYPE_SCALE.control.sizePx,
  weight: 600,
} as const;
const GLYPH_LABEL_GAP_PX = 8;
// 상태 색은 틴트로 입히도록 글리프를 흰색으로 한 번 굽는다.
const GLYPH_BAKE_COLOR = 0xffffff;
const SEGMENT_COLORS: Readonly<Record<SegmentAppearance, number>> = {
  selected: CELESTIAL_COLORS.textPrimary,
  hovered: CELESTIAL_COLORS.textPrimary,
  idle: CELESTIAL_COLORS.textSecondary,
};

export class SegmentedControl<T extends string | number> {
  readonly heightPx = SEGMENTED_CONTROL_HEIGHT_PX;
  private readonly scene: Phaser.Scene;
  private readonly indicator: Phaser.GameObjects.NineSlice;
  private readonly segments: Segment<T>[];

  constructor(
    scene: Phaser.Scene,
    frame: { leftPx: number; topYPx: number; widthPx: number },
    options: readonly SegmentOption<T>[],
    actions: {
      readonly onSelect: (value: T) => void;
      readonly onHover: (value: T) => void;
      readonly onUnhover: (value: T) => void;
    },
  ) {
    this.scene = scene;
    const { leftPx, topYPx, widthPx } = frame;
    const centerYPx = topYPx + SEGMENTED_CONTROL_HEIGHT_PX / 2;
    const segmentWidthPx = (widthPx - TRACK_INSET_PX * 2) / options.length;
    addBakedRoundedRect(scene, leftPx, topYPx, {
      widthPx,
      heightPx: SEGMENTED_CONTROL_HEIGHT_PX,
      radiusPx: RADIUS.mediumPx,
      fillColor: CELESTIAL_COLORS.background,
      fillAlpha: 1,
      border: null,
    }).setOrigin(0, 0);
    this.indicator = addBakedRoundedRect(scene, 0, centerYPx, {
      widthPx: segmentWidthPx,
      heightPx: SEGMENTED_CONTROL_HEIGHT_PX - TRACK_INSET_PX * 2,
      radiusPx: RADIUS.smallPx,
      fillColor: CELESTIAL_COLORS.surfaceHover,
      fillAlpha: 1,
      border: null,
    });
    this.segments = options.map((option, index) => {
      const segmentLeftPx = leftPx + TRACK_INSET_PX + segmentWidthPx * index;
      const centerXPx = segmentLeftPx + segmentWidthPx / 2;
      const label = scene.add
        .text(0, centerYPx, option.label, typeStyle(LABEL_TYPE, CELESTIAL_COLORS.textSecondary))
        .setOrigin(0, 0.5);
      const glyphSpanPx =
        option.glyph === undefined ? 0 : option.glyph.widthPx + GLYPH_LABEL_GAP_PX;
      const groupLeftPx = centerXPx - (glyphSpanPx + label.width) / 2;
      label.setX(groupLeftPx + glyphSpanPx);
      const glyph =
        option.glyph === undefined
          ? null
          : addGlyph(scene, `segmentGlyph:${option.value}`, option.glyph).setPosition(
              groupLeftPx,
              centerYPx,
            );
      scene.add
        .zone(segmentLeftPx, topYPx, segmentWidthPx, SEGMENTED_CONTROL_HEIGHT_PX)
        .setOrigin(0, 0)
        .setInteractive({ cursor: HOVER_CURSOR })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => actions.onHover(option.value))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => actions.onUnhover(option.value))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => actions.onSelect(option.value));
      return {
        option,
        label,
        glyph,
        centerXPx,
      };
    });
  }

  renderIndicator(value: T, motion: 'snap' | 'slide'): void {
    const targetXPx = this.requireSegment(value).centerXPx;
    this.scene.tweens.killTweensOf(this.indicator);
    switch (motion) {
      case 'snap':
        this.indicator.setX(targetXPx);
        return;
      case 'slide':
        this.scene.tweens.add({
          targets: this.indicator,
          x: targetXPx,
          duration: MOTION.fastMs,
          ease: 'Cubic.Out',
        });
        return;
    }
  }

  renderSegments(appearanceOf: (value: T) => SegmentAppearance): void {
    this.segments.forEach(({ option, label, glyph }) => {
      const color = SEGMENT_COLORS[appearanceOf(option.value)];
      setTextColor(label, color);
      glyph?.setTint(color);
    });
  }

  private requireSegment(value: T): Segment<T> {
    return requireDefined(
      this.segments.find((candidate) => candidate.option.value === value),
      'Missing segment',
      value,
    );
  }
}

// 글리프 높이는 정해져 있지 않지만 컨트롤 높이를 넘지 않으므로 그 높이로 굽고 세로 가운데에 원점을 둔다.
function addGlyph(scene: Phaser.Scene, key: string, spec: SegmentGlyph): Phaser.GameObjects.Image {
  bakeTexture(
    scene,
    {
      key,
      widthPx: spec.widthPx,
      heightPx: SEGMENTED_CONTROL_HEIGHT_PX,
    },
    (texture) => {
      const brush = scene.make.graphics(undefined, false);
      spec.draw(brush, GLYPH_BAKE_COLOR);
      texture.draw(brush, 0, SEGMENTED_CONTROL_HEIGHT_PX / 2);
      return [brush];
    },
  );
  return scene.add.image(0, 0, key).setOrigin(0, 0.5);
}
