/** 메시지는 던질 때만 만들도록 바뀌는 값은 subject 로 따로 넘긴다. */
export function requireDefined<T>(
  value: T | undefined,
  message: string,
  subject?: string | number,
): T {
  if (value === undefined) {
    throw new Error(subject === undefined ? message : `${message}: ${subject}`);
  }
  return value;
}
