/** 두 객체의 필드가 모두 같은 값·참조인지 본다. ignoredKeys 의 필드는 비교하지 않는다. */
export function isShallowEqual<T extends object>(
  a: T,
  b: T,
  ignoredKeys: readonly (keyof T)[] = [],
): boolean {
  // 한쪽에만 있는 필드도 다른 것으로 보도록 두 객체의 키를 모두 본다.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof T)[]);
  return [...keys].every((key) => ignoredKeys.includes(key) || a[key] === b[key]);
}
