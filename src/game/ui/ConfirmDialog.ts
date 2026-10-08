import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { Button } from './Button.js';
import type { ButtonColors } from './Button.js';
import { EDITOR_COLORS, MOTION, STATUS_COLORS, typeStyle } from './theme.js';

/** 실행 버튼 성격. 색만 고르고 키·동작은 바꾸지 않는다. */
export type ConfirmTone = 'default' | 'danger';

export interface ConfirmDialogContent {
  title: string;
  body: string;
  /** 왼쪽 버튼(복귀·취소) */
  cancelLabel: string;
  /** 오른쪽 버튼(실행) */
  acceptLabel: string;
  acceptTone: ConfirmTone;
}

// 플레이 HUD·노트(GAMEPLAY_DEPTH)와 에디터 timeline 위에 그려 팝업 아래 입력을 막는다.
const DEPTH = 100;
const BACKDROP_ALPHA = 0.6;
const PANEL_WIDTH_PX = 480;
const PADDING_PX = 32;
const CONTENT_WIDTH_PX = PANEL_WIDTH_PX - PADDING_PX * 2;
const PANEL_COLOR = 0x10192a;
const PANEL_RADIUS_PX = 6;
const SHADOW_COLOR = 0x02050c;
const SHADOW_ALPHA = 0.35;
const SHADOW_OFFSET_X_PX = 8;
const SHADOW_OFFSET_Y_PX = 12;
const BODY_GAP_PX = 12;
const ACTIONS_GAP_PX = 28;
const BUTTON_GAP_PX = 12;
const BUTTON_HEIGHT_PX = 44;
const BUTTON_PADDING_X_PX = 20;
const BUTTON_BORDER_PX = 1;
const BUTTON_HOVER_FILL = 0x1a2740;
const TITLE_TYPE = { sizePx: 22, weight: 600 } as const;
const BODY_TYPE = { sizePx: 15, weight: 400 } as const;
const BUTTON_LABEL_TYPE = { sizePx: 16, weight: 500 } as const;
// Phaser 기본 줄 높이(글자 크기의 약 1.2배)에 더해 제목 약 1.35, 본문 약 1.55 의 줄높이로 맞춘다.
const TITLE_LINE_SPACING_PX = 4;
const BODY_LINE_SPACING_PX = 6;

const CANCEL_BUTTON_COLORS: Partial<ButtonColors> = {
  label: EDITOR_COLORS.textSecondary,
  emphasizedLabel: EDITOR_COLORS.textPrimary,
  hoverFill: BUTTON_HOVER_FILL,
  disabledLabel: EDITOR_COLORS.border,
};
const ACCEPT_BUTTON_COLORS: Partial<ButtonColors> = {
  fill: null,
  hoverFill: BUTTON_HOVER_FILL,
  pressedFill: EDITOR_COLORS.surfaceHover,
  disabledLabel: EDITOR_COLORS.border,
  disabledBorder: EDITOR_COLORS.border,
};
// 실행 버튼의 경계·라벨 색이 성격을 드러낸다. 위험은 게이지 위험 단계와 같은 색이다.
const ACCEPT_TONE_COLORS: Record<ConfirmTone, number> = {
  default: EDITOR_COLORS.selected,
  danger: STATUS_COLORS.danger,
};

/**
 * 확인 팝업의 표시만 맡는다. 열림 여부·키 처리·문구 선택은 씬이 소유하고, 씬 상태가 바뀔 때 show/hide 를 부른다.
 * 패널 안 요소는 container 의 왼쪽 위(패널 모서리) 기준 좌표로 놓는다.
 */
export class ConfirmDialog {
  private readonly scene: Phaser.Scene;
  /** 화면 전체를 덮어 팝업 아래로 가는 pointer 입력을 받아 낸다. 클릭해도 아무 동작도 하지 않는다. */
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly container: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly cancel: Button;
  private readonly accept: Button;

