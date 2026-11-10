import { lerp } from '../../../range.js';

export type BootStage = 'uiFonts' | 'catalogs' | 'mainFonts';

export type LoadingState =
  | { readonly kind: 'loading'; readonly fraction: number }
  | { readonly kind: 'leaving' }
  | { readonly kind: 'removed' };

// 시작 값은 index.html 의 CSS 애니메이션 끝값과 같다.
export const INITIAL_LOADING_STATE: LoadingState = {
  kind: 'loading',
  fraction: 0.12,
};

const BOOT_STAGE_FRACTIONS: Record<BootStage, number> = {
  uiFonts: 0.34,
  catalogs: 0.44,
  mainFonts: 0.52,
};

function withFraction(state: LoadingState, fraction: number): LoadingState {
  return state.kind === 'loading' && fraction > state.fraction
    ? {
        kind: 'loading',
        fraction,
      }
    : state;
}

export function withBootStage(state: LoadingState, stage: BootStage): LoadingState {
  return withFraction(state, BOOT_STAGE_FRACTIONS[stage]);
}

export function withSceneLoad(state: LoadingState, loaderFraction: number): LoadingState {
  return withFraction(state, lerp(BOOT_STAGE_FRACTIONS.mainFonts, 1, loaderFraction));
}

export function leaveLoading(state: LoadingState): LoadingState {
  return state.kind === 'loading' ? { kind: 'leaving' } : state;
}

export function removeLoading(state: LoadingState): LoadingState {
  return state.kind === 'removed' ? state : { kind: 'removed' };
}
