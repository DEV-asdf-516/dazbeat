import Phaser from 'phaser';
import { DIFFICULTIES } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { DEFAULT_CURSOR, DISABLED_CURSOR, HOVER_CURSOR } from '../ui/cursor.js';
import { COLORS, INDICATOR, TYPE_SCALE, setTextColor, typeStyle } from '../ui/theme.js';

interface Tab {
  difficulty: Difficulty;
  text: Phaser.GameObjects.Text;
  underline: Phaser.GameObjects.Rectangle;
}

/** 버튼보다 한 단계 작은 글자로, RETRY 에 딸린 고르개임을 보이게 한다. */
const LABEL_TYPE = TYPE_SCALE.secondary;
const SELECTED_WEIGHT = 700;
const TAB_GAP_PX = 32;

export interface DifficultyTabsState {
  selected: Difficulty;
  /** 채보가 있는 난이도. 나머지는 흐리게 두고 누를 수 없다. */
  available: readonly Difficulty[];
}

/**
 * 곡 선택 화면과 같은 꼴의 난이도 탭. 고른 난이도는 씬이 소유하고 render 로 받는다.
 * hover 는 표시에만 쓰는 이 위젯의 상태다.
 */
export class DifficultyTabs {
  private readonly tabs: readonly Tab[];
  private state: DifficultyTabsState | null = null;
  private hovered: Difficulty | null = null;

  constructor(
    scene: Phaser.Scene,
    leftPx: number,
    topYPx: number,
    onSelect: (difficulty: Difficulty) => void,
  ) {
    let xPx = leftPx;
    this.tabs = DIFFICULTIES.map((difficulty) => {
      // 고르면 굵어지므로 굵은 폭으로 간격과 밑줄을 잡아 탭이 흔들리지 않게 한다.
      const text = scene.add.text(
        xPx,
        topYPx,
        difficulty.toUpperCase(),
        typeStyle({ ...LABEL_TYPE, weight: SELECTED_WEIGHT }, COLORS.textPrimary),
      );
      const underline = scene.add
        .rectangle(
          xPx,
          topYPx + text.height + INDICATOR.underlineOffsetPx,
          text.width,
          INDICATOR.underlineThicknessPx,
          COLORS.textPrimary,
        )
        .setOrigin(0, 0);
      text
        .setInteractive({ cursor: HOVER_CURSOR })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.setHovered(difficulty))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.setHovered(null))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (this.isAvailable(difficulty)) {
            onSelect(difficulty);
          }
        });
      xPx += text.width + TAB_GAP_PX;
      return { difficulty, text, underline };
    });
  }

  /** 등장 연출이 투명도를 함께 다루도록 보이는 요소를 내준다. */
  getVisuals(): Phaser.GameObjects.Components.AlphaSingle[] {
    return this.tabs.flatMap(({ text, underline }) => [text, underline]);
  }

  render(state: DifficultyTabsState): void {
    if (this.state?.selected === state.selected && this.state.available === state.available) {
      return;
    }
    this.state = state;
    this.refresh();
  }

  private setHovered(difficulty: Difficulty | null): void {
    if (difficulty === this.hovered) {
      return;
    }
    this.hovered = difficulty;
    this.refresh();
  }

  private isAvailable(difficulty: Difficulty): boolean {
    return this.state?.available.includes(difficulty) ?? false;
  }

  private refresh(): void {
    this.tabs.forEach(({ difficulty, text, underline }) => {
      const isSelected = this.state?.selected === difficulty;
      const isAvailable = this.isAvailable(difficulty);
      text.setFontStyle(`${isSelected ? SELECTED_WEIGHT : LABEL_TYPE.weight}`);
      if (text.input !== null) {
        text.input.cursor = getTabCursor(isAvailable, isSelected);
      }
      let color: number = COLORS.textDisabled;
      if (isSelected || (isAvailable && this.hovered === difficulty)) {
        color = COLORS.textPrimary;
      } else if (isAvailable) {
        color = COLORS.textSecondary;
      }
      setTextColor(text, color);
      underline.setVisible(isSelected);
    });
  }
}

function getTabCursor(isAvailable: boolean, isSelected: boolean): string {
  if (!isAvailable) {
    return DISABLED_CURSOR;
  }
  return isSelected ? DEFAULT_CURSOR : HOVER_CURSOR;
}
