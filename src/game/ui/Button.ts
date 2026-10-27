import Phaser from 'phaser';
import { DISABLED_CURSOR, HOVER_CURSOR } from './cursor.js';
import { bindPress, setContainerHitArea } from './hoverTarget.js';
import type { PointerPress } from './hoverTarget.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from './lightTextures.js';
import {
  COLORS,
  CELESTIAL_COLORS,
  MOTION,
  RADIUS,
  TYPE_SCALE,
  setTextColor,
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

type ButtonAppearance = 'disabled' | 'pressed' | 'hovered' | 'focused' | 'idle';

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

function getPrimaryPaint(
  colors: PrimaryButtonColors,
  appearance: ButtonAppearance,
): { fill: number; label: number } {
  switch (appearance) {
    case 'disabled':
      return {
        fill: colors.disabledFill,
        label: colors.disabledLabel,
      };
    case 'pressed':
      return {
        fill: colors.pressedFill,
        label: colors.label,
      };
    case 'hovered':
      return {
        fill: colors.hoverFill,
        label: colors.label,
      };
    case 'focused':
    case 'idle':
      return {
        fill: colors.fill,
        label: colors.label,
      };
  }
}

function getSecondaryPaint(
  colors: SecondaryButtonColors,
  appearance: ButtonAppearance,
): { border: number; fill: number | null; label: number } {
  switch (appearance) {
    case 'disabled':
      return {
        border: colors.disabledBorder,
        fill: null,
        label: colors.disabledLabel,
      };
    case 'pressed':
      return {
        border: colors.hoverBorder,
        fill: colors.pressedFill,
        label: colors.label,
      };
    case 'hovered':
      return {
        border: colors.hoverBorder,
        fill: colors.hoverFill,
        label: colors.label,
      };
    case 'focused':
    case 'idle':
      return {
        border: colors.border,
        fill: colors.fill,
        label: colors.label,
      };
  }
}

function getQuietPaint(
  colors: QuietButtonColors,
  appearance: ButtonAppearance,
): { fill: number | null; label: number; iconAlpha: number } {
  switch (appearance) {
    case 'disabled':
      return {
        fill: null,
        label: colors.disabledLabel,
        iconAlpha: ICON_IDLE_ALPHA,
      };
    case 'pressed':
    case 'hovered':
      return {
        fill: colors.hoverFill,
        label: colors.emphasizedLabel,
        iconAlpha: 1,
      };
    case 'focused':
      return {
        fill: null,
        label: colors.emphasizedLabel,
        iconAlpha: 1,
      };
    case 'idle':
      return {
        fill: null,
        label: colors.label,
        iconAlpha: ICON_IDLE_ALPHA,
      };
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
  private fixedWidthPx: number | undefined;
  private fixedHeightPx: number | undefined;
  private readonly hitArea = new Phaser.Geom.Rectangle();
  /** 비활성일 때도 포인터 위치는 따라가, 활성이 바뀌는 순간 커서를 바로 바꾼다. */
  private isPointerOver = false;
  private readonly press: PointerPress;
  private focused = false;
  private enabled = true;

  constructor(scene: Phaser.Scene, xPx: number, yPx: number, options: ButtonOptions) {
    super(scene, xPx, yPx);
    this.options = options;
    this.fixedWidthPx = options.widthPx;
    this.fixedHeightPx = options.heightPx;
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

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.isPointerOver = true;
      this.refresh();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.isPointerOver = false;
      this.refresh();
    });
    this.press = bindPress(this, {
      canPress: () => this.enabled,
      onPressChange: () => this.refresh(),
      onActivate: () => this.options.onActivate(),
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
    this.press.cancel();
    // 비활성 버튼도 입력은 받아 그 위에서 비활성 커서를 보인다. 동작은 위 핸들러들이 막는다.
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

  setFixedSize(widthPx: number, heightPx: number): this {
    this.fixedWidthPx = widthPx;
    this.fixedHeightPx = heightPx;
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
    const widthPx = this.fixedWidthPx ?? content.displayWidth + paddingXPx * 2;
    const heightPx = this.fixedHeightPx ?? content.displayHeight + padding.yPx * 2;
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
    setContainerHitArea(this, this.hitArea, widthPx, heightPx);
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

  private appearance(): ButtonAppearance {
    if (!this.enabled) {
      return 'disabled';
    }
    if (this.press.isPressed()) {
      return 'pressed';
    }
    if (this.isPointerOver) {
      return 'hovered';
    }
    return this.focused ? 'focused' : 'idle';
  }

  private refresh(): void {
    if (this.focus.kind === 'outline') {
      this.focus.rect.setVisible(this.focused);
    }
    const appearance = this.appearance();
    const paint = this.paint;
    switch (paint.variant) {
      case 'primary': {
        const { fill, label } = getPrimaryPaint(paint.colors, appearance);
        this.background.setFillStyle(fill);
        setTextColor(this.labelText, label);
        return;
      }
      case 'secondary': {
        const { border, fill, label } = getSecondaryPaint(paint.colors, appearance);
        this.background.setStrokeStyle(paint.borderWidthPx, border);
        this.setBackgroundFill(fill);
        setTextColor(this.labelText, label);
        this.icon?.setTint(label);
        return;
      }
      case 'quiet': {
        const { fill, label, iconAlpha } = getQuietPaint(paint.colors, appearance);
        this.setBackgroundFill(fill);
        if (this.icon !== null) {
          this.icon.setAlpha(iconAlpha);
          return;
        }
        setTextColor(this.labelText, label);
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
}
