import Phaser from 'phaser';
import type { SongCategory } from '../../data/songs.js';
import { HOVER_CURSOR } from '../ui/cursor.js';
import { setFittedText } from '../ui/fitText.js';
import { ScrollBar } from '../ui/ScrollBar.js';
import { CATEGORY_COLORS, CELESTIAL_COLORS, RADIUS, setTextColor, typeStyle } from '../ui/theme.js';
import { EDITOR_TYPE_SCALE } from './editorTheme.js';

export interface SongListFrame {
  leftPx: number;
  topYPx: number;
  widthPx: number;
  paddingPx: number;
  rowHeightPx: number;
  visibleRowCount: number;
}

export interface SongListRowContent {
  title: string;
  category: SongCategory;
  isFocused: boolean;
}

export interface SongListContent {
  rows: readonly SongListRowContent[];
  topIndex: number;
  songCount: number;
}

interface RowView {
  background: Phaser.GameObjects.Rectangle;
  tag: Phaser.GameObjects.Rectangle;
  tagText: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  shown: { title: string; category: SongCategory } | null;
}

const PANEL_BORDER_PX = 1;
const ROW_INSET_PX = 4;
/** 폭을 고정해 분류와 상관없이 곡명이 같은 x 에서 시작한다. */
const TAG_WIDTH_PX = 76;
const TAG_HEIGHT_PX = 22;
const TAG_TITLE_GAP_PX = 14;
const TAG_BORDER_PX = 1;
const TAG_TYPE = {
  sizePx: 11,
  weight: 600,
} as const;
const TAG_LETTER_SPACING_PX = 1;
const TAG_BORDER_ALPHA = 0.6;
const SCROLLBAR_WIDTH_PX = 3;
const SCROLLBAR_INSET_PX = 6;

export class SongListPanel {
  private readonly scene: Phaser.Scene;
  private readonly frame: SongListFrame;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly rows: RowView[];
  private readonly scrollBar: ScrollBar;

  constructor(
    scene: Phaser.Scene,
    frame: SongListFrame,
    actions: {
      onHoverRow: (rowIndex: number) => void;
      onPickRow: (rowIndex: number) => void;
      onWheel: (deltaYPx: number) => void;
    },
  ) {
    this.scene = scene;
    this.frame = frame;
    const onWheel = (_pointer: Phaser.Input.Pointer, _deltaX: number, deltaY: number): void =>
      actions.onWheel(deltaY);
    // 줄 사이 여백에서도 휠이 먹도록 패널 면도 입력을 받는다.
    this.panel = scene.add
      .rectangle(0, 0, frame.widthPx, 0, CELESTIAL_COLORS.surface)
      .setOrigin(0, 0)
      .setStrokeStyle(PANEL_BORDER_PX, CELESTIAL_COLORS.border)
      .setRounded(RADIUS.smallPx)
      .setInteractive()
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_WHEEL, onWheel);
    this.rows = Array.from({ length: frame.visibleRowCount }, (_, rowIndex) =>
      this.createRow(rowIndex, {
        onHover: () => actions.onHoverRow(rowIndex),
        onPick: () => actions.onPickRow(rowIndex),
        onWheel,
      }),
    );
    const scrollXPx = frame.widthPx - SCROLLBAR_INSET_PX - SCROLLBAR_WIDTH_PX;
    this.scrollBar = new ScrollBar(scene, scrollXPx);
    scene.add.container(frame.leftPx, frame.topYPx, [
      this.panel,
      ...this.rows.flatMap(({ background, tag, tagText, title }) => [
        background,
        tag,
        tagText,
        title,
      ]),
      ...this.scrollBar.objects,
    ]);
  }

  render(content: SongListContent): void {
    const { paddingPx, rowHeightPx, visibleRowCount, widthPx } = this.frame;
    this.rows.forEach((row, rowIndex) => this.renderRow(row, content.rows[rowIndex]));
    const listTopYPx = paddingPx / 2;
    const listHeightPx = content.rows.length * rowHeightPx;
    // 곡이 없으면 빈 테두리만 남지 않게 패널째 숨긴다.
    this.panel.setSize(widthPx, listHeightPx + paddingPx).setVisible(content.rows.length > 0);
    const isScrollable = content.songCount > visibleRowCount;
    this.scrollBar.setVisible(isScrollable);
    this.scrollBar.render({
      topYPx: listTopYPx,
      heightPx: listHeightPx,
      visibleCount: visibleRowCount,
      totalCount: content.songCount,
      firstIndex: content.topIndex,
    });
  }

  private createRow(
    rowIndex: number,
    actions: {
      onHover: () => void;
      onPick: () => void;
      onWheel: (pointer: Phaser.Input.Pointer, deltaX: number, deltaY: number) => void;
    },
  ): RowView {
    const { paddingPx, rowHeightPx, widthPx } = this.frame;
    const topYPx = paddingPx / 2 + rowIndex * rowHeightPx;
    const centerYPx = topYPx + rowHeightPx / 2;
    const background = this.scene.add
      .rectangle(
        ROW_INSET_PX,
        topYPx,
        widthPx - ROW_INSET_PX * 2,
        rowHeightPx,
        CELESTIAL_COLORS.surfaceHover,
      )
      .setOrigin(0, 0)
      .setRounded(RADIUS.smallPx)
      .setInteractive({ cursor: HOVER_CURSOR })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, actions.onHover)
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, actions.onPick)
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_WHEEL, actions.onWheel);
    const tag = this.scene.add
      .rectangle(paddingPx, centerYPx, TAG_WIDTH_PX, TAG_HEIGHT_PX)
      .setOrigin(0, 0.5)
      .setRounded(RADIUS.smallPx);
    const tagText = this.scene.add
      .text(paddingPx + TAG_WIDTH_PX / 2, centerYPx, '', {
        ...typeStyle(TAG_TYPE, CELESTIAL_COLORS.textSecondary),
        letterSpacing: TAG_LETTER_SPACING_PX,
      })
      .setOrigin(0.5, 0.5);
    const title = this.scene.add
      .text(
        paddingPx + TAG_WIDTH_PX + TAG_TITLE_GAP_PX,
        centerYPx,
        '',
        typeStyle(EDITOR_TYPE_SCALE.body, CELESTIAL_COLORS.textPrimary),
      )
      .setOrigin(0, 0.5);
    return {
      background,
      tag,
      tagText,
      title,
      shown: null,
    };
  }

  private renderRow(row: RowView, content: SongListRowContent | undefined): void {
    const isShown = content !== undefined;
    row.background.setVisible(isShown);
    row.tag.setVisible(isShown);
    row.tagText.setVisible(isShown);
    row.title.setVisible(isShown);
    if (content === undefined) {
      return;
    }
    row.background.setFillStyle(CELESTIAL_COLORS.surfaceHover, content.isFocused ? 1 : 0);
    setTextColor(
      row.title,
      content.isFocused ? CELESTIAL_COLORS.textPrimary : CELESTIAL_COLORS.textSecondary,
    );
    if (row.shown?.title === content.title && row.shown.category === content.category) {
      return;
    }
    row.shown = {
      title: content.title,
      category: content.category,
    };
    const tagColor = CATEGORY_COLORS[content.category];
    row.tag.setStrokeStyle(TAG_BORDER_PX, tagColor, TAG_BORDER_ALPHA);
    row.tagText.setText(content.category.toUpperCase());
    setTextColor(row.tagText, tagColor);
    setFittedText(
      row.title,
      content.title,
      this.frame.widthPx - this.frame.paddingPx - row.title.x,
    );
  }
}
