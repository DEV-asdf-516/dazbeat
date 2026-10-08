import Phaser from 'phaser';
import type { SongCategory } from '../../data/songs.js';
import { HOVER_CURSOR } from '../ui/cursor.js';
import { setFittedText } from '../ui/fitText.js';
import { EDITOR_COLORS, EDITOR_TYPE_SCALE, RADIUS, setTextColor, typeStyle } from '../ui/theme.js';

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
  /** 위에서부터 보이는 줄. frame 의 줄 수보다 적으면 패널이 그만큼 짧아진다. */
  rows: readonly SongListRowContent[];
  topIndex: number;
  songCount: number;
}

interface RowView {
  background: Phaser.GameObjects.Rectangle;
  tag: Phaser.GameObjects.Rectangle;
  tagText: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  /** 마지막으로 맞춘 문구. 같으면 곡명 줄임을 다시 계산하지 않는다. */
  shown: { title: string; category: SongCategory } | null;
}

const PANEL_BORDER_PX = 1;
const ROW_INSET_PX = 4;
/** 곡 분류 표시 칸. 폭을 고정해 분류와 상관없이 곡명이 같은 x 에서 시작한다. */
const TAG_WIDTH_PX = 76;
const TAG_HEIGHT_PX = 22;
const TAG_TITLE_GAP_PX = 14;
const TAG_BORDER_PX = 1;
const TAG_TYPE = { sizePx: 11, weight: 600 } as const;
const TAG_LETTER_SPACING_PX = 1;
/** 원곡은 강조색, 커버는 보조색으로 구분한다. */
const TAG_COLORS: Record<SongCategory, number> = {
  original: EDITOR_COLORS.selected,
  cover: EDITOR_COLORS.textSecondary,
};
const TAG_BORDER_ALPHA = 0.6;
const SCROLLBAR_WIDTH_PX = 3;
const SCROLLBAR_INSET_PX = 6;
const SCROLLBAR_TRACK_ALPHA = 0.3;

/**
 * 곡 목록의 표시와 pointer 입력 전달만 맡는다. 포커스·스크롤은 씬 상태가 소유하고,
 * 씬 상태가 바뀔 때 render 를 부른다. 패널 안 요소는 container 의 왼쪽 위 기준 좌표로 놓는다.
 */
export class SongListPanel {
  private readonly scene: Phaser.Scene;
  private readonly frame: SongListFrame;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly rows: RowView[];
  private readonly scrollTrack: Phaser.GameObjects.Rectangle;
  private readonly scrollThumb: Phaser.GameObjects.Rectangle;

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
      .rectangle(0, 0, frame.widthPx, 0, EDITOR_COLORS.surface)
      .setOrigin(0, 0)
      .setStrokeStyle(PANEL_BORDER_PX, EDITOR_COLORS.border)
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
    this.scrollTrack = scene.add
      .rectangle(scrollXPx, 0, SCROLLBAR_WIDTH_PX, 0, EDITOR_COLORS.border, SCROLLBAR_TRACK_ALPHA)
      .setOrigin(0, 0);
    this.scrollThumb = scene.add
      .rectangle(scrollXPx, 0, SCROLLBAR_WIDTH_PX, 0, EDITOR_COLORS.selected)
      .setOrigin(0, 0);
    scene.add.container(frame.leftPx, frame.topYPx, [
      this.panel,
      ...this.rows.flatMap(({ background, tag, tagText, title }) => [
        background,
        tag,
        tagText,
        title,
      ]),
      this.scrollTrack,
      this.scrollThumb,
    ]);
  }

  render(content: SongListContent): void {
    const { paddingPx, rowHeightPx, visibleRowCount, widthPx } = this.frame;
    this.rows.forEach((row, rowIndex) => this.renderRow(row, content.rows[rowIndex]));
    const listTopYPx = paddingPx / 2;
    const listHeightPx = content.rows.length * rowHeightPx;
    // 곡이 없으면 빈 테두리만 남지 않게 패널째 숨긴다. 빈 상태 문구는 씬이 그린다.
    this.panel.setSize(widthPx, listHeightPx + paddingPx).setVisible(content.rows.length > 0);
    const isScrollable = content.songCount > visibleRowCount;
    this.scrollTrack
      .setVisible(isScrollable)
      .setSize(SCROLLBAR_WIDTH_PX, listHeightPx)
      .setY(listTopYPx);
    this.scrollThumb
      .setVisible(isScrollable)
      .setSize(SCROLLBAR_WIDTH_PX, (listHeightPx * visibleRowCount) / content.songCount)
      .setY(listTopYPx + (listHeightPx * content.topIndex) / content.songCount);
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
        EDITOR_COLORS.surfaceHover,
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
        ...typeStyle(TAG_TYPE, EDITOR_COLORS.textSecondary),
        letterSpacing: TAG_LETTER_SPACING_PX,
      })
      .setOrigin(0.5, 0.5);
    const title = this.scene.add
      .text(
        paddingPx + TAG_WIDTH_PX + TAG_TITLE_GAP_PX,
        centerYPx,
        '',
        typeStyle(EDITOR_TYPE_SCALE.body, EDITOR_COLORS.textPrimary),
      )
      .setOrigin(0, 0.5);
    return { background, tag, tagText, title, shown: null };
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
    // 포커스는 줄 면과 곡명 밝기로만 구분한다.
    row.background.setFillStyle(EDITOR_COLORS.surfaceHover, content.isFocused ? 1 : 0);
    setTextColor(
      row.title,
      content.isFocused ? EDITOR_COLORS.textPrimary : EDITOR_COLORS.textSecondary,
    );
    if (row.shown?.title === content.title && row.shown.category === content.category) {
      return;
    }
    row.shown = { title: content.title, category: content.category };
    const tagColor = TAG_COLORS[content.category];
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
