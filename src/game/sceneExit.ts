export type SceneExit<T> =
  { readonly kind: 'staying' } | { readonly kind: 'leaving'; readonly target: T };

export const STAYING: { readonly kind: 'staying' } = { kind: 'staying' };

export function requestSceneExit<T>(exit: SceneExit<T>, target: T): SceneExit<T> {
  return exit.kind === 'staying'
    ? {
        kind: 'leaving',
        target,
      }
    : exit;
}
