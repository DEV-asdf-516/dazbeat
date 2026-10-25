import Phaser from 'phaser';
import { DISABLED_CURSOR, HOVER_CURSOR } from './cursor.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from './lightTextures.js';
import {
  COLORS,
  CELESTIAL_COLORS,
  MOTION,
  RADIUS,
  TYPE_SCALE,
  cssColor,
  typeStyle,
} from './theme.js';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface PrimaryButtonColors {
  fill: number;
  hoverFill: number;
  pressedFill: number;
  disabledFill: number;
  label: number;
  disabledLabel: number;
}

export interface SecondaryButtonColors {
  label: number;
  disabledLabel: number;
  border: number;
  hoverBorder: number;
  disabledBorder: number;
  pressedFill: number;
  fill: number | null;
  hoverFill: number | null;
}

export interface QuietButtonColors {
  label: number;
  emphasizedLabel: number;
  disabledLabel: number;
  hoverFill: number | null;
}

interface ButtonContentOptions {
  label: string;
  onActivate: () => void;
  widthPx?: number;
  heightPx?: number;
  paddingXPx?: number;
}

interface LabelType {
  sizePx: number;
  weight: number;
}

export type ButtonOptions = ButtonContentOptions &
  (
    | {
        variant: 'primary';
      }
    | {
        variant: 'secondary';
        focus: 'outline' | 'glow';
        colors?: Partial<SecondaryButtonColors>;
        labelType?: LabelType;
        borderWidthPx?: number;
      }
    | {
        variant: 'quiet';
        focus: 'outline' | 'slide';
        colors?: Partial<QuietButtonColors>;
        labelType?: LabelType;
      }
  );

const DEFAULT_COLORS: {
  primary: PrimaryButtonColors;
  secondary: SecondaryButtonColors;
  quiet: QuietButtonColors;
} = {
  primary: {
    fill: COLORS.textPrimary,
    hoverFill: COLORS.primaryHover,
    pressedFill: COLORS.primaryPressed,
    disabledFill: COLORS.border,
    label: COLORS.background,
    disabledLabel: COLORS.textDisabled,
  },
  secondary: {
    label: COLORS.textPrimary,
    disabledLabel: COLORS.textDisabled,
    border: COLORS.border,
    hoverBorder: COLORS.textSecondary,
    disabledBorder: COLORS.border,
    pressedFill: COLORS.surfaceRaised,
    fill: null,
    hoverFill: null,
  },
  quiet: {
    label: COLORS.textSecondary,
    emphasizedLabel: COLORS.textPrimary,
    disabledLabel: COLORS.textDisabled,
    hoverFill: null,
  },
};

type ButtonPaint =
  | { variant: 'primary'; colors: PrimaryButtonColors }
  | { variant: 'secondary'; colors: SecondaryButtonColors; borderWidthPx: number }
  | { variant: 'quiet'; colors: QuietButtonColors };

type ButtonFocus =
  { kind: 'outline'; rect: Phaser.GameObjects.Rectangle } | { kind: 'glow' } | { kind: 'slide' };

export const QUIET_PADDING_PX = {
  xPx: 16,
  yPx: 12,
} as const;

const PADDING_PX: Record<ButtonVariant, { xPx: number; yPx: number }> = {
  primary: {
    xPx: 44,
    yPx: 20,
  },
  secondary: {
    xPx: 44,
    yPx: 20,
  },
  quiet: QUIET_PADDING_PX,
};
const PRIMARY_LABEL_WEIGHT = 700;
const SECONDARY_BORDER_PX = 2;
const QUIET_FOCUS_OFFSET_PX = 8;
const FOCUS_GLOW_ALPHA = 0.35;
const ICON_IDLE_ALPHA = 0.85;
const FOCUS_OUTLINE_GAP_PX = 3;
const FOCUS_OUTLINE_WIDTH_PX = 2;

function resolveStyle(options: ButtonOptions): {
  paint: ButtonPaint;
  labelStyle: Phaser.Types.GameObjects.Text.TextStyle;
} {
  switch (options.variant) {
    case 'primary': {
      const colors = DEFAULT_COLORS.primary;
      return {
        paint: {
          variant: 'primary',
          colors,
        },
        labelStyle: typeStyle(
          {
            sizePx: TYPE_SCALE.primary.sizePx,
            weight: PRIMARY_LABEL_WEIGHT,
          },
          colors.label,
        ),
      };
    }
    case 'secondary': {
      const colors = {
        ...DEFAULT_COLORS.secondary,
        ...options.colors,
      };
      return {
        paint: {
          variant: 'secondary',
          colors,
          borderWidthPx: options.borderWidthPx ?? SECONDARY_BORDER_PX,
        },
        labelStyle: typeStyle(options.labelType ?? TYPE_SCALE.primary, colors.label),
      };
    }
    case 'quiet': {
      const colors = {
        ...DEFAULT_COLORS.quiet,
        ...options.colors,
      };
      return {
        paint: {
          variant: 'quiet',
          colors,
        },
        labelStyle: typeStyle(options.labelType ?? TYPE_SCALE.primary, colors.emphasizedLabel),
      };
    }
  }
}

