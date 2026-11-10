import Phaser from 'phaser';
import type { AchievementCatalog } from '../../../data/achievements.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../app/config.js';
import type {
  CelestialCatalog,
  CelestialStaticId,
} from '../../celestial/state/celestialCatalog.js';
import { addCelestialSprite } from '../../celestial/view/celestialSprites.js';
import { getAchievementEmblemTexture } from '../../ui/view/widgets/achievementEmblem.js';
import { getCloseIconTexture } from '../../ui/view/widgets/closeIcon.js';
import { setFittedText } from '../../ui/view/widgets/fitText.js';
import { TopRankBadge } from '../../ui/view/widgets/TopRankBadge.js';
import { bindHoverTarget } from '../../ui/view/input/hoverTarget.js';
import { CARD_PANEL, COLORS, RADIUS, typeStyle } from '../../ui/view/theme.js';
import { requireDefined } from '../../../invariant.js';
import type { ShownToast, ToastChanges, ToastContent } from '../state/resultState.js';
import { addBrushRect } from '../../ui/view/textures/brushRect.js';

export interface ToastPresentation {
  readonly label: string;
  readonly name: string;
  readonly difficulty: string | null;
}

interface ToastView {
  readonly container: Phaser.GameObjects.Container;
  readonly closeIcon: Phaser.GameObjects.Image;
}

interface ToastOptions {
  readonly scene: Phaser.Scene;
  readonly catalog: AchievementCatalog;
  readonly celestial: CelestialCatalog;
  readonly onClose: (id: number) => void;
  readonly onHover: (id: number) => void;
  readonly onUnhover: (id: number) => void;
  readonly onExpire: (id: number) => void;
  readonly onRemoved: (id: number) => void;
}

const TOAST_MIN_WIDTH_PX = 440;
const TOAST_MAX_WIDTH_PX = 640;
const TOAST_HEIGHT_PX = 88;
const EDGE_INSET_PX = 32;
const STACK_GAP_PX = 12;
const EMBLEM_SIZE_PX = 64;
const EMBLEM_INSET_PX = (TOAST_HEIGHT_PX - EMBLEM_SIZE_PX) / 2;
const TEXT_X_PX = EMBLEM_INSET_PX + EMBLEM_SIZE_PX + 16;
const TEXT_RIGHT_PADDING_PX = 32;
const RANK_LEFT_X_PX = 20;
const RANK_TEXT_GAP_PX = 20;
const CLOSE_HIT_SIZE_PX = 40;
const CLOSE_ICON_SIZE_PX = 24;
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
// 난이도가 붙은 이름은 이 크기까지 글자를 줄이고, 그래도 넘치면 곡 제목만 줄임표로 자른다.
const RANKED_NAME_MIN_SIZE_PX = 16;
const RANKED_NAME_GAP_PX = 10;
const RANK_NUMBER_SIZE_PX = 40;
const PENDING_MOTE_SIZE_PX = 44;
/** 씬 preload 목록에 넣어 텍스처를 미리 받는다. */
export const PENDING_MOTE_ID: CelestialStaticId = 'R08';
const VISIBLE_MS = 4000;
const ENTER_MS = 250;
const EXIT_MS = 300;
const ENTER_RISE_PX = 24;
const BOTTOM_SLOT_Y_PX = GAME_HEIGHT - EDGE_INSET_PX - TOAST_HEIGHT_PX;

/** 결과 화면 오른쪽 아래에 대기열이 정한 칸으로 알림을 들이고 옮기고 내보낸다. */
export class AchievementToasts {
  private readonly views = new Map<number, ToastView>();

