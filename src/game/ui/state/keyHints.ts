export interface KeyHint {
  readonly key: string;
  readonly label: string;
}

const ITEM_SEPARATOR = /\s{2,}/;

/** 문구는 번역 파일이 정하므로 형식이 어긋나면 개발 오류로 본다. */
export function parseKeyHints(text: string): KeyHint[] {
  return text
    .trim()
    .split(ITEM_SEPARATOR)
    .map((item) => {
      const spaceIndex = item.indexOf(' ');
      if (spaceIndex === -1) {
        throw new Error(`Key hint item needs a key and a label: "${item}"`);
      }
      return {
        key: item.slice(0, spaceIndex),
        label: item.slice(spaceIndex + 1),
      };
    });
}
