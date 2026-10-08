/** 씬 인스턴스의 이탈 여부. leaving 은 이동할 대상을 담는다. */
export type SceneExit<T> =
  { readonly kind: 'staying' } | { readonly kind: 'leaving'; readonly target: T };

export const STAYING: { readonly kind: 'staying' } = { kind: 'staying' };

/** 이미 leaving 이면 두 번째 요청은 무시하고 같은 상태 객체를 돌려준다. */
export function requestSceneExit<T>(exit: SceneExit<T>, target: T): SceneExit<T> {
  return exit.kind === 'staying' ? { kind: 'leaving', target } : exit;
}
