import Phaser from 'phaser';
import type { AchievementCatalog, NamedAchievementDefinition } from '../../../data/achievements.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../app/config.js';
import { getAchievementEmblemTexture } from '../../ui/view/widgets/achievementEmblem.js';
import { getCloseIconTexture } from '../../ui/view/widgets/closeIcon.js';
import { setFittedText } from '../../ui/view/widgets/fitText.js';
import { bindHoverTarget } from '../../ui/view/input/hoverTarget.js';
import { CARD_PANEL, COLORS, RADIUS, typeStyle } from '../../ui/view/theme.js';
import { requireDefined } from '../../../invariant.js';
import type { ShownToast, ToastChanges } from '../state/resultState.js';

interface ToastView {
  readonly container: Phaser.GameObjects.Container;
  readonly closeIcon: Phaser.GameObjects.Image;
}

interface ToastOptions {
  readonly scene: Phaser.Scene;
  readonly catalog: AchievementCatalog;
  readonly label: string;
  readonly onClose: (id: number) => void;
  readonly onHover: (id: number) => void;
  readonly onUnhover: (id: number) => void;
  readonly onExpire: (id: number) => void;
  readonly onRemoved: (id: number) => void;
}

const TOAST_WIDTH_PX = 440;
const TOAST_HEIGHT_PX = 88;
const EDGE_INSET_PX = 32;
const STACK_GAP_PX = 12;
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

/** 결과 화면 오른쪽 아래에 대기열이 정한 칸으로 알림을 들이고 옮기고 내보낸다. */
export class AchievementToasts {
  private readonly views = new Map<number, ToastView>();

  constructor(private readonly options: ToastOptions) {
    options.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.views.clear());
  }

  apply(changes: ToastChanges, nameOf: (achievement: NamedAchievementDefinition) => string): void {
    changes.entered.forEach((toast) => this.enter(toast, nameOf(toast.achievement)));
    changes.moved.forEach(({ id, slot }) => this.slide(this.getView(id).container, slot));
    changes.leaving.forEach((id) => this.leave(id));
  }

  renderCloseHover(hoveredId: number | null): void {
    this.views.forEach(({ closeIcon }, id) => {
      if (id === hoveredId) {
        closeIcon.clearTint();
      } else {
        closeIcon.setTint(COLORS.textMuted);
      }
    });
  }

  private enter(toast: ShownToast, nameText: string): void {
    const { scene, catalog, onClose, onHover, onUnhover, onExpire } = this.options;
    const { id } = toast;
    const card = scene.add
      .rectangle(0, 0, TOAST_WIDTH_PX, TOAST_HEIGHT_PX, CARD_PANEL.fillColor, CARD_PANEL.fillAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(CARD_PANEL.borderPx, CARD_PANEL.borderColor, CARD_PANEL.borderAlpha)
      .setRounded(RADIUS.mediumPx);
    const emblem = scene.add
      .image(
        EMBLEM_INSET_PX,
        EMBLEM_INSET_PX,
        getAchievementEmblemTexture(scene, catalog, toast.achievement, EMBLEM_SIZE_PX),
      )
      .setOrigin(0, 0);
    const label = setFittedText(
      scene.add.text(TEXT_X_PX, LABEL_Y_PX, '', typeStyle(LABEL_TYPE, COLORS.textSecondary)),
      this.options.label,
      LABEL_MAX_WIDTH_PX,
    );
    const name = setFittedText(
      scene.add.text(TEXT_X_PX, NAME_Y_PX, '', typeStyle(NAME_TYPE, COLORS.textPrimary)),
      nameText,
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
    bindHoverTarget(closeHit, {
      onOver: () => onHover(id),
      onOut: () => onUnhover(id),
      onActivate: () => onClose(id),
    });
    this.views.set(id, {
      container,
      closeIcon,
    });
    this.slide(container, toast.slot);
    scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: ENTER_MS,
    });
    scene.time.delayedCall(VISIBLE_MS, () => onExpire(id));
  }

  private slide(container: Phaser.GameObjects.Container, slot: number): void {
    this.findSlideTween(container)?.stop();
    this.options.scene.tweens.add({
      targets: container,
      y: BOTTOM_SLOT_Y_PX - slot * (TOAST_HEIGHT_PX + STACK_GAP_PX),
      duration: ENTER_MS,
      ease: 'Cubic.Out',
    });
  }

  private leave(id: number): void {
    const { container } = this.getView(id);
    this.options.scene.tweens.add({
      targets: container,
      alpha: 0,
      duration: EXIT_MS,
      onComplete: () => {
        this.findSlideTween(container)?.stop();
        container.destroy();
        this.views.delete(id);
        this.options.onRemoved(id);
      },
    });
  }

  private findSlideTween(container: Phaser.GameObjects.Container): Phaser.Tweens.Tween | undefined {
    return this.options.scene.tweens
      .getTweensOf(container)
      .find((tween) =>
        tween.data.some((data) => data instanceof Phaser.Tweens.TweenData && data.key === 'y'),
      );
  }

  private getView(id: number): ToastView {
    return requireDefined(this.views.get(id), 'Missing achievement toast view', id);
  }
}
