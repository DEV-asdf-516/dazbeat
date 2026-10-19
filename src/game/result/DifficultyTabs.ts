import Phaser from 'phaser';
import { DIFFICULTIES, findChart } from '../../data/songs.js';
import type { ChartRef, Song } from '../../data/songs.js';
import type { Difficulty } from '../../rhythm/types.js';
import { getDifficultyAppearance } from '../difficultyAppearance.js';
import type { DifficultyAppearance } from '../difficultyAppearance.js';
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
  song: Song;
}

export class DifficultyTabs {
  private readonly tabs: readonly Tab[];
  private state: DifficultyTabsState;
  private hovered: Difficulty | null = null;

  constructor(
    scene: Phaser.Scene,
    leftPx: number,
    topYPx: number,
    state: DifficultyTabsState,
    onSelect: (chart: ChartRef) => void,
  ) {
    this.state = state;
    let xPx = leftPx;
    this.tabs = DIFFICULTIES.map((difficulty) => {
      // 고르면 굵어지므로 굵은 폭으로 간격과 밑줄을 잡아 탭이 흔들리지 않게 한다.
      const text = scene.add.text(
        xPx,
        topYPx,
        difficulty.toUpperCase(),
        typeStyle(
          {
            ...LABEL_TYPE,
            weight: SELECTED_WEIGHT,
          },
          COLORS.textPrimary,
        ),
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
          const chart = findChart(this.state.song, difficulty);
          if (chart !== undefined) {
            onSelect(chart);
          }
        });
      xPx += text.width + TAB_GAP_PX;
      return {
        difficulty,
        text,
        underline,
      };
    });
    this.refresh();
  }

  getVisuals(): Phaser.GameObjects.Components.AlphaSingle[] {
    return this.tabs.flatMap(({ text, underline }) => [text, underline]);
  }

  render(state: DifficultyTabsState): void {
    if (this.state.selected === state.selected && this.state.song === state.song) {
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

  private refresh(): void {
    this.tabs.forEach(({ difficulty, text, underline }) => {
      const appearance = getDifficultyAppearance({
        isSelected: this.state.selected === difficulty,
        isAvailable: findChart(this.state.song, difficulty) !== undefined,
        isHovered: this.hovered === difficulty,
      });
      text.setFontStyle(`${appearance === 'selected' ? SELECTED_WEIGHT : LABEL_TYPE.weight}`);
      if (text.input !== null) {
        text.input.cursor = getTabCursor(appearance);
      }
      setTextColor(text, getTabColor(appearance));
      underline.setVisible(appearance === 'selected');
    });
  }
}

function getTabCursor(appearance: DifficultyAppearance): string {
  switch (appearance) {
    case 'disabled':
      return DISABLED_CURSOR;
    case 'selected':
      return DEFAULT_CURSOR;
    case 'emphasized':
    case 'normal':
      return HOVER_CURSOR;
  }
}

function getTabColor(appearance: DifficultyAppearance): number {
  switch (appearance) {
    case 'disabled':
      return COLORS.textDisabled;
    case 'selected':
    case 'emphasized':
      return COLORS.textPrimary;
    case 'normal':
      return COLORS.textSecondary;
  }
}