export class Button extends Phaser.GameObjects.Container {
  private readonly options: ButtonOptions;
  private paint: ButtonPaint;
  private readonly focus: ButtonFocus;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly focusGlow: Phaser.GameObjects.Image;
  private readonly labelText: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image | null = null;
  private readonly hitArea = new Phaser.Geom.Rectangle();
  private hovered = false;
  /** 비활성일 때도 포인터 위치는 따라가, 활성이 바뀌는 순간 커서를 바로 바꾼다. */
  private isPointerOver = false;
  private pressed = false;
  private focused = false;
  private enabled = true;

  constructor(scene: Phaser.Scene, xPx: number, yPx: number, options: ButtonOptions) {
    super(scene, xPx, yPx);
    this.options = options;
    const { paint, labelStyle } = resolveStyle(options);
    this.paint = paint;
    ensureLightTextures(scene);
    this.background = scene.add.rectangle(0, 0, 0, 0).setOrigin(0, 0).setRounded(RADIUS.smallPx);
    this.focusGlow = addLight(scene, LIGHT_TEXTURES.glow, 0, 0).setAlpha(0);
    this.labelText = scene.add.text(0, 0, options.label, labelStyle).setOrigin(0.5);
    this.add([this.background, this.focusGlow, this.labelText]);
    const focusKind = options.variant === 'primary' ? 'glow' : options.focus;
    if (focusKind === 'outline') {
      const rect = scene.add
        .rectangle(-FOCUS_OUTLINE_GAP_PX, -FOCUS_OUTLINE_GAP_PX, 0, 0)
        .setOrigin(0, 0)
        .setRounded(RADIUS.smallPx + FOCUS_OUTLINE_GAP_PX)
        .setStrokeStyle(FOCUS_OUTLINE_WIDTH_PX, CELESTIAL_COLORS.highlight);
      this.add(rect);
      this.focus = {
        kind: 'outline',
        rect,
      };
    } else {
      this.focus = {
        kind: focusKind,
      };
    }
    this.layout();

    this.setInteractive({
      hitArea: this.hitArea,
      hitAreaCallback: (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
        Phaser.Geom.Rectangle.Contains(hitArea, x, y),
      cursor: HOVER_CURSOR,
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.isPointerOver = true;
      if (!this.enabled) {
        return;
      }
      this.hovered = true;
      this.refresh();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.isPointerOver = false;
      this.hovered = false;
      this.pressed = false;
      this.refresh();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!this.enabled) {
        return;
      }
      this.pressed = true;
      this.refresh();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.pressed) {
        return;
      }
      this.pressed = false;
      this.refresh();
      this.options.onActivate();
    });

