export interface ButtonHover<B> {
  readonly kind: 'button';
  readonly button: B;
  readonly isPressed: boolean;
}

export type ButtonAppearance = 'disabled' | 'pressed' | 'hovered' | 'focused' | 'idle';

export interface ButtonView {
  readonly appearance: ButtonAppearance;
  readonly isFocused: boolean;
  readonly isPointerOver: boolean;
}

// 화면 hover union 의 탭·행 같은 다른 종류도 그대로 받는다. 그 종류에는 button·isPressed 가 없다.
type PointerHover = {
  readonly kind: string;
  readonly button?: unknown;
  readonly isPressed?: unknown;
} | null;

export function isButtonHovered(hover: PointerHover, button: unknown): boolean {
  return hover?.kind === 'button' && hover.button === button;
}

export function isButtonPressed(hover: PointerHover, button: unknown): boolean {
  return isButtonHovered(hover, button) && hover?.isPressed === true;
}

export function hoverButton<B, H extends PointerHover>(hover: H, button: B): H | ButtonHover<B> {
  return isButtonHovered(hover, button)
    ? hover
    : {
        kind: 'button',
        button,
        isPressed: false,
      };
}

export function unhoverButton<H extends PointerHover>(hover: H, button: unknown): H | null {
  return isButtonHovered(hover, button) ? null : hover;
}

export function pressButton<B, H extends PointerHover>(
  hover: H,
  button: B,
  isEnabled: boolean,
): H | ButtonHover<B> {
  if (!isEnabled || isButtonPressed(hover, button)) {
    return hover;
  }
  return {
    kind: 'button',
    button,
    isPressed: true,
  };
}

export function releaseButton<B, H extends PointerHover>(hover: H, button: B): H | ButtonHover<B> {
  return isButtonPressed(hover, button)
    ? {
        kind: 'button',
        button,
        isPressed: false,
      }
    : hover;
}

export function releaseDisabledButton<B, H extends PointerHover>(
  hover: H,
  button: B,
  isEnabled: boolean,
): H | ButtonHover<B> {
  return isEnabled ? hover : releaseButton(hover, button);
}

export function getButtonView(
  hover: PointerHover,
  button: unknown,
  isEnabled: boolean,
  isFocused: boolean,
): ButtonView {
  const isPointerOver = isButtonHovered(hover, button);
  return {
    appearance: getAppearance(isEnabled, isButtonPressed(hover, button), isPointerOver, isFocused),
    isFocused,
    isPointerOver,
  };
}

function getAppearance(
  isEnabled: boolean,
  isPressed: boolean,
  isPointerOver: boolean,
  isFocused: boolean,
): ButtonAppearance {
  if (!isEnabled) {
    return 'disabled';
  }
  if (isPressed) {
    return 'pressed';
  }
  if (isPointerOver) {
    return 'hovered';
  }
  return isFocused ? 'focused' : 'idle';
}
