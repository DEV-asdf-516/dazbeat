import { describe, expect, it } from 'vitest';
import { getControlsGuide, readControlsKey } from '../../../src/game/app/controlsGuide.js';
import type { ControlsKeyAction } from '../../../src/game/app/controlsGuide.js';
import { ko } from '../../../src/i18n/messages/ko.js';
import { DEFAULT_SETTINGS } from '../../../src/storage/settings.js';
import type { LaneCount } from '../../../src/rhythm/types.js';

describe('readControlsKey', () => {
  it.each<[boolean, string, boolean, ControlsKeyAction]>([
    [false, 'KeyH', false, 'open'],
    [false, 'KeyH', true, 'pass'],
    [false, 'Enter', false, 'pass'],
    [false, 'Escape', false, 'pass'],
    [false, 'ArrowUp', false, 'pass'],
    [false, 'KeyQ', false, 'pass'],
    [false, 'Tab', false, 'pass'],
    [true, 'Escape', false, 'close'],
    [true, 'KeyH', false, 'close'],
    [true, 'Escape', true, 'block'],
    [true, 'KeyH', true, 'block'],
    [true, 'Enter', false, 'block'],
    [true, 'ArrowUp', false, 'block'],
    [true, 'ArrowDown', false, 'block'],
    [true, 'ArrowLeft', false, 'block'],
    [true, 'ArrowRight', false, 'block'],
    [true, 'KeyW', false, 'block'],
    [true, 'KeyA', false, 'block'],
    [true, 'KeyS', false, 'block'],
    [true, 'KeyD', false, 'block'],
    [true, 'KeyQ', false, 'block'],
    [true, 'KeyE', false, 'block'],
    [true, 'Tab', false, 'block'],
  ])('isOpen %s + %s (repeat %s) → %s', (isOpen, code, repeat, expected) => {
    expect(
      readControlsKey(isOpen, {
        code,
        repeat,
      }),
    ).toBe(expected);
  });
});

describe('getControlsGuide', () => {
  it('builds the gameplay and menu groups in order with the default lane keys', () => {
    expect(getControlsGuide(ko.controls, DEFAULT_SETTINGS)).toEqual([
      {
        title: '플레이',
        rows: [
          {
            keys: ['D', 'F', 'J', 'K'],
            label: '노트 입력',
          },
          {
            keys: ['Tab'],
            label: 'MV 모드 전환',
          },
        ],
      },
      {
        title: '메뉴',
        rows: [
          {
            keys: ['↑↓'],
            label: '이동',
          },
          {
            keys: ['Enter'],
            label: '선택',
          },
          {
            keys: ['Esc'],
            label: '뒤로',
          },
          {
            keys: ['←→'],
            label: '조절',
          },
          {
            keys: ['Q/E'],
            label: '카테고리 전환',
          },
          {
            keys: ['R'],
            label: '랜덤 곡',
          },
          {
            keys: ['Tab'],
            label: '설정 열기',
          },
        ],
      },
    ]);
  });

  it('shows user lane keys in lane order', () => {
    const [gameplay] = getControlsGuide(ko.controls, {
      laneMode: 4,
      keyBindings: {
        ...DEFAULT_SETTINGS.keyBindings,
        4: ['KeyA', 'Semicolon', 'Digit1', 'Space'],
      },
    });

    expect(gameplay?.rows[0]?.keys).toEqual(['A', 'Semicolon', '1', 'SPACE']);
  });

  it.each<[LaneCount, string[]]>([
    [5, ['D', 'F', 'SPACE', 'J', 'K']],
    [6, ['S', 'D', 'F', 'J', 'K', 'L']],
  ])('shows every lane key of the %iK mode', (laneMode, expected) => {
    const [gameplay] = getControlsGuide(ko.controls, {
      ...DEFAULT_SETTINGS,
      laneMode,
    });

    expect(gameplay?.rows[0]?.keys).toEqual(expected);
  });
});
