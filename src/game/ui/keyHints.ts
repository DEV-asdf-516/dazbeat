export interface KeyHint {
  readonly key: string;
  readonly label: string;
}

/** 안내 문구에서 항목을 나누는 구분. 항목 안 키와 설명은 공백 하나로 나뉜다. */
const ITEM_SEPARATOR = /\s{2,}/;

/**
 * `"Space 재생/일시정지   Esc 나가기"` 형식의 안내 문구를 키·설명 쌍으로 나눈다.
 * 문구는 번역 파일이 정하므로 형식이 어긋나면 개발 오류로 본다.
 */
export function parseKeyHints(text: string): KeyHint[] {
  return text
    .trim()
    .split(ITEM_SEPARATOR)
    .map((item) => {
      const spaceIndex = item.indexOf(' ');
      if (spaceIndex === -1) {
        throw new Error(`Key hint item needs a key and a label: "${item}"`);
      }
      return { key: item.slice(0, spaceIndex), label: item.slice(spaceIndex + 1) };
    });
}
