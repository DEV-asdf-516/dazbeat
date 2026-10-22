import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { readControlsKey } from '../controlsGuide.js';
import type { ControlsGroup } from '../controlsGuide.js';
import { createAuxiliaryButton } from './auxiliaryButton.js';
import { QUIET_PADDING_PX } from './Button.js';
import type { Button } from './Button.js';
import { HOVER_CURSOR } from './cursor.js';
import { MENU_KEY_HINT_STYLE, createKeyCap, placeKeyCap } from './keyHintView.js';
import type { KeyCap, KeyHintStyle } from './keyHintView.js';
import {
  CELESTIAL_COLORS,
  COLORS,
  MODAL,
  MOTION,
  TYPE_SCALE,
  setTextColor,
  typeStyle,
} from './theme.js';

// 확인 팝업(ConfirmDialog)과 같은 여백·글자 크기로 맞춘다.
const PADDING_PX = 32;
const MIN_CONTENT_WIDTH_PX = 416;
const TITLE_LETTER_SPACING_PX = 3;
const TITLE_GROUP_GAP_PX = 20;
const DIVIDER_GROUP_TITLE_GAP_PX = 20;
const GROUP_GAP_PX = 24;
const GROUP_TITLE_ROWS_GAP_PX = 10;
const ROW_GAP_PX = 8;
const LABEL_KEYS_GAP_PX = 40;
const KEY_CAP_GAP_PX = 6;
const DIVIDER_ALPHA = 0.35;
const TITLE_TYPE = {
  sizePx: 22,
  weight: 600,
} as const;
const GROUP_TITLE_TYPE = {
  sizePx: 14,
  weight: 600,
} as const;
const ROW_LABEL_TYPE = {
  sizePx: 16,
  weight: 500,
} as const;
// 메뉴 힌트 키캡은 배경 그림을 가리려고 검은 면을 깔지만, 패널 위에서는 패널과 같은 계열로 띄운다.
const PANEL_KEY_CAP_STYLE: KeyHintStyle = {
  ...MENU_KEY_HINT_STYLE,
  keyType: {
    sizePx: 14,
    weight: 600,
  },
  keyColor: CELESTIAL_COLORS.textPrimary,
  capFill: CELESTIAL_COLORS.surface,
  capFillAlpha: 1,
  capBorder: CELESTIAL_COLORS.border,
  capBorderAlpha: 0.8,
  capHeightPx: 28,
  capPaddingXPx: 10,
  capMinWidthPx: 28,
};
const ROW_HEIGHT_PX = PANEL_KEY_CAP_STYLE.capHeightPx;
const ENTRY_ROW_HEIGHT_PX = MENU_KEY_HINT_STYLE.capHeightPx;
const ENTRY_KEY = 'H';
const ENTRY_LABEL = 'CONTROLS';

interface RowView {
  readonly label: Phaser.GameObjects.Text;
  readonly keyCaps: readonly KeyCap[];
}

export class ControlsOverlay {
  private readonly scene: Phaser.Scene;
  private readonly readGuide: () => readonly ControlsGroup[];
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly container: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly panelHitArea = new Phaser.Geom.Rectangle();
  private readonly title: Phaser.GameObjects.Text;
  private readonly closeButton: Button;
  private contentObjects: readonly Phaser.GameObjects.GameObject[] = [];
  private isBackdropPressed = false;

