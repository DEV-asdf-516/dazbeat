import Phaser from 'phaser';
import type { ButtonView } from '../../state/buttonPointer.js';
import type { ControlsButton, ControlsGuide } from '../../../app/controlsGuide.js';
import { createCloseIconButton } from './closeIcon.js';
import { QUIET_PADDING_PX } from './Button.js';
import type { Button } from './Button.js';
import { bindPointer, pointButton, setContainerHitArea } from '../input/hoverTarget.js';
import type { ButtonPointer } from '../input/hoverTarget.js';
import {
  MENU_KEY_HINT_STYLE,
  createKeyCap,
  getKeyCapObjects,
  getKeyCapLook,
  placeKeyCap,
} from './keyHintView.js';
import type { KeyCap, KeyHintStyle } from './keyHintView.js';
import { ControlsHelpCard } from './ControlsHelpCard.js';
import { HELP_BUTTON, HELP_BUTTON_ALPHAS, ensureHelpButtonTexture } from './HelpTip.js';
import { ModalFrame } from './ModalFrame.js';
import { getBrushRectTexture } from '../textures/brushRect.js';
import { HOVER_CURSOR } from '../input/cursor.js';
import { CELESTIAL_COLORS, COLORS, TYPE_SCALE, typeStyle } from '../theme.js';

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
// 도움말 카드는 CONTROLS 판 오른쪽에 이만큼 띄워 위끝을 맞춘다.
const HELP_CARD_GAP_PX = 20;
const HELP_BUTTON_TITLE_GAP_PX = 12;
const ENTRY_KEY = 'H';
const ENTRY_LABEL = 'CONTROLS';

interface RowView {
  readonly label: Phaser.GameObjects.Text;
  readonly keyCaps: readonly KeyCap[];
}

interface GroupView {
  readonly divider: Phaser.GameObjects.Image;
  readonly title: Phaser.GameObjects.Text;
  readonly rows: readonly RowView[];
}

export class ControlsOverlay {
  private readonly scene: Phaser.Scene;
  private readonly frame: ModalFrame;
  private readonly title: Phaser.GameObjects.Text;
  readonly closeButton: Button;
  private readonly helpButton: Phaser.GameObjects.Image;
  readonly helpCard: ControlsHelpCard;
  private groups: readonly GroupView[] = [];

  constructor(scene: Phaser.Scene, pointer: ButtonPointer<ControlsButton>) {
    this.scene = scene;
    this.frame = new ModalFrame(scene, pointButton(pointer, 'controlsBackdrop'));
    this.title = scene.add.text(PADDING_PX, PADDING_PX, 'CONTROLS', {
      ...typeStyle(TITLE_TYPE, CELESTIAL_COLORS.textPrimary),
      letterSpacing: TITLE_LETTER_SPACING_PX,
    });
    this.closeButton = createCloseIconButton(
      scene,
      this.title.y + this.title.height / 2,
      pointButton(pointer, 'controlsClose'),
    );
    const titleCenterYPx = this.title.y + this.title.height / 2;
    this.helpButton = scene.add
      .image(
        this.title.x + this.title.width + HELP_BUTTON_TITLE_GAP_PX + HELP_BUTTON.radiusPx,
        titleCenterYPx,
        ensureHelpButtonTexture(scene),
      )
      .setInteractive({ cursor: HOVER_CURSOR });
    bindPointer(this.helpButton, pointButton(pointer, 'controlsHelp'));
    this.helpCard = new ControlsHelpCard(scene, PANEL_KEY_CAP_STYLE, titleCenterYPx);
    this.frame.container.add([
      this.title,
      this.closeButton,
      this.helpButton,
      this.helpCard.container,
    ]);
  }

