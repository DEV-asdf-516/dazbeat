import type Phaser from 'phaser';
import type { ButtonView } from '../../ui/state/buttonPointer.js';
import type { PointerActions } from '../../ui/view/input/hoverTarget.js';
import { getBrushRectTexture } from '../../ui/view/textures/brushRect.js';
import { Button, QUIET_PADDING_PX } from '../../ui/view/widgets/Button.js';
import { createCloseIconButton } from '../../ui/view/widgets/closeIcon.js';
import {
  CONFIRM_ACCEPT_BUTTON,
  CONFIRM_CANCEL_BUTTON,
} from '../../ui/view/widgets/ConfirmDialog.js';
import { ModalFrame } from '../../ui/view/widgets/ModalFrame.js';
import { ScrollBar } from '../../ui/view/widgets/ScrollBar.js';
import { CELESTIAL_COLORS, typeStyle } from '../../ui/view/theme.js';
import { NOTICE_VIEWPORT_HEIGHT_PX } from '../state/noticeBoard.js';

export interface NoticeBoardItem {
  readonly title: string;
  readonly dateLabel: string;
  readonly body: string;
}

interface PlacedPiece {
  readonly object: Phaser.GameObjects.Text | Phaser.GameObjects.Image;
  readonly baseYPx: number;
}

const PANEL_WIDTH_PX = 920;
const PANEL_HEIGHT_PX = 720;
const PADDING_PX = 40;
const HEADER_TOP_PX = 40;
const HEADER_DIVIDER_Y_PX = 84;
const VIEWPORT_TOP_PX = 108;
const VIEWPORT_BOTTOM_PX = VIEWPORT_TOP_PX + NOTICE_VIEWPORT_HEIGHT_PX;
const ACTIONS_TOP_PX = 636;
const SCROLLBAR_X_PX = PANEL_WIDTH_PX - PADDING_PX - 2;
const SCROLLBAR_GAP_PX = 24;
const CONTENT_WIDTH_PX = SCROLLBAR_X_PX - SCROLLBAR_GAP_PX - PADDING_PX;
const DIVIDER_WIDTH_PX = PANEL_WIDTH_PX - PADDING_PX * 2;
const DIVIDER_ALPHA = 0.5;
const BUTTON_GAP_PX = 12;
const HEADER_TYPE = {
  sizePx: 24,
  weight: 700,
} as const;
const TITLE_TYPE = {
  sizePx: 22,
  weight: 700,
} as const;
const DATE_TYPE = {
  sizePx: 14,
  weight: 500,
} as const;
const BODY_TYPE = {
  sizePx: 16,
  weight: 400,
} as const;
const BODY_LINE_SPACING_PX = 9;
const TITLE_DATE_GAP_PX = 8;
const DATE_BODY_GAP_PX = 12;
const ITEM_DIVIDER_GAP_PX = 28;

export class NoticeBoard {
  private readonly scene: Phaser.Scene;
  private readonly frame: ModalFrame;
  private readonly scrollBar: ScrollBar;
  private readonly dismiss: Button;
  private readonly close: Button;
  private readonly closeIcon: Button;
  // 배치 결과다. 공지가 도착할 때 한 번 만들고 스크롤은 기준 y 에서 옮기기만 한다.
  private pieces: readonly PlacedPiece[] = [];

  constructor(
    scene: Phaser.Scene,
    pointer: { dismiss: PointerActions; close: PointerActions; closeIcon: PointerActions },
  ) {
    this.scene = scene;
    this.frame = new ModalFrame(scene, null);
    this.frame.panel.setSize(PANEL_WIDTH_PX, PANEL_HEIGHT_PX);
    this.frame.placePanel(PANEL_WIDTH_PX, PANEL_HEIGHT_PX);
    // 대문자 게임 키워드라 번역하지 않는다.
    const header = scene.add.text(
      PADDING_PX,
      HEADER_TOP_PX,
      'NOTICE',
      typeStyle(HEADER_TYPE, CELESTIAL_COLORS.textPrimary),
    );
    const addDivider = (yPx: number): Phaser.GameObjects.Image =>
      scene.add.image(PADDING_PX, yPx, this.getDividerTexture()).setOrigin(0, 0);
    this.scrollBar = new ScrollBar(scene, SCROLLBAR_X_PX);
    this.dismiss = new Button(scene, 0, ACTIONS_TOP_PX, {
      ...CONFIRM_CANCEL_BUTTON,
      label: '',
      pointer: pointer.dismiss,
    });
    this.close = new Button(scene, 0, ACTIONS_TOP_PX, {
      ...CONFIRM_ACCEPT_BUTTON,
      label: '',
      pointer: pointer.close,
    });
    this.closeIcon = createCloseIconButton(
      scene,
      header.y + header.height / 2,
      pointer.closeIcon,
    ).alignX(PANEL_WIDTH_PX - PADDING_PX + QUIET_PADDING_PX.xPx, 1);
    this.frame.container.add([
      header,
      addDivider(HEADER_DIVIDER_Y_PX),
      addDivider(VIEWPORT_BOTTOM_PX),
      ...this.scrollBar.objects,
      this.dismiss,
      this.close,
      this.closeIcon,
    ]);
  }

