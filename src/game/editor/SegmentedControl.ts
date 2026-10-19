import Phaser from 'phaser';
import { HOVER_CURSOR } from '../ui/cursor.js';
import { CELESTIAL_COLORS, MOTION, RADIUS, setTextColor, typeStyle } from '../ui/theme.js';
import { EDITOR_TYPE_SCALE } from './editorTheme.js';
import { requireDefined } from '../../invariant.js';

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

export class SegmentedControl<T extends string | number> {
  readonly heightPx = SEGMENTED_CONTROL_HEIGHT_PX;
  private readonly scene: Phaser.Scene;
  private readonly indicator: Phaser.GameObjects.Rectangle;
  private readonly segments: Segment<T>[];
  private selected: T | null = null;
  private hovered: T | null = null;

  constructor(
    scene: Phaser.Scene,
    frame: { leftPx: number; topYPx: number; widthPx: number },
    options: readonly SegmentOption<T>[],
    onSelect: (value: T) => void,
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
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.setHovered(option.value))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.setHovered(null))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => onSelect(option.value));
      return {
        option,
        label,
        glyph,
        centerXPx,
      };
    });
  }

  render(value: T): void {
    if (value === this.selected) {
      return;
    }
    const isFirstRender = this.selected === null;
    this.selected = value;
    const targetXPx = this.requireSegment(value).centerXPx;
    this.scene.tweens.killTweensOf(this.indicator);
    if (isFirstRender) {
      this.indicator.setX(targetXPx);
    } else {
      this.scene.tweens.add({
        targets: this.indicator,
        x: targetXPx,
        duration: MOTION.fastMs,
        ease: 'Cubic.Out',
      });
    }
    this.refresh();
  }

  private setHovered(value: T | null): void {
    if (value === this.hovered) {
      return;
    }
    this.hovered = value;
    this.refresh();
  }

  private refresh(): void {
    this.segments.forEach(({ option, label, glyph }) => {
      const color = this.segmentColor(option.value);
      setTextColor(label, color);
      if (glyph !== null) {
        glyph.spec.draw(glyph.graphics.clear(), color);
      }
    });
  }

  private segmentColor(value: T): number {
    if (value === this.selected) {
      return CELESTIAL_COLORS.textPrimary;
    }
    return value === this.hovered ? CELESTIAL_COLORS.textPrimary : CELESTIAL_COLORS.textSecondary;
  }

  private requireSegment(value: T): Segment<T> {
    return requireDefined(
      this.segments.find((candidate) => candidate.option.value === value),
      'Missing segment',
      value,
    );
  }
}
