export type StateReader<S> = (state: S) => unknown;

/** 영역마다 그릴 때 읽는 값을 적어 두고, 그중 하나라도 바뀐 영역만 돌려준다. 이전 상태가 없으면 모든 영역이다. */
export function filterChangedRegions<S, R extends string>(
  sources: Readonly<Record<R, readonly StateReader<S>[]>>,
  previous: S | null,
  next: S,
): readonly R[] {
  const regions = Object.keys(sources) as R[];
  return previous === null
    ? regions
    : regions.filter((region) => sources[region].some((read) => read(previous) !== read(next)));
}
