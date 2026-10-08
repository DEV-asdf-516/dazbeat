import Phaser from 'phaser';
import { DISABLED_CURSOR, HOVER_CURSOR } from './cursor.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from './lightTextures.js';
import { COLORS, EDITOR_COLORS, MOTION, RADIUS, TYPE_SCALE, cssColor, typeStyle } from './theme.js';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

/** 상태별 색. 화면이 일부만 덮어쓰고 나머지는 기본값을 쓴다. */
export interface ButtonColors {
  label: number;
  emphasizedLabel: number;
  disabledLabel: number;
  border: number;
  hoverBorder: number;
  /** secondary variant 의 비활성 경계 색. 생략하면 border 와 같다. */
  disabledBorder?: number;
  pressedFill: number;
  /** secondary variant 의 idle 면 색. null 이면 칠하지 않는다. */
  fill: number | null;
  /** null 이면 hover 배경을 칠하지 않는다. */
  hoverFill: number | null;
  primaryFill: number;
  primaryHoverFill: number;
  primaryPressedFill: number;
  primaryDisabledFill: number;
  primaryLabel: number;
}

export interface ButtonOptions {
  variant: ButtonVariant;
  label: string;
  onActivate: () => void;
  widthPx?: number;
  heightPx?: number;
  colors?: Partial<ButtonColors>;
  /** 라벨 크기·굵기. 생략하면 primary 역할이다. primary variant 는 크기만 따르고 굵기는 고정이다. */
  labelType?: { sizePx: number; weight: number };
  /** secondary variant 의 경계 두께. 생략하면 SECONDARY_BORDER_PX 다. */
  borderWidthPx?: number;
  /** true 이면 focus 를 버튼 바깥 outline 으로 표시하고, quiet 라벨 이동과 glow flash 는 쓰지 않는다. */
  hasFocusOutline?: boolean;
  /** widthPx 가 없을 때 variant 기본 좌우 여백 대신 쓴다. */
  paddingXPx?: number;
}

const DEFAULT_COLORS: ButtonColors = {
  label: COLORS.textSecondary,
  emphasizedLabel: COLORS.textPrimary,
  disabledLabel: COLORS.textDisabled,
  border: COLORS.border,
  hoverBorder: COLORS.textSecondary,
  pressedFill: COLORS.surfaceRaised,
  fill: null,
  hoverFill: null,
  primaryFill: COLORS.textPrimary,
  primaryHoverFill: COLORS.primaryHover,
  primaryPressedFill: COLORS.primaryPressed,
  primaryDisabledFill: COLORS.border,
  primaryLabel: COLORS.background,
};

const PADDING_PX: Record<ButtonVariant, { xPx: number; yPx: number }> = {
  primary: { xPx: 44, yPx: 20 },
  secondary: { xPx: 44, yPx: 20 },
  quiet: { xPx: 16, yPx: 12 },
};
const PRIMARY_LABEL_WEIGHT = 700;
const SECONDARY_BORDER_PX = 2;
const QUIET_FOCUS_OFFSET_PX = 8;
const FOCUS_GLOW_ALPHA = 0.35;
const ICON_IDLE_ALPHA = 0.85;
const FOCUS_OUTLINE_GAP_PX = 3;
const FOCUS_OUTLINE_WIDTH_PX = 2;

