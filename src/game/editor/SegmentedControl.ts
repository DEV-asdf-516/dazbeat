import Phaser from 'phaser';
import { HOVER_CURSOR } from '../ui/cursor.js';
import {
  EDITOR_COLORS,
  EDITOR_TYPE_SCALE,
  MOTION,
  RADIUS,
  setTextColor,
  typeStyle,
} from '../ui/theme.js';

/** 라벨 왼쪽에 붙는 작은 그림. graphics 원점은 그림 왼쪽·세로 가운데다. */
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
  glyph: Phaser.GameObjects.Graphics | null;
  centerXPx: number;
}

const TRACK_HEIGHT_PX = 44;
const TRACK_INSET_PX = 4;
const LABEL_TYPE = { sizePx: EDITOR_TYPE_SCALE.control.sizePx, weight: 600 } as const;
const GLYPH_LABEL_GAP_PX = 8;

/**
 * 같은 폭의 칸 중 하나를 고르는 세그먼트 컨트롤. 고른 값은 씬 상태가 소유하고 render 로 받는다.
 * hover 는 표시에만 쓰는 이 위젯의 상태다.
 */
export class SegmentedControl<T> {
  readonly heightPx = TRACK_HEIGHT_PX;
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
    const centerYPx = topYPx + TRACK_HEIGHT_PX / 2;
    const segmentWidthPx = (widthPx - TRACK_INSET_PX * 2) / options.length;
    scene.add
      .rectangle(leftPx, topYPx, widthPx, TRACK_HEIGHT_PX, EDITOR_COLORS.background)
      .setOrigin(0, 0)
      .setRounded(RADIUS.mediumPx);
    this.indicator = scene.add
      .rectangle(
        0,
        centerYPx,
        segmentWidthPx,
        TRACK_HEIGHT_PX - TRACK_INSET_PX * 2,
        EDITOR_COLORS.surfaceHover,
      )
      .setRounded(RADIUS.smallPx);
    this.segments = options.map((option, index) => {
      const segmentLeftPx = leftPx + TRACK_INSET_PX + segmentWidthPx * index;
      const centerXPx = segmentLeftPx + segmentWidthPx / 2;
      const label = scene.add
        .text(0, centerYPx, option.label, typeStyle(LABEL_TYPE, EDITOR_COLORS.textSecondary))
        .setOrigin(0, 0.5);
      // 그림과 라벨을 한 묶음으로 칸 가운데에 둔다.
      const glyphSpanPx =
        option.glyph === undefined ? 0 : option.glyph.widthPx + GLYPH_LABEL_GAP_PX;
      const groupLeftPx = centerXPx - (glyphSpanPx + label.width) / 2;
      label.setX(groupLeftPx + glyphSpanPx);
      const glyph =
        option.glyph === undefined ? null : scene.add.graphics({ x: groupLeftPx, y: centerYPx });
      scene.add
        .zone(segmentLeftPx, topYPx, segmentWidthPx, TRACK_HEIGHT_PX)
        .setOrigin(0, 0)
        .setInteractive({ cursor: HOVER_CURSOR })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.setHovered(option.value))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.setHovered(null))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => onSelect(option.value));
      return { option, label, glyph, centerXPx };
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
      if (glyph !== null && option.glyph !== undefined) {
        option.glyph.draw(glyph.clear(), color);
      }
    });
  }

  private segmentColor(value: T): number {
    if (value === this.selected) {
      return EDITOR_COLORS.textPrimary;
    }
    return value === this.hovered ? EDITOR_COLORS.textPrimary : EDITOR_COLORS.textSecondary;
  }

  private requireSegment(value: T): Segment<T> {
    const segment = this.segments.find((candidate) => candidate.option.value === value);
    if (segment === undefined) {
      throw new Error(`Missing segment: ${String(value)}`);
    }
    return segment;
  }
}
