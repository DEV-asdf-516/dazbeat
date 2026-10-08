import { describe, expect, it } from 'vitest';
import { parseKeyHints } from '../../../src/game/ui/keyHints.js';
import { en } from '../../../src/i18n/messages/en.js';
import { ja } from '../../../src/i18n/messages/ja.js';
import { ko } from '../../../src/i18n/messages/ko.js';

describe('parseKeyHints', () => {
  it('splits items on runs of spaces and keys on the first space', () => {
    expect(parseKeyHints('Space 재생/일시정지   Delete 노트 삭제   Esc 나가기')).toEqual([
      { key: 'Space', label: '재생/일시정지' },
      { key: 'Delete', label: '노트 삭제' },
      { key: 'Esc', label: '나가기' },
    ]);
  });

  it('reads a single item', () => {
    expect(parseKeyHints('Esc Back')).toEqual([{ key: 'Esc', label: 'Back' }]);
  });

  it('throws on an item without a label', () => {
    expect(() => parseKeyHints('Space 재생   Esc')).toThrow('Esc');
  });

  // 힌트 줄을 그리는 모든 화면의 문구가 키·설명 형식을 지켜야 한다.
  it('parses every screen hint in every language', () => {
    for (const messages of [ko, ja, en]) {
      const hints = [
        messages.main.hint,
        messages.songSelect.hint,
        messages.settings.hint,
        messages.credits.hint,
        messages.result.hint,
        messages.chartEditorSelect.hint,
        messages.chartEditor.hint,
      ];
      for (const hint of hints) {
        for (const item of parseKeyHints(hint)) {
          expect(item.key).not.toBe('');
          expect(item.label).not.toBe('');
        }
      }
    }
  });
});
