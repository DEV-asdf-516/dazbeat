import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import {
  getButtonView,
  hoverButton,
  isButtonHovered,
  isButtonPressed,
  pressButton,
  releaseButton,
  unhoverButton,
} from '../../ui/state/buttonPointer.js';
import type { ButtonHover, ButtonView } from '../../ui/state/buttonPointer.js';

export type BootErrorButton = 'retry';

export interface BootErrorState {
  readonly hover: ButtonHover<BootErrorButton> | null;
}

export const INITIAL_BOOT_ERROR_STATE: BootErrorState = { hover: null };

function withHover(state: BootErrorState, hover: BootErrorState['hover']): BootErrorState {
  return hover === state.hover ? state : { hover };
}

export function hoverBootErrorButton(
  state: BootErrorState,
  button: BootErrorButton,
): BootErrorState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverBootErrorButton(
  state: BootErrorState,
  button: BootErrorButton,
): BootErrorState {
  return withHover(state, unhoverButton(state.hover, button));
}

export function pressBootErrorButton(
  state: BootErrorState,
  button: BootErrorButton,
): BootErrorState {
  return withHover(state, pressButton(state.hover, button, true));
}

export function releaseBootErrorButton(
  state: BootErrorState,
  button: BootErrorButton,
): BootErrorState {
  return withHover(state, releaseButton(state.hover, button));
}

export function getRetryButtonView(state: BootErrorState): ButtonView {
  return getButtonView(state.hover, 'retry', true, false);
}

export type BootErrorRegion = 'retryButton';

type BootErrorReader = StateReader<BootErrorState>;

const readRetryHovered: BootErrorReader = (state) => isButtonHovered(state.hover, 'retry');
const readRetryPressed: BootErrorReader = (state) => isButtonPressed(state.hover, 'retry');

const REGION_SOURCES: Readonly<Record<BootErrorRegion, readonly BootErrorReader[]>> = {
  retryButton: [readRetryHovered, readRetryPressed],
};

export function getChangedRegions(
  previous: BootErrorState | null,
  next: BootErrorState,
): readonly BootErrorRegion[] {
  return filterChangedRegions(REGION_SOURCES, previous, next);
}
