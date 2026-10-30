import Phaser from 'phaser';
import { HOVER_CURSOR } from '../../ui/view/input/cursor.js';
import { CELESTIAL_COLORS, MOTION, RADIUS, setTextColor, typeStyle } from '../../ui/view/theme.js';
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
  glyph: { graphics: Phaser.GameObjects.Graphics; spec: SegmentGlyph } | null;
  centerXPx: number;
}

export const SEGMENTED_CONTROL_HEIGHT_PX = 44;
const TRACK_INSET_PX = 4;
const LABEL_TYPE = {
  sizePx: EDITOR_TYPE_SCALE.control.sizePx,
  weight: 600,
} as const;
const GLYPH_LABEL_GAP_PX = 8;
const SEGMENT_COLORS: Readonly<Record<SegmentAppearance, number>> = {
  selected: CELESTIAL_COLORS.textPrimary,
  hovered: CELESTIAL_COLORS.textPrimary,
  idle: CELESTIAL_COLORS.textSecondary,
};

export class SegmentedControl<T extends string | number> {
  readonly heightPx = SEGMENTED_CONTROL_HEIGHT_PX;
  private readonly scene: Phaser.Scene;
  private readonly indicator: Phaser.GameObjects.Rectangle;
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
    scene.add
      .rectangle(leftPx, topYPx, widthPx, SEGMENTED_CONTROL_HEIGHT_PX, CELESTIAL_COLORS.background)
      .setOrigin(0, 0)
      .setRounded(RADIUS.mediumPx);
    this.indicator = scene.add
      .rectangle(
        0,
        centerYPx,
        segmentWidthPx,
        SEGMENTED_CONTROL_HEIGHT_PX - TRACK_INSET_PX * 2,
        CELESTIAL_COLORS.surfaceHover,
      )
      .setRounded(RADIUS.smallPx);
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
          : {
              graphics: scene.add.graphics({
                x: groupLeftPx,
                y: centerYPx,
              }),
              spec: option.glyph,
            };
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
      if (glyph !== null) {
        glyph.spec.draw(glyph.graphics.clear(), color);
      }
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