  constructor(private readonly options: ToastOptions) {
    options.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.views.clear());
  }

  apply(changes: ToastChanges, presentOf: (content: ToastContent) => ToastPresentation): void {
    changes.entered.forEach((toast) => this.enter(toast, presentOf(toast.content)));
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

  private enter(toast: ShownToast, presentation: ToastPresentation): void {
    const { scene, onClose, onHover, onUnhover, onExpire } = this.options;
    const { id } = toast;
    const { objects: slotObjects, textXPx } = this.addSlot(toast.content);
    const nameTexts = this.addName(presentation, textXPx);
    const widthPx = Math.max(
      TOAST_MIN_WIDTH_PX,
      ...nameTexts.map((text) => text.x + text.width + TEXT_RIGHT_PADDING_PX),
    );
    const card = addBrushRect(scene, {
      widthPx,
      heightPx: TOAST_HEIGHT_PX,
      radiusPx: RADIUS.mediumPx,
      fillColor: CARD_PANEL.fillColor,
      fillAlpha: CARD_PANEL.fillAlpha,
      border: {
        color: CARD_PANEL.borderColor,
        alpha: CARD_PANEL.borderAlpha,
        widthPx: CARD_PANEL.borderPx,
      },
    }).setOrigin(0, 0);
    const label = setFittedText(
      scene.add.text(textXPx, LABEL_Y_PX, '', typeStyle(LABEL_TYPE, COLORS.textSecondary)),
      presentation.label,
      // 첫 줄 라벨이 닫기 버튼 아래로 들어가지 않게 그만큼 줄인다.
      widthPx - textXPx - CLOSE_HIT_SIZE_PX,
    );
    const closeIcon = scene.add
      .image(
        widthPx - CLOSE_HIT_SIZE_PX / 2,
        CLOSE_HIT_SIZE_PX / 2,
        getCloseIconTexture(scene, CLOSE_ICON_SIZE_PX),
      )
      .setTint(COLORS.textMuted);
    const closeHit = scene.add
      .zone(widthPx - CLOSE_HIT_SIZE_PX, 0, CLOSE_HIT_SIZE_PX, CLOSE_HIT_SIZE_PX)
      .setOrigin(0, 0);
    const container = scene.add
      .container(GAME_WIDTH - EDGE_INSET_PX - widthPx, BOTTOM_SLOT_Y_PX + ENTER_RISE_PX, [
        card,
        ...slotObjects,
        label,
        ...nameTexts,
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

  private addSlot(content: ToastContent): {
    readonly objects: readonly Phaser.GameObjects.GameObject[];
    readonly textXPx: number;
  } {
    const { scene, catalog, celestial } = this.options;
    const centerPx = EMBLEM_INSET_PX + EMBLEM_SIZE_PX / 2;
    switch (content.kind) {
      case 'achievement':
        return {
          objects: [
            scene.add
              .image(
                EMBLEM_INSET_PX,
                EMBLEM_INSET_PX,
                getAchievementEmblemTexture(scene, catalog, content.achievement, EMBLEM_SIZE_PX),
              )
              .setOrigin(0, 0),
          ],
          textXPx: TEXT_X_PX,
        };
      case 'ranking': {
        const badge = new TopRankBadge(scene, celestial, {
          xPx: RANK_LEFT_X_PX,
          yPx: TOAST_HEIGHT_PX / 2,
          align: 'left',
          hasWord: true,
          numberSizePx: RANK_NUMBER_SIZE_PX,
        });
        badge.render(content.rank);
        return {
          objects: badge.objects,
          textXPx: badge.getRightXPx() + RANK_TEXT_GAP_PX,
        };
      }
      case 'rankingPending':
        return {
          objects: [
            addCelestialSprite(
              scene,
              celestial.atlasPresentations[PENDING_MOTE_ID],
              centerPx,
              centerPx,
            ).setDisplaySize(PENDING_MOTE_SIZE_PX, PENDING_MOTE_SIZE_PX),
          ],
          textXPx: TEXT_X_PX,
        };
    }
  }

  /** 난이도가 붙으면 이름과 난이도의 글자를 같은 크기로 줄여 한 줄에 맞추고, 난이도는 자르지 않는다. */
  private addName(
    { name, difficulty }: ToastPresentation,
    textXPx: number,
  ): readonly Phaser.GameObjects.Text[] {
    const { scene } = this.options;
    const maxWidthPx = TOAST_MAX_WIDTH_PX - textXPx - TEXT_RIGHT_PADDING_PX;
    const nameText = scene.add.text(
      textXPx,
      NAME_Y_PX,
      '',
      typeStyle(NAME_TYPE, COLORS.textPrimary),
    );
    if (difficulty === null) {
      return [setFittedText(nameText, name, maxWidthPx)];
    }
    nameText.setText(name);
    const difficultyText = scene.add.text(
      0,
      NAME_Y_PX,
      difficulty,
      typeStyle(NAME_TYPE, COLORS.textPrimary),
    );
    const texts = [nameText, difficultyText];
    const tailWidthPx = () => RANKED_NAME_GAP_PX + difficultyText.width;
    let sizePx: number = NAME_TYPE.sizePx;
    while (nameText.width + tailWidthPx() > maxWidthPx && sizePx > RANKED_NAME_MIN_SIZE_PX) {
      sizePx -= 1;
      texts.forEach((text) => text.setFontSize(sizePx));
    }
    setFittedText(nameText, name, maxWidthPx - tailWidthPx());
    difficultyText.setX(textXPx + nameText.width + RANKED_NAME_GAP_PX);
    return texts;
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