    scene.add.existing(this);
    this.refresh();
  }

  setFocused(focused: boolean): this {
    if (focused === this.focused) {
      return this;
    }
    this.focused = focused;
    this.animateFocus();
    this.refresh();
    return this;
  }

  setEnabled(enabled: boolean): this {
    if (enabled === this.enabled) {
      return this;
    }
    this.enabled = enabled;
    this.pressed = false;
    // 비활성 버튼도 입력은 받아 그 위에서 비활성 커서를 보인다. 동작은 위 핸들러들이 막는다.
    this.hovered = enabled && this.isPointerOver;
    if (this.input !== null) {
      this.input.cursor = enabled ? HOVER_CURSOR : DISABLED_CURSOR;
      if (this.isPointerOver) {
        this.scene.input.setCursor(this.input);
      }
    }
    this.refresh();
    return this;
  }

  setSecondaryColors(colors: Partial<SecondaryButtonColors>): this {
    if (this.paint.variant !== 'secondary') {
      throw new Error(`setSecondaryColors called on a ${this.paint.variant} button`);
    }
    this.paint = {
      ...this.paint,
      colors: {
        ...DEFAULT_COLORS.secondary,
        ...colors,
      },
    };
    this.refresh();
    return this;
  }

  /** Container 는 origin 이 없으므로, `xPx`에 버튼 폭의 `originX` 비율 지점이 오도록 옮긴다. */
  alignX(xPx: number, originX: number): this {
    return this.setX(xPx - this.width * originX);
  }

  setLabel(label: string): this {
    if (this.icon === null && label === this.labelText.text) {
      return this;
    }
    this.icon?.destroy();
    this.icon = null;
    this.labelText.setText(label).setVisible(true);
    this.layout();
    this.refresh();
    return this;
  }

  setIcon(textureKey: string, sizePx: number): this {
    if (this.icon?.texture.key === textureKey) {
      return this;
    }
    this.icon?.destroy();
    this.icon = this.scene.add.image(0, 0, textureKey).setDisplaySize(sizePx, sizePx);
    this.addAt(this.icon, this.getIndex(this.labelText));
    this.labelText.setVisible(false);
    this.layout();
    this.refresh();
    return this;
  }

  private content(): Phaser.GameObjects.Text | Phaser.GameObjects.Image {
    return this.icon ?? this.labelText;
  }

  private layout(): void {
    const padding = PADDING_PX[this.paint.variant];
    const paddingXPx = this.options.paddingXPx ?? padding.xPx;
    const content = this.content();
    const widthPx = this.options.widthPx ?? content.displayWidth + paddingXPx * 2;
    const heightPx = this.options.heightPx ?? content.displayHeight + padding.yPx * 2;
    this.setSize(widthPx, heightPx);
    this.background.setSize(widthPx, heightPx);
    if (this.focus.kind === 'outline') {
      this.focus.rect.setSize(
        widthPx + FOCUS_OUTLINE_GAP_PX * 2,
        heightPx + FOCUS_OUTLINE_GAP_PX * 2,
      );
    }
    this.scene.tweens.killTweensOf(content);
    content.setPosition(this.labelX(), heightPx / 2);
    this.focusGlow.setDisplaySize(content.displayWidth, content.displayHeight);
    // Phaser 는 Container 의 hit 좌표에 displayOrigin(크기의 절반)을 더하므로 그만큼 옮긴다.
    this.hitArea.setTo(widthPx / 2, heightPx / 2, widthPx, heightPx);
  }

  private labelX(): number {
    const offsetPx = this.focus.kind === 'slide' && this.focused ? QUIET_FOCUS_OFFSET_PX : 0;
    return this.width / 2 + offsetPx;
  }

  private animateFocus(): void {
    if (this.focus.kind === 'outline') {
      return;
    }
    const tweens = this.scene.tweens;
    const content = this.content();
    tweens.killTweensOf([content, this.focusGlow]);
    if (this.focus.kind === 'slide') {
      tweens.add({
        targets: content,
        x: this.labelX(),
        duration: MOTION.fastMs,
        ease: 'Cubic.Out',
      });
    }
    if (!this.focused) {
      this.focusGlow.setAlpha(0);
      return;
    }
    this.focusGlow.setPosition(this.labelX(), this.height / 2).setAlpha(FOCUS_GLOW_ALPHA);
    tweens.add({
      targets: this.focusGlow,
      alpha: 0,
      duration: MOTION.fastMs,
      ease: 'Quad.Out',
    });
  }

  private refresh(): void {
    if (this.focus.kind === 'outline') {
      this.focus.rect.setVisible(this.focused);
    }
    const paint = this.paint;
    switch (paint.variant) {
      case 'primary': {
        const { colors } = paint;
        this.background.setFillStyle(this.primaryFill(colors));
        this.labelText.setColor(cssColor(this.enabled ? colors.label : colors.disabledLabel));
        return;
      }
      case 'secondary': {
        const { colors } = paint;
        this.background.setStrokeStyle(paint.borderWidthPx, this.secondaryBorder(colors));
        this.setBackgroundFill(this.secondaryFill(colors));
        const labelColor = this.enabled ? colors.label : colors.disabledLabel;
        this.labelText.setColor(cssColor(labelColor));
        this.icon?.setTint(labelColor);
        return;
      }
      case 'quiet': {
        const { colors } = paint;
        this.setBackgroundFill(
          this.enabled && (this.hovered || this.pressed) ? colors.hoverFill : null,
        );
        if (this.icon !== null) {
          this.icon.setAlpha(this.isEmphasized() ? 1 : ICON_IDLE_ALPHA);
          return;
        }
        this.labelText.setColor(cssColor(this.quietLabelColor(colors)));
        return;
      }
    }
  }

  private setBackgroundFill(color: number | null): void {
    if (color === null) {
      this.background.setFillStyle();
    } else {
      this.background.setFillStyle(color);
    }
  }

  private secondaryBorder(colors: SecondaryButtonColors): number {
    if (!this.enabled) {
      return colors.disabledBorder;
    }
    return this.hovered ? colors.hoverBorder : colors.border;
  }

  private secondaryFill(colors: SecondaryButtonColors): number | null {
    if (!this.enabled) {
      return null;
    }
    if (this.pressed) {
      return colors.pressedFill;
    }
    return this.hovered ? colors.hoverFill : colors.fill;
  }

  private primaryFill(colors: PrimaryButtonColors): number {
    if (!this.enabled) {
      return colors.disabledFill;
    }
    if (this.pressed) {
      return colors.pressedFill;
    }
    return this.hovered ? colors.hoverFill : colors.fill;
  }

  private quietLabelColor(colors: QuietButtonColors): number {
    if (!this.enabled) {
      return colors.disabledLabel;
    }
    return this.isEmphasized() ? colors.emphasizedLabel : colors.label;
  }

  private isEmphasized(): boolean {
    return this.enabled && (this.hovered || this.focused);
  }
}