  constructor(scene: Phaser.Scene, readGuide: () => readonly ControlsGroup[]) {
    this.scene = scene;
    this.readGuide = readGuide;
    this.backdrop = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, CELESTIAL_COLORS.background, MODAL.backdropAlpha)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(MODAL.depth);
    // 진입 클릭의 pointer up 이 열자마자 막을 닫지 않도록 막에서 누른 경우만 닫는다.
    this.backdrop.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.isBackdropPressed = true;
    });
    this.backdrop.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.isBackdropPressed = false;
    });
    this.backdrop.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (this.isBackdropPressed) {
        this.close();
      }
    });
    this.shadow = scene.add
      .rectangle(
        MODAL.shadowOffsetXPx,
        MODAL.shadowOffsetYPx,
        0,
        0,
        MODAL.shadowColor,
        MODAL.shadowAlpha,
      )
      .setOrigin(0, 0)
      .setRounded(MODAL.panelRadiusPx);
    // 패널 안 클릭이 막으로 가 닫히지 않도록 패널도 입력을 받는다.
    this.panel = scene.add
      .rectangle(0, 0, 0, 0, MODAL.panelColor)
      .setOrigin(0, 0)
      .setRounded(MODAL.panelRadiusPx)
      .setInteractive(this.panelHitArea, (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
        Phaser.Geom.Rectangle.Contains(hitArea, x, y),
      );
    this.title = scene.add.text(PADDING_PX, PADDING_PX, 'CONTROLS', {
      ...typeStyle(TITLE_TYPE, CELESTIAL_COLORS.textPrimary),
      letterSpacing: TITLE_LETTER_SPACING_PX,
    });
    this.closeButton = createAuxiliaryButton(scene, 0, this.title.y + this.title.height / 2, {
      label: 'CLOSE',
      onActivate: () => this.close(),
    });
    this.container = scene.add
      .container(0, 0, [this.shadow, this.panel, this.title, this.closeButton])
      .setDepth(MODAL.depth);
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    this.closeButton.setEnabled(false);
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  open(): void {
    if (this.isOpen) {
      return;
    }
    this.render(this.readGuide());
    this.backdrop.setVisible(true);
    this.container.setVisible(true);
    this.closeButton.setEnabled(true);
    this.scene.tweens.add({
      targets: [this.backdrop, this.container],
      alpha: {
        from: 0,
        to: 1,
      },
      duration: MOTION.fastMs,
      ease: 'Sine.Out',
    });
  }

  handleKey(event: Pick<KeyboardEvent, 'code' | 'repeat'>): boolean {
    switch (readControlsKey(this.isOpen, event)) {
      case 'open':
        this.open();
        return true;
      case 'close':
        this.close();
        return true;
      case 'block':
        return true;
      case 'pass':
        return false;
    }
  }

  private close(): void {
    if (!this.isOpen) {
      return;
    }
    this.scene.tweens.killTweensOf([this.backdrop, this.container]);
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    this.closeButton.setEnabled(false);
    this.isBackdropPressed = false;
  }

  /** 열 때마다 언어·레인 키가 바뀌었을 수 있으므로 행을 새로 만든다. */
  private render(guide: readonly ControlsGroup[]): void {
    this.contentObjects.forEach((object) => object.destroy());
    const scene = this.scene;
    const groups = guide.map((group) => ({
      divider: scene.add
        .rectangle(PADDING_PX, 0, 0, 1, CELESTIAL_COLORS.border, DIVIDER_ALPHA)
        .setOrigin(0, 0),
      title: scene.add.text(
        0,
        0,
        group.title,
        typeStyle(GROUP_TITLE_TYPE, CELESTIAL_COLORS.selected),
      ),
      rows: group.rows.map((row): RowView => ({
        label: scene.add
          .text(0, 0, row.label, typeStyle(ROW_LABEL_TYPE, CELESTIAL_COLORS.textSecondary))
          .setOrigin(0, 0.5),
        keyCaps: row.keys.map((key) => createKeyCap(scene, key, PANEL_KEY_CAP_STYLE)),
      })),
    }));
    // 키캡 폭이 글자 수마다 다르면 오른쪽 열이 들쭉날쭉해 보이므로 가장 넓은 키캡에 맞춘다.
    const keyCaps = groups.flatMap(({ rows }) => rows.flatMap((row) => row.keyCaps));
    const capWidthPx = Math.max(...keyCaps.map(({ cap }) => cap.width));
    keyCaps.forEach(({ cap }) => cap.setSize(capWidthPx, cap.height));
    const getKeysWidthPx = (row: RowView): number =>
      (capWidthPx + KEY_CAP_GAP_PX) * row.keyCaps.length - KEY_CAP_GAP_PX;
    const contentWidthPx = Math.max(
      MIN_CONTENT_WIDTH_PX,
      ...groups.flatMap(({ rows }) =>
        rows.map((row) => row.label.width + LABEL_KEYS_GAP_PX + getKeysWidthPx(row)),
      ),
    );
    const contentRightPx = PADDING_PX + contentWidthPx;
    let yPx = this.title.y + this.title.height + TITLE_GROUP_GAP_PX;
    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        yPx += GROUP_GAP_PX;
      }
      group.divider.setPosition(PADDING_PX, yPx).setSize(contentWidthPx, 1);
      yPx += DIVIDER_GROUP_TITLE_GAP_PX;
      group.title.setPosition(PADDING_PX, yPx);
      yPx += group.title.height + GROUP_TITLE_ROWS_GAP_PX;
      group.rows.forEach((row, rowIndex) => {
        if (rowIndex > 0) {
          yPx += ROW_GAP_PX;
        }
        const centerYPx = yPx + ROW_HEIGHT_PX / 2;
        row.label.setPosition(PADDING_PX, centerYPx);
        let capLeftPx = contentRightPx - getKeysWidthPx(row);
        row.keyCaps.forEach((keyCap) => {
          placeKeyCap(keyCap, capLeftPx, centerYPx);
          capLeftPx += keyCap.cap.width + KEY_CAP_GAP_PX;
        });
        yPx += ROW_HEIGHT_PX;
      });
    });
    // 키캡을 키보다 먼저 넣어 키가 키캡 위에 그려지게 한다.
    this.contentObjects = groups.flatMap((group) => [
      group.divider,
      group.title,
      ...group.rows.flatMap((row) => [
        row.label,
        ...row.keyCaps.flatMap(({ cap, key }) => [cap, key]),
      ]),
    ]);
    this.container.add([...this.contentObjects]);
    this.closeButton.alignX(contentRightPx + QUIET_PADDING_PX.xPx, 1);
    const panelWidthPx = contentRightPx + PADDING_PX;
    const panelHeightPx = yPx + PADDING_PX;
    this.panel.setSize(panelWidthPx, panelHeightPx);
    this.panelHitArea.setTo(0, 0, panelWidthPx, panelHeightPx);
    this.shadow.setSize(panelWidthPx, panelHeightPx);
    this.container.setPosition((GAME_WIDTH - panelWidthPx) / 2, (GAME_HEIGHT - panelHeightPx) / 2);
  }
}