  // 열 때마다 언어·레인 키가 바뀌었을 수 있으므로 글자와 키캡을 새로 만든다.
  render(guide: ControlsGuide | null): void {
    if (guide === null) {
      this.helpCard.hide();
      this.frame.render(false);
      return;
    }
    const scene = this.scene;
    this.groups.forEach((group) => getGroupObjects(group).forEach((object) => object.destroy()));
    const groups = guide.groups.map((group): GroupView => ({
      divider: scene.add.image(PADDING_PX, 0, '__DEFAULT').setOrigin(0, 0),
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
    this.groups = groups;
    this.frame.container.add(groups.flatMap(getGroupObjects));
    // 키캡 폭이 글자 수마다 다르면 오른쪽 열이 들쭉날쭉해 보이므로 가장 넓은 키캡에 맞춘다.
    const keyCaps = groups.flatMap(({ rows }) => rows.flatMap((row) => row.keyCaps));
    const capWidthPx = Math.max(...keyCaps.map(({ cap }) => cap.width));
    const capTexture = getBrushRectTexture(scene, getKeyCapLook(PANEL_KEY_CAP_STYLE, capWidthPx));
    keyCaps.forEach(({ cap }) => cap.setTexture(capTexture));
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
    for (const [groupIndex, group] of groups.entries()) {
      if (groupIndex > 0) {
        yPx += GROUP_GAP_PX;
      }
      group.divider.setPosition(PADDING_PX, yPx).setTexture(
        getBrushRectTexture(scene, {
          widthPx: contentWidthPx,
          heightPx: 1,
          radiusPx: 0,
          fillColor: CELESTIAL_COLORS.border,
          fillAlpha: DIVIDER_ALPHA,
          border: null,
        }),
      );
      yPx += DIVIDER_GROUP_TITLE_GAP_PX;
      group.title.setPosition(PADDING_PX, yPx);
      yPx += group.title.height + GROUP_TITLE_ROWS_GAP_PX;
      for (const [rowIndex, row] of group.rows.entries()) {
        if (rowIndex > 0) {
          yPx += ROW_GAP_PX;
        }
        const centerYPx = yPx + ROW_HEIGHT_PX / 2;
        row.label.setPosition(PADDING_PX, centerYPx);
        let capLeftPx = contentRightPx - getKeysWidthPx(row);
        for (const keyCap of row.keyCaps) {
          placeKeyCap(keyCap, capLeftPx, centerYPx);
          capLeftPx += keyCap.cap.width + KEY_CAP_GAP_PX;
        }
        yPx += ROW_HEIGHT_PX;
      }
    }
    this.closeButton.alignX(contentRightPx + QUIET_PADDING_PX.xPx, 1);
    const panelWidthPx = contentRightPx + PADDING_PX;
    const panelHeightPx = yPx + PADDING_PX;
    this.frame.panel.setSize(panelWidthPx, panelHeightPx);
    this.frame.placePanel(panelWidthPx, panelHeightPx);
    const card = this.helpCard.setGuide(guide.helpKey);
    this.helpCard.panel.setSize(card.widthPx, card.heightPx);
    this.helpCard.container.setPosition(panelWidthPx + HELP_CARD_GAP_PX, 0);
    this.frame.render(true);
  }

  renderHelpButton(button: ButtonView): void {
    this.helpButton.setAlpha(HELP_BUTTON_ALPHAS[button.appearance]);
  }
}

function getGroupObjects(group: GroupView): Phaser.GameObjects.GameObject[] {
  return [
    group.divider,
    group.title,
    ...group.rows.flatMap((row) => [row.label, ...row.keyCaps.flatMap(getKeyCapObjects)]),
  ];
}

export function addControlsEntry(
  scene: Phaser.Scene,
  leftPx: number,
  topYPx: number,
  pointer: ButtonPointer<ControlsButton>,
): { readonly container: Phaser.GameObjects.Container; readonly label: Phaser.GameObjects.Text } {
  const keyCap = createKeyCap(scene, ENTRY_KEY, MENU_KEY_HINT_STYLE);
  const centerYPx = ENTRY_ROW_HEIGHT_PX / 2;
  placeKeyCap(keyCap, 0, centerYPx);
  const labelLeftPx = keyCap.cap.width + MENU_KEY_HINT_STYLE.capLabelGapPx;
  const label = scene.add
    .text(labelLeftPx, centerYPx, ENTRY_LABEL, typeStyle(TYPE_SCALE.meta, COLORS.textSecondary))
    .setOrigin(0, 0.5);
  const widthPx = labelLeftPx + label.width;
  const entry = scene.add
    .container(leftPx, topYPx, [...getKeyCapObjects(keyCap), label])
    .setSize(widthPx, ENTRY_ROW_HEIGHT_PX);
  setContainerHitArea(entry, new Phaser.Geom.Rectangle(), widthPx, ENTRY_ROW_HEIGHT_PX);
  bindPointer(entry, pointButton(pointer, 'controlsEntry'));
  return {
    container: entry,
    label,
  };
}
