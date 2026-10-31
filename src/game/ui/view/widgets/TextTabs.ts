import type Phaser from 'phaser';
import { requireDefined } from '../../../../invariant.js';
import { DEFAULT_CURSOR, DISABLED_CURSOR, HOVER_CURSOR } from '../input/cursor.js';
import { bindHoverTarget } from '../input/hoverTarget.js';
import { COLORS, addTextUnderline, setTextColor, setTextWeight, typeStyle } from '../theme.js';
import type { TabAppearance } from '../../state/tabAppearance.js';

export interface TextTabItem<T extends string> {
  readonly key: T;
  readonly label: string;
}

export interface TextTabsLayout {
  readonly xPx: number;
  readonly align: 'left' | 'right';
  readonly topYPx: number;
}

export interface TextTabsStyle {
  /** 고르지 않은 탭의 크기·굵기. */
  readonly type: { readonly sizePx: number; readonly weight: number };
  readonly selectedWeight: number;
  readonly gapPx: number;
  readonly normalColor: number;
}

export interface TextTabsActions<T extends string> {
  readonly onSelect: (key: T) => void;
  readonly onHover: (key: T) => void;
  readonly onUnhover: (key: T) => void;
}

interface Tab<T extends string> {
  readonly key: T;
  readonly text: Phaser.GameObjects.Text;
  readonly underline: Phaser.GameObjects.Rectangle;
}

export class TextTabs<T extends string> {
  private readonly tabs: readonly Tab<T>[];

  constructor(
    scene: Phaser.Scene,
    items: readonly TextTabItem<T>[],
    layout: TextTabsLayout,
    private readonly style: TextTabsStyle,
    actions: TextTabsActions<T>,
  ) {
    let xPx = layout.xPx;
    const tabs = items.map(({ key, label }): Tab<T> => {
      // 고르면 굵어지므로 굵은 폭으로 간격과 밑줄을 잡아 탭이 흔들리지 않게 한다.
      const text = scene.add.text(
        xPx,
        layout.topYPx,
        label,
        typeStyle(
          {
            ...style.type,
            weight: style.selectedWeight,
          },
          COLORS.textPrimary,
        ),
      );
      const underline = addTextUnderline(scene, text, COLORS.textPrimary);
      // 비활성 탭을 눌러도 화면 상태 전이가 같은 참조를 돌려 아무 일도 일어나지 않는다.
      bindHoverTarget(text, {
        onOver: () => actions.onHover(key),
        onOut: () => actions.onUnhover(key),
        onActivate: () => actions.onSelect(key),
      });
      xPx += text.width + style.gapPx;
      return {
        key,
        text,
        underline,
      };
    });
    if (layout.align === 'right') {
      // 굵은 폭으로 잰 전체 폭이 나와야 오른쪽 끝을 맞출 수 있어, 다 놓은 뒤 한꺼번에 옮긴다.
      const shiftPx = layout.xPx - (xPx - style.gapPx);
      tabs.forEach(({ text, underline }) => {
        text.x += shiftPx;
        underline.x += shiftPx;
      });
    }
    this.tabs = tabs;
  }

  /** 화면 상태가 바뀐 뒤 화면이 탭별 외형과 밑줄 색을 넘긴다. */
  render(appearanceOf: (key: T) => TabAppearance, underlineColor: number): void {
    this.tabs.forEach((tab) => this.renderTab(tab, appearanceOf(tab.key), underlineColor));
  }

  getBounds(key: T): Phaser.Geom.Rectangle {
    return requireDefined(
      this.tabs.find((tab) => tab.key === key),
      'Unknown tab',
      key,
    ).text.getBounds();
  }

  getVisuals(): (Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle)[] {
    return this.tabs.flatMap(({ text, underline }) => [text, underline]);
  }

  private renderTab(tab: Tab<T>, appearance: TabAppearance, underlineColor: number): void {
    const { text, underline } = tab;
    underline.setFillStyle(underlineColor).setVisible(appearance === 'selected');
    const { type, selectedWeight, normalColor } = this.style;
    switch (appearance) {
      case 'disabled':
        this.applyAppearance(text, type.weight, COLORS.textDisabled, DISABLED_CURSOR);
        return;
      case 'selected':
        this.applyAppearance(text, selectedWeight, COLORS.textPrimary, DEFAULT_CURSOR);
        return;
      case 'emphasized':
        this.applyAppearance(text, type.weight, COLORS.textPrimary, HOVER_CURSOR);
        return;
      case 'normal':
        this.applyAppearance(text, type.weight, normalColor, HOVER_CURSOR);
        return;
    }
  }

  private applyAppearance(
    text: Phaser.GameObjects.Text,
    weight: number,
    color: number,
    cursor: string,
  ): void {
    setTextWeight(text, weight);
    setTextColor(text, color);
    if (text.input !== null) {
      text.input.cursor = cursor;
    }
  }
}