  constructor(scene: Phaser.Scene, actions: { onCancel: () => void; onAccept: () => void }) {
    this.scene = scene;
    this.backdrop = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, EDITOR_COLORS.background, BACKDROP_ALPHA)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(DEPTH);
    this.shadow = scene.add
      .rectangle(
        SHADOW_OFFSET_X_PX,
        SHADOW_OFFSET_Y_PX,
        PANEL_WIDTH_PX,
        0,
        SHADOW_COLOR,
        SHADOW_ALPHA,
      )
      .setOrigin(0, 0)
      .setRounded(PANEL_RADIUS_PX);
    this.panel = scene.add
      .rectangle(0, 0, PANEL_WIDTH_PX, 0, PANEL_COLOR)
      .setOrigin(0, 0)
      .setRounded(PANEL_RADIUS_PX);
    this.title = scene.add.text(PADDING_PX, 0, '', {
      ...typeStyle(TITLE_TYPE, EDITOR_COLORS.textPrimary),
      lineSpacing: TITLE_LINE_SPACING_PX,
      wordWrap: { width: CONTENT_WIDTH_PX, useAdvancedWrap: true },
    });
    this.body = scene.add.text(PADDING_PX, 0, '', {
      ...typeStyle(BODY_TYPE, EDITOR_COLORS.textSecondary),
      lineSpacing: BODY_LINE_SPACING_PX,
      wordWrap: { width: CONTENT_WIDTH_PX, useAdvancedWrap: true },
    });
    this.cancel = new Button(scene, 0, 0, {
      variant: 'quiet',
      label: '',
      onActivate: actions.onCancel,
      heightPx: BUTTON_HEIGHT_PX,
      paddingXPx: BUTTON_PADDING_X_PX,
      colors: CANCEL_BUTTON_COLORS,
      labelType: BUTTON_LABEL_TYPE,
    });
    // Enter 는 늘 실행이므로 실행 버튼은 처음부터 focus 상태다. 팝업이 열려 있을 때만 outline 이 보인다.
    this.accept = new Button(scene, 0, 0, {
      variant: 'secondary',
      label: '',
      onActivate: actions.onAccept,
      heightPx: BUTTON_HEIGHT_PX,
      paddingXPx: BUTTON_PADDING_X_PX,
      labelType: BUTTON_LABEL_TYPE,
      borderWidthPx: BUTTON_BORDER_PX,
      hasFocusOutline: true,
    }).setFocused(true);
    this.container = scene.add
      .container(0, 0, [this.shadow, this.panel, this.title, this.body, this.cancel, this.accept])
      .setDepth(DEPTH);
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    this.cancel.setEnabled(false);
    this.accept.setEnabled(false);
  }

  /** 숨겨져 있었으면 페이드인하며 연다. 이미 열려 있으면 내용과 배치만 갱신한다. */
  show(content: ConfirmDialogContent): void {
    const isAlreadyVisible = this.container.visible;
    this.title.setText(content.title).setY(PADDING_PX);
    this.body.setText(content.body).setY(this.title.y + this.title.height + BODY_GAP_PX);
    const toneColor = ACCEPT_TONE_COLORS[content.acceptTone];
    this.accept.setColors({
      ...ACCEPT_BUTTON_COLORS,
      border: toneColor,
      hoverBorder: toneColor,
      emphasizedLabel: toneColor,
    });
    // 버튼 폭은 라벨에 맞춰지므로 라벨을 먼저 정한 뒤 콘텐츠 오른쪽 끝에서 왼쪽으로 모은다.
    this.accept.setLabel(content.acceptLabel);
    this.cancel.setLabel(content.cancelLabel);
    // 문구 줄 수에 따라 버튼 줄과 패널 높이가 바뀐다.
    const actionsTopYPx = this.body.y + this.body.height + ACTIONS_GAP_PX;
    const acceptXPx = PANEL_WIDTH_PX - PADDING_PX - this.accept.width;
    this.accept.setPosition(acceptXPx, actionsTopYPx);
    this.cancel.setPosition(acceptXPx - BUTTON_GAP_PX - this.cancel.width, actionsTopYPx);
    const panelHeightPx = actionsTopYPx + BUTTON_HEIGHT_PX + PADDING_PX;
    this.panel.setSize(PANEL_WIDTH_PX, panelHeightPx);
    this.shadow.setSize(PANEL_WIDTH_PX, panelHeightPx);
    this.container.setPosition(
      (GAME_WIDTH - PANEL_WIDTH_PX) / 2,
      (GAME_HEIGHT - panelHeightPx) / 2,
    );
    if (isAlreadyVisible) {
      return;
    }
    this.backdrop.setVisible(true);
    this.container.setVisible(true);
    this.cancel.setEnabled(true);
    this.accept.setEnabled(true);
    this.scene.tweens.add({
      targets: [this.backdrop, this.container],
      alpha: { from: 0, to: 1 },
      duration: MOTION.fastMs,
      ease: 'Sine.Out',
    });
  }

  /** 즉시 숨긴다. 이미 숨겨져 있으면 아무것도 하지 않는다. */
  hide(): void {
    if (!this.container.visible) {
      return;
    }
    this.scene.tweens.killTweensOf([this.backdrop, this.container]);
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    this.cancel.setEnabled(false);
    this.accept.setEnabled(false);
  }
}