export class Button extends Phaser.GameObjects.Container {
  private readonly options: ButtonOptions;
  private colors: ButtonColors;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly focusGlow: Phaser.GameObjects.Image;
  /** hasFocusOutline 인 버튼에만 있다. hit area 밖에 그린다. */
  private readonly focusOutline: Phaser.GameObjects.Rectangle | null;
  private readonly labelText: Phaser.GameObjects.Text;
  /** 있으면 라벨 대신 표시한다. */
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
    this.colors = { ...DEFAULT_COLORS, ...options.colors };
    ensureLightTextures(scene);
    // quiet 도 hover 배경을 칠할 수 있으므로 모든 variant 가 같은 모서리를 쓴다. 칠하지 않으면 보이지 않는다.
    this.background = scene.add.rectangle(0, 0, 0, 0).setOrigin(0, 0).setRounded(RADIUS.smallPx);
    this.focusGlow = addLight(scene, LIGHT_TEXTURES.glow, 0, 0).setAlpha(0);
    this.focusOutline =
      options.hasFocusOutline === true
        ? scene.add
            .rectangle(-FOCUS_OUTLINE_GAP_PX, -FOCUS_OUTLINE_GAP_PX, 0, 0)
            .setOrigin(0, 0)
            .setRounded(RADIUS.smallPx + FOCUS_OUTLINE_GAP_PX)
            .setStrokeStyle(FOCUS_OUTLINE_WIDTH_PX, EDITOR_COLORS.highlight)
        : null;
    this.labelText = scene.add
      .text(
        0,
        0,
        options.label,
        options.variant === 'primary'
          ? typeStyle(
              {
                sizePx: options.labelType?.sizePx ?? TYPE_SCALE.primary.sizePx,
                weight: PRIMARY_LABEL_WEIGHT,
              },
              this.colors.primaryLabel,
            )
          : typeStyle(options.labelType ?? TYPE_SCALE.primary, this.colors.emphasizedLabel),
      )
      .setOrigin(0.5);
    this.add([this.background, this.focusGlow, this.labelText]);
    if (this.focusOutline !== null) {
      this.add(this.focusOutline);
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

  /** 색 덮어쓰기를 기본색 위에 이 값으로 바꾸고 현재 상태로 다시 칠한다. 생성 때의 colors 는 버린다. */
  setColors(colors: Partial<ButtonColors>): this {
    this.colors = { ...DEFAULT_COLORS, ...colors };
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
    const padding = PADDING_PX[this.options.variant];
    const paddingXPx = this.options.paddingXPx ?? padding.xPx;
    const content = this.content();
    const widthPx = this.options.widthPx ?? content.displayWidth + paddingXPx * 2;
    const heightPx = this.options.heightPx ?? content.displayHeight + padding.yPx * 2;
    this.setSize(widthPx, heightPx);
    this.background.setSize(widthPx, heightPx);
    this.focusOutline?.setSize(
      widthPx + FOCUS_OUTLINE_GAP_PX * 2,
      heightPx + FOCUS_OUTLINE_GAP_PX * 2,
    );
    this.scene.tweens.killTweensOf(content);
    content.setPosition(this.labelX(), heightPx / 2);
    this.focusGlow.setDisplaySize(content.displayWidth, content.displayHeight);
    // Phaser 는 Container 의 hit 좌표에 displayOrigin(크기의 절반)을 더하므로 그만큼 옮긴다.
    this.hitArea.setTo(widthPx / 2, heightPx / 2, widthPx, heightPx);
  }

  private labelX(): number {
    const offsetPx =
      this.options.variant === 'quiet' && this.focused && this.focusOutline === null
        ? QUIET_FOCUS_OFFSET_PX
        : 0;
    return this.width / 2 + offsetPx;
  }

  private animateFocus(): void {
    // outline 버튼은 refresh 에서 outline 보이기만 바꾼다.
    if (this.focusOutline !== null) {
      return;
    }
    const tweens = this.scene.tweens;
    const content = this.content();
    tweens.killTweensOf([content, this.focusGlow]);
    if (this.options.variant === 'quiet') {
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
    const colors = this.colors;
    this.focusOutline?.setVisible(this.focused);
    switch (this.options.variant) {
      case 'primary':
        this.background.setFillStyle(this.primaryFill());
        this.labelText.setColor(
          cssColor(this.enabled ? colors.primaryLabel : colors.disabledLabel),
        );
        return;
      case 'secondary':
        this.background.setStrokeStyle(
          this.options.borderWidthPx ?? SECONDARY_BORDER_PX,
          this.secondaryBorder(),
        );
        this.setBackgroundFill(this.secondaryFill());
        this.labelText.setColor(
          cssColor(this.enabled ? colors.emphasizedLabel : colors.disabledLabel),
        );
        this.icon?.setTint(this.enabled ? colors.emphasizedLabel : colors.disabledLabel);
        return;
      case 'quiet':
        this.setBackgroundFill(
          this.enabled && (this.hovered || this.pressed) ? colors.hoverFill : null,
        );
        if (this.icon !== null) {
          this.icon.setAlpha(this.isEmphasized() ? 1 : ICON_IDLE_ALPHA);
          return;
        }
        this.labelText.setColor(cssColor(this.quietLabelColor()));
        return;
    }
  }

  private setBackgroundFill(color: number | null): void {
    if (color === null) {
      this.background.setFillStyle();
    } else {
      this.background.setFillStyle(color);
    }
  }

  private secondaryBorder(): number {
    const { border, hoverBorder, disabledBorder } = this.colors;
    if (!this.enabled) {
      return disabledBorder ?? border;
    }
    return this.hovered ? hoverBorder : border;
  }

  private secondaryFill(): number | null {
    if (!this.enabled) {
      return null;
    }
    if (this.pressed) {
      return this.colors.pressedFill;
    }
    return this.hovered ? this.colors.hoverFill : this.colors.fill;
  }

  private primaryFill(): number {
    if (!this.enabled) {
      return this.colors.primaryDisabledFill;
    }
    if (this.pressed) {
      return this.colors.primaryPressedFill;
    }
    return this.hovered ? this.colors.primaryHoverFill : this.colors.primaryFill;
  }

  private quietLabelColor(): number {
    if (!this.enabled) {
      return this.colors.disabledLabel;
    }
    return this.isEmphasized() ? this.colors.emphasizedLabel : this.colors.label;
  }

  private isEmphasized(): boolean {
    return this.enabled && (this.hovered || this.focused);
  }
}
