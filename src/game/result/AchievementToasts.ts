import Phaser from 'phaser';
import type { AchievementId } from '../../data/achievements.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.js';
import { getAchievementEmblemTexture } from '../ui/achievementEmblem.js';
import { getCloseIconTexture } from '../ui/closeIcon.js';
import { setFittedText } from '../ui/fitText.js';
import { bindHoverTarget } from '../ui/hoverTarget.js';
import { CARD_PANEL, COLORS, RADIUS, typeStyle } from '../ui/theme.js';

export interface AchievementNotice {
  readonly id: AchievementId;
  readonly name: string;
}

interface Toast {
  readonly container: Phaser.GameObjects.Container;
  slideTween: Phaser.Tweens.Tween | null;
  exitTimer: Phaser.Time.TimerEvent | null;
}

const TOAST_WIDTH_PX = 440;
const TOAST_HEIGHT_PX = 88;
const EDGE_INSET_PX = 32;
const STACK_GAP_PX = 12;
const MAX_VISIBLE = 3;
const EMBLEM_SIZE_PX = 64;
const EMBLEM_INSET_PX = (TOAST_HEIGHT_PX - EMBLEM_SIZE_PX) / 2;
const TEXT_X_PX = EMBLEM_INSET_PX + EMBLEM_SIZE_PX + 16;
const TEXT_MAX_WIDTH_PX = TOAST_WIDTH_PX - TEXT_X_PX - EMBLEM_INSET_PX;
const CLOSE_HIT_SIZE_PX = 40;
const CLOSE_ICON_SIZE_PX = 24;
// 첫 줄 라벨이 닫기 버튼 아래로 들어가지 않게 그만큼 줄인다.
const LABEL_MAX_WIDTH_PX = TOAST_WIDTH_PX - TEXT_X_PX - CLOSE_HIT_SIZE_PX;
const LABEL_Y_PX = 16;
const NAME_Y_PX = 40;
const LABEL_TYPE = {
  sizePx: 18,
  weight: 500,
} as const;
const NAME_TYPE = {
  sizePx: 26,
  weight: 700,
} as const;
const VISIBLE_MS = 4000;
const ENTER_MS = 250;
const EXIT_MS = 300;
const ENTER_RISE_PX = 24;
const LEFT_X_PX = GAME_WIDTH - EDGE_INSET_PX - TOAST_WIDTH_PX;
const BOTTOM_SLOT_Y_PX = GAME_HEIGHT - EDGE_INSET_PX - TOAST_HEIGHT_PX;

/** 결과 화면 오른쪽 아래에 새 알림을 맨 아래로 쌓아 보이고, 자리가 없으면 순서대로 기다리게 한다. */
export class AchievementToasts {
  private readonly waiting: AchievementNotice[] = [];
  private readonly toasts: Toast[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly label: string,
  ) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.waiting.length = 0;
      this.toasts.forEach(({ container, exitTimer }) => {
        exitTimer?.remove();
        scene.tweens.killTweensOf(container);
        container.destroy();
      });
      this.toasts.length = 0;
    });
  }

  show(notices: readonly AchievementNotice[]): void {
    this.waiting.push(...notices);
    this.admitWaiting();
  }

  private admitWaiting(): void {
    while (this.toasts.length < MAX_VISIBLE) {
      const notice = this.waiting.shift();
      if (notice === undefined) {
        return;
      }
      this.enter(notice);
    }
  }

  private enter(notice: AchievementNotice): void {
    const { scene } = this;
    const card = scene.add
      .rectangle(0, 0, TOAST_WIDTH_PX, TOAST_HEIGHT_PX, CARD_PANEL.fillColor, CARD_PANEL.fillAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(CARD_PANEL.borderPx, CARD_PANEL.borderColor, CARD_PANEL.borderAlpha)
      .setRounded(RADIUS.mediumPx);
    const emblem = scene.add
      .image(
        EMBLEM_INSET_PX,
        EMBLEM_INSET_PX,
        getAchievementEmblemTexture(scene, notice.id, EMBLEM_SIZE_PX),
      )
      .setOrigin(0, 0);
    const label = setFittedText(
      scene.add.text(TEXT_X_PX, LABEL_Y_PX, '', typeStyle(LABEL_TYPE, COLORS.textSecondary)),
      this.label,
      LABEL_MAX_WIDTH_PX,
    );
    const name = setFittedText(
      scene.add.text(TEXT_X_PX, NAME_Y_PX, '', typeStyle(NAME_TYPE, COLORS.textPrimary)),
      notice.name,
      TEXT_MAX_WIDTH_PX,
    );
    const closeIcon = scene.add
      .image(
        TOAST_WIDTH_PX - CLOSE_HIT_SIZE_PX / 2,
        CLOSE_HIT_SIZE_PX / 2,
        getCloseIconTexture(scene, CLOSE_ICON_SIZE_PX),
      )
      .setTint(COLORS.textMuted);
    const closeHit = scene.add
      .zone(TOAST_WIDTH_PX - CLOSE_HIT_SIZE_PX, 0, CLOSE_HIT_SIZE_PX, CLOSE_HIT_SIZE_PX)
      .setOrigin(0, 0);
    const container = scene.add
      .container(LEFT_X_PX, BOTTOM_SLOT_Y_PX + ENTER_RISE_PX, [
        card,
        emblem,
        label,
        name,
        closeIcon,
        closeHit,
      ])
      .setAlpha(0);
    const toast: Toast = {
      container,
      slideTween: null,
      exitTimer: null,
    };
    bindHoverTarget(closeHit, {
      onOver: () => closeIcon.clearTint(),
      onOut: () => closeIcon.setTint(COLORS.textMuted),
      onActivate: () => {
        // 타이머가 없으면 이미 사라지는 중이라 두 번 내보내지 않는다.
        if (toast.exitTimer === null) {
          return;
        }
        toast.exitTimer.remove();
        this.exit(toast);
      },
    });
    this.toasts.push(toast);
    this.layout();
    scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: ENTER_MS,
    });
    toast.exitTimer = scene.time.delayedCall(VISIBLE_MS, () => this.exit(toast));
  }

  /** 새 알림이 맨 아래 자리이고 먼저 온 알림일수록 위 자리다. */
  private layout(): void {
    this.toasts.forEach((toast, index) => {
      const slot = this.toasts.length - 1 - index;
      const yPx = BOTTOM_SLOT_Y_PX - slot * (TOAST_HEIGHT_PX + STACK_GAP_PX);
      if (toast.container.y === yPx) {
        return;
      }
      toast.slideTween?.stop();
      toast.slideTween = this.scene.tweens.add({
        targets: toast.container,
        y: yPx,
        duration: ENTER_MS,
        ease: 'Cubic.Out',
      });
    });
  }

  private exit(toast: Toast): void {
    toast.exitTimer = null;
    this.scene.tweens.add({
      targets: toast.container,
      alpha: 0,
      duration: EXIT_MS,
      onComplete: () => {
        toast.slideTween?.stop();
        toast.container.destroy();
        this.toasts.splice(this.toasts.indexOf(toast), 1);
        this.admitWaiting();
      },
    });
  }
}
