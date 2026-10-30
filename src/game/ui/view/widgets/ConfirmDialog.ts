import type Phaser from 'phaser';
import type { ButtonView } from '../../state/buttonPointer.js';
import { Button } from './Button.js';
import type { QuietButtonColors, SecondaryButtonColors } from './Button.js';
import type { PointerActions } from '../input/hoverTarget.js';
import { ModalFrame } from './ModalFrame.js';
import { CELESTIAL_COLORS, STATUS_COLORS, typeStyle } from '../theme.js';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmDialogContent {
  title: string;
  body: string;
  cancelLabel: string;
  acceptLabel: string;
  acceptTone: ConfirmTone;
}

const PANEL_WIDTH_PX = 480;
const PADDING_PX = 32;
const CONTENT_WIDTH_PX = PANEL_WIDTH_PX - PADDING_PX * 2;
const BODY_GAP_PX = 12;
const ACTIONS_GAP_PX = 28;
const BUTTON_GAP_PX = 12;
const BUTTON_HEIGHT_PX = 44;
const BUTTON_PADDING_X_PX = 20;
const BUTTON_BORDER_PX = 1;
const BUTTON_HOVER_FILL = 0x1a2740;
const TITLE_TYPE = {
  sizePx: 22,
  weight: 600,
} as const;
const BODY_TYPE = {
  sizePx: 15,
  weight: 400,
} as const;
const BUTTON_LABEL_TYPE = {
  sizePx: 16,
  weight: 500,
} as const;
// Phaser 기본 줄 높이(글자 크기의 약 1.2배)에 더해 제목 약 1.35, 본문 약 1.55 의 줄높이로 맞춘다.
const TITLE_LINE_SPACING_PX = 4;
const BODY_LINE_SPACING_PX = 6;

const CANCEL_BUTTON_COLORS: Partial<QuietButtonColors> = {
  label: CELESTIAL_COLORS.textSecondary,
  emphasizedLabel: CELESTIAL_COLORS.textPrimary,
  hoverFill: BUTTON_HOVER_FILL,
  disabledLabel: CELESTIAL_COLORS.border,
};
const ACCEPT_BUTTON_COLORS: Partial<SecondaryButtonColors> = {
  fill: null,
  hoverFill: BUTTON_HOVER_FILL,
  pressedFill: CELESTIAL_COLORS.surfaceHover,
  disabledLabel: CELESTIAL_COLORS.border,
  disabledBorder: CELESTIAL_COLORS.border,
};
const ACCEPT_TONE_COLORS: Record<ConfirmTone, number> = {
  default: CELESTIAL_COLORS.selected,
  danger: STATUS_COLORS.danger,
};

export class ConfirmDialog {
  private readonly frame: ModalFrame;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly cancel: Button;
  // 색 묶음을 바꾸는 가변 필드를 두지 않도록 톤마다 수락 버튼을 하나씩 두고 내용의 톤인 것만 보인다.
  private readonly accepts: Readonly<Record<ConfirmTone, Button>>;

  constructor(scene: Phaser.Scene, pointer: { cancel: PointerActions; accept: PointerActions }) {
    this.frame = new ModalFrame(scene, null);
    this.title = scene.add.text(PADDING_PX, 0, '', {
      ...typeStyle(TITLE_TYPE, CELESTIAL_COLORS.textPrimary),
      lineSpacing: TITLE_LINE_SPACING_PX,
      wordWrap: {
        width: CONTENT_WIDTH_PX,
        useAdvancedWrap: true,
      },
    });
    this.body = scene.add.text(PADDING_PX, 0, '', {
      ...typeStyle(BODY_TYPE, CELESTIAL_COLORS.textSecondary),
      lineSpacing: BODY_LINE_SPACING_PX,
      wordWrap: {
        width: CONTENT_WIDTH_PX,
        useAdvancedWrap: true,
      },
    });
    this.cancel = new Button(scene, 0, 0, {
      variant: 'quiet',
      label: '',
      pointer: pointer.cancel,
      heightPx: BUTTON_HEIGHT_PX,
      paddingXPx: BUTTON_PADDING_X_PX,
      focus: 'slide',
      colors: CANCEL_BUTTON_COLORS,
      labelType: BUTTON_LABEL_TYPE,
    });
    const createAccept = (tone: ConfirmTone): Button => {
      const toneColor = ACCEPT_TONE_COLORS[tone];
      return new Button(scene, 0, 0, {
        variant: 'secondary',
        label: '',
        pointer: pointer.accept,
        heightPx: BUTTON_HEIGHT_PX,
        paddingXPx: BUTTON_PADDING_X_PX,
        labelType: BUTTON_LABEL_TYPE,
        borderWidthPx: BUTTON_BORDER_PX,
        focus: 'glow',
        colors: {
          ...ACCEPT_BUTTON_COLORS,
          border: toneColor,
          hoverBorder: toneColor,
          label: toneColor,
        },
      });
    };
    this.accepts = {
      default: createAccept('default'),
      danger: createAccept('danger'),
    };
    this.frame.container.add([
      this.title,
      this.body,
      this.cancel,
      this.accepts.default,
      this.accepts.danger,
    ]);
  }

  /** 부르는 쪽이 열림이 바뀔 때만 부른다. null 이면 닫는다. */
  render(content: ConfirmDialogContent | null): void {
    if (content === null) {
      this.frame.render(false);
      return;
    }
    this.title.setText(content.title).setY(PADDING_PX);
    this.body.setText(content.body).setY(this.title.y + this.title.height + BODY_GAP_PX);
    const accept = this.accepts[content.acceptTone];
    this.accepts.default.setVisible(content.acceptTone === 'default');
    this.accepts.danger.setVisible(content.acceptTone === 'danger');
    // 버튼 폭은 라벨에 맞춰지므로 라벨을 먼저 정한다.
    accept.setLabel(content.acceptLabel);
    this.cancel.setLabel(content.cancelLabel);
    const actionsTopYPx = this.body.y + this.body.height + ACTIONS_GAP_PX;
    const acceptXPx = PANEL_WIDTH_PX - PADDING_PX - accept.width;
    accept.setPosition(acceptXPx, actionsTopYPx);
    this.cancel.setPosition(acceptXPx - BUTTON_GAP_PX - this.cancel.width, actionsTopYPx);
    this.frame.setPanelSize(PANEL_WIDTH_PX, actionsTopYPx + BUTTON_HEIGHT_PX + PADDING_PX);
    this.frame.render(true);
  }

  renderButtons(cancel: ButtonView, accept: ButtonView): void {
    this.cancel.render(cancel);
    this.accepts.default.render(accept);
    this.accepts.danger.render(accept);
  }
}