  layout(items: readonly NoticeBoardItem[]): number {
    this.pieces.forEach(({ object }) => object.destroy());
    const pieces: PlacedPiece[] = [];
    let yPx = 0;
    const place = (object: PlacedPiece['object']): void => {
      pieces.push({
        object,
        baseYPx: yPx,
      });
      yPx += object.displayHeight;
    };
    const addText = (
      text: string,
      type: { readonly sizePx: number; readonly weight: number },
      color: number,
      lineSpacingPx: number,
    ): Phaser.GameObjects.Text =>
      this.scene.add.text(PADDING_PX, 0, text, {
        ...typeStyle(type, color),
        lineSpacing: lineSpacingPx,
        wordWrap: {
          width: CONTENT_WIDTH_PX,
          useAdvancedWrap: true,
        },
      });
    for (const [index, item] of items.entries()) {
      if (index > 0) {
        yPx += ITEM_DIVIDER_GAP_PX;
        place(
          this.scene.add
            .image(PADDING_PX, 0, this.getDividerTexture(CONTENT_WIDTH_PX))
            .setOrigin(0, 0),
        );
        yPx += ITEM_DIVIDER_GAP_PX;
      }
      place(addText(item.title, TITLE_TYPE, CELESTIAL_COLORS.textPrimary, 0));
      yPx += TITLE_DATE_GAP_PX;
      place(addText(item.dateLabel, DATE_TYPE, CELESTIAL_COLORS.textSecondary, 0));
      yPx += DATE_BODY_GAP_PX;
      place(addText(item.body, BODY_TYPE, CELESTIAL_COLORS.textNeutral, BODY_LINE_SPACING_PX));
    }
    this.pieces = pieces;
    this.frame.container.add(pieces.map(({ object }) => object));
    return yPx;
  }

  render(labels: { readonly dismiss: string; readonly close: string } | null): void {
    if (labels === null) {
      this.frame.render(false);
      return;
    }
    this.close.setContent({
      kind: 'label',
      label: labels.close,
    });
    this.dismiss.setContent({
      kind: 'label',
      label: labels.dismiss,
    });
    const closeXPx = PANEL_WIDTH_PX - PADDING_PX - this.close.width;
    this.close.setX(closeXPx);
    this.dismiss.setX(closeXPx - BUTTON_GAP_PX - this.dismiss.width);
    if (!this.frame.container.visible) {
      this.frame.render(true);
    }
  }

  renderButtons(dismiss: ButtonView, close: ButtonView, closeIcon: ButtonView): void {
    this.dismiss.render(dismiss);
    this.close.render(close);
    this.closeIcon.render(closeIcon);
  }

  renderScroll(scrollPx: number, contentHeightPx: number): void {
    // Canvas 렌더러에서도 같은 모양이 되도록 마스크 대신 영역에 걸친 글을 잘라 보인다.
    for (const { object, baseYPx } of this.pieces) {
      const topYPx = VIEWPORT_TOP_PX + baseYPx - scrollPx;
      const heightPx = object.displayHeight;
      const visibleTopYPx = Math.max(topYPx, VIEWPORT_TOP_PX);
      const visibleBottomYPx = Math.min(topYPx + heightPx, VIEWPORT_BOTTOM_PX);
      object.setY(topYPx).setVisible(visibleBottomYPx > visibleTopYPx);
      const frameHeightPx = object.frame.height;
      object.setCrop(
        0,
        ((visibleTopYPx - topYPx) / heightPx) * frameHeightPx,
        object.frame.width,
        (Math.max(0, visibleBottomYPx - visibleTopYPx) / heightPx) * frameHeightPx,
      );
    }
    this.scrollBar.render(
      contentHeightPx > NOTICE_VIEWPORT_HEIGHT_PX
        ? {
            kind: 'thumb',
            firstIndex: scrollPx,
            visibleCount: NOTICE_VIEWPORT_HEIGHT_PX,
            totalCount: contentHeightPx,
          }
        : { kind: 'hidden' },
      {
        topYPx: VIEWPORT_TOP_PX,
        heightPx: NOTICE_VIEWPORT_HEIGHT_PX,
      },
    );
  }

  private getDividerTexture(widthPx = DIVIDER_WIDTH_PX): string {
    return getBrushRectTexture(this.scene, {
      widthPx,
      heightPx: 1,
      radiusPx: 0,
      fillColor: CELESTIAL_COLORS.border,
      fillAlpha: DIVIDER_ALPHA,
      border: null,
    });
  }
}