export function addControlsEntry(
  scene: Phaser.Scene,
  leftPx: number,
  topYPx: number,
  onActivate: () => void,
): Phaser.GameObjects.Container {
  const keyCap = createKeyCap(scene, ENTRY_KEY, MENU_KEY_HINT_STYLE);
  const centerYPx = ENTRY_ROW_HEIGHT_PX / 2;
  placeKeyCap(keyCap, 0, centerYPx);
  const labelLeftPx = keyCap.cap.width + MENU_KEY_HINT_STYLE.capLabelGapPx;
  const label = scene.add
    .text(labelLeftPx, centerYPx, ENTRY_LABEL, typeStyle(TYPE_SCALE.meta, COLORS.textSecondary))
    .setOrigin(0, 0.5);
  const widthPx = labelLeftPx + label.width;
  const entry = scene.add
    .container(leftPx, topYPx, [keyCap.cap, keyCap.key, label])
    .setSize(widthPx, ENTRY_ROW_HEIGHT_PX);
  // Phaser 는 Container 의 hit 좌표에 displayOrigin(크기의 절반)을 더하므로 그만큼 옮긴다.
  const hitArea = new Phaser.Geom.Rectangle(
    widthPx / 2,
    ENTRY_ROW_HEIGHT_PX / 2,
    widthPx,
    ENTRY_ROW_HEIGHT_PX,
  );
  let isPressed = false;
  entry.setInteractive({
    hitArea,
    hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) =>
      Phaser.Geom.Rectangle.Contains(area, x, y),
    cursor: HOVER_CURSOR,
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
    setTextColor(label, COLORS.textPrimary);
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    isPressed = false;
    setTextColor(label, COLORS.textSecondary);
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
    isPressed = true;
  });
  entry.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (!isPressed) {
      return;
    }
    isPressed = false;
    onActivate();
  });
  return entry;
}
