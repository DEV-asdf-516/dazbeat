import type Phaser from 'phaser';
import { addBrushRect, getBrushRectTexture } from '../textures/brushRect.js';
import type { AchievementCatalog } from '../../../../data/achievements.js';
import type { AccountIdentity, AccountPanelButton } from '../../state/accountIdentity.js';
import type { ButtonAppearance, ButtonView } from '../../state/buttonPointer.js';
import { pointButton } from '../input/hoverTarget.js';
import type { ButtonPointer, PointerActions } from '../input/hoverTarget.js';
import { rgba } from '../textures/lightTextures.js';
import {
  CARD_PANEL,
  CELESTIAL_COLORS,
  COLORS,
  RADIUS,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  typeStyle,
} from '../theme.js';
import { getAchievementEmblemTexture } from './achievementEmblem.js';
import { Button, QUIET_PADDING_PX } from './Button.js';
import { addCometUnderline } from './cometUnderline.js';
import { setFittedText } from './fitText.js';
import { getSignOutIconTexture } from './signOutIcon.js';

/** 로그인 상태 문구는 배경 그림 위에 그대로 두면 떠 보이므로 반투명 카드 위에 얹는다. */
export const ACCOUNT_CARD_PADDING_X_PX = 20;
export const ACCOUNT_CARD_PADDING_Y_PX = 10;
// 왼쪽 내용과 좌우 여백을 맞추고, 화면 제목과 같은 줄에 둔다.
const IDENTITY_RIGHT_X_PX = SCREEN_LAYOUT.rightXPx;
export const IDENTITY_CENTER_Y_PX = 120;
export const ACCOUNT_RIGHT_X_PX = IDENTITY_RIGHT_X_PX - ACCOUNT_CARD_PADDING_X_PX;
// 버튼 안쪽 여백을 빼고 아이콘 끝이 여백에 닿게 한다.
export const ACCOUNT_BUTTON_RIGHT_X_PX = IDENTITY_RIGHT_X_PX + QUIET_PADDING_PX.xPx;
const IDENTITY_EMBLEM_SIZE_PX = 44;
const IDENTITY_EMBLEM_GAP_PX = 12;
const IDENTITY_NAME_TYPE = {
  sizePx: 22,
  weight: 400,
} as const;
const IDENTITY_TEXT_MAX_WIDTH_PX = 280;
// 판 없이 배경 그림 위에 바로 올리므로 밝은 성운 위에서도 읽히게 그림자를 깐다.
const IDENTITY_TEXT_SHADOW_COLOR = rgba(CELESTIAL_COLORS.background, 0.85);
const IDENTITY_TEXT_SHADOW_BLUR_PX = 10;
const UNDERLINE_SHOWN: Record<ButtonAppearance, boolean> = {
  disabled: false,
  idle: false,
  focused: true,
  hovered: true,
  pressed: true,
};
const UNDERLINE_GAP_PX = 6;
const UNDERLINE_INSET_PX = 12;
const UNDERLINE_OVERHANG_PX = 24;
const UNDERLINE_LOOK = {
  tailThicknessPx: 1,
  headThicknessPx: 6,
  tailAlpha: 0.2,
  headAlpha: 1,
} as const;
const CARD_ICON_SIZE_PX = 32;
const CARD_ICON_GAP_PX = 20;
const CARD_DIVIDER_HEIGHT_PX = 36;
const CARD_DIVIDER_ALPHA = 0.7;
const CARD_NAME_EMAIL_GAP_PX = 2;
/** 한 단계 줄여 이름보다 앞서지 않게 한다. */
const CARD_EMAIL_TYPE = {
  sizePx: 16,
  weight: 400,
} as const;

export function addAccountCard(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setVisible(false);
}

export function fitAccountCard(
  card: Phaser.GameObjects.Image,
  cardLeftXPx: number,
  contentTopYPx: number,
  contentBottomYPx: number,
): void {
  card
    .setPosition(cardLeftXPx, contentTopYPx - ACCOUNT_CARD_PADDING_Y_PX)
    .setTexture(
      getBrushRectTexture(card.scene, {
        widthPx: ACCOUNT_RIGHT_X_PX + ACCOUNT_CARD_PADDING_X_PX - cardLeftXPx,
        heightPx: contentBottomYPx - contentTopYPx + ACCOUNT_CARD_PADDING_Y_PX * 2,
        radiusPx: RADIUS.mediumPx,
        fillColor: CARD_PANEL.fillColor,
        fillAlpha: CARD_PANEL.fillAlpha,
        border: {
          color: CARD_PANEL.borderColor,
          alpha: CARD_PANEL.borderAlpha,
          widthPx: CARD_PANEL.borderPx,
        },
      }),
    )
    .setVisible(true);
}

/** 계정 동작은 메뉴보다 한 단계 작은 글자로 두어 PLAY 등 주 메뉴와 경쟁하지 않게 한다. */
export function addAccountActionButton(scene: Phaser.Scene, pointer: PointerActions): Button {
  return new Button(scene, 0, 0, {
    variant: 'quiet',
    focus: 'slide',
    label: '',
    radiusPx: RADIUS.mediumPx,
    labelType: TYPE_SCALE.secondary,
    pointer,
  });
}

function addIdentityText(
  scene: Phaser.Scene,
  type: { readonly sizePx: number; readonly weight: number },
  color: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, '', typeStyle(type, color))
    .setShadow(0, 1, IDENTITY_TEXT_SHADOW_COLOR, IDENTITY_TEXT_SHADOW_BLUR_PX, false, true);
}

class AccountIdentityLine {
  // 엠블럼 텍스처는 표시 크기로 그려지므로 기본 텍스처에 크기를 맞추지 않는다.
  private readonly emblem: Phaser.GameObjects.Image;
  private readonly name: Phaser.GameObjects.Text;
  private readonly email: Phaser.GameObjects.Text | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly catalog: AchievementCatalog,
    private readonly detail: 'emblem' | 'email',
  ) {
    this.emblem = scene.add
      .image(0, IDENTITY_CENTER_Y_PX, '__DEFAULT')
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.name = addIdentityText(scene, IDENTITY_NAME_TYPE, COLORS.textPrimary);
    this.email =
      detail === 'email' ? addIdentityText(scene, CARD_EMAIL_TYPE, COLORS.textSecondary) : null;
  }

  render(identity: AccountIdentity, rightXPx: number): number {
    const { emblem, name, email } = this;
    setFittedText(name, identity.nickname, IDENTITY_TEXT_MAX_WIDTH_PX).setVisible(true);
    let textWidthPx = name.width;
    let textHeightPx = name.height;
    if (email !== null) {
      setFittedText(email, identity.email, IDENTITY_TEXT_MAX_WIDTH_PX).setVisible(true);
      textWidthPx = Math.max(textWidthPx, email.width);
      textHeightPx += CARD_NAME_EMAIL_GAP_PX + email.height;
    }
    const textLeftXPx = rightXPx - textWidthPx;
    const textTopYPx = IDENTITY_CENTER_Y_PX - textHeightPx / 2;
    name.setPosition(textLeftXPx, textTopYPx);
    email?.setPosition(textLeftXPx, textTopYPx + name.height + CARD_NAME_EMAIL_GAP_PX);
    const featuredAchievement = this.detail === 'emblem' ? identity.featuredAchievement : null;
    if (featuredAchievement === null) {
      emblem.setVisible(false);
      return textLeftXPx;
    }
    const emblemLeftXPx = textLeftXPx - IDENTITY_EMBLEM_GAP_PX - IDENTITY_EMBLEM_SIZE_PX;
    emblem
      .setTexture(
        getAchievementEmblemTexture(
          this.scene,
          this.catalog,
          featuredAchievement,
          IDENTITY_EMBLEM_SIZE_PX,
        ),
      )
      .setX(emblemLeftXPx)
      .setVisible(true);
    return emblemLeftXPx;
  }

  hide(): void {
    this.emblem.setVisible(false);
    this.name.setVisible(false);
    this.email?.setVisible(false);
  }
}

export class AccountCard {
  private readonly line: AccountIdentityLine;
  private readonly divider: Phaser.GameObjects.Image;
  private readonly signOutButton: Button;

  constructor(
    private readonly scene: Phaser.Scene,
    catalog: AchievementCatalog,
    signOut: PointerActions,
  ) {
    this.line = new AccountIdentityLine(scene, catalog, 'email');
    this.divider = addBrushRect(scene, {
      widthPx: CARD_PANEL.borderPx,
      heightPx: CARD_DIVIDER_HEIGHT_PX,
      radiusPx: 0,
      fillColor: COLORS.textSecondary,
      fillAlpha: CARD_DIVIDER_ALPHA,
      border: null,
    }).setPosition(
      IDENTITY_RIGHT_X_PX - CARD_ICON_SIZE_PX - CARD_ICON_GAP_PX,
      IDENTITY_CENTER_Y_PX,
    );
    this.signOutButton = addAccountActionButton(scene, signOut);
  }

  render(identity: AccountIdentity | null): void {
    const { line, divider, signOutButton } = this;
    if (identity === null) {
      line.hide();
      divider.setVisible(false);
      signOutButton.setVisible(false);
      return;
    }
    divider.setVisible(true);
    signOutButton
      .setIcon(getSignOutIconTexture(this.scene, CARD_ICON_SIZE_PX), CARD_ICON_SIZE_PX)
      .alignX(ACCOUNT_BUTTON_RIGHT_X_PX, 1)
      .setVisible(true);
    signOutButton.setY(IDENTITY_CENTER_Y_PX - signOutButton.height / 2);
    line.render(identity, IDENTITY_RIGHT_X_PX - CARD_ICON_SIZE_PX - CARD_ICON_GAP_PX * 2);
  }

  renderButton(view: ButtonView): void {
    this.signOutButton.render(view);
  }
}

export class AccountNameplate {
  private readonly line: AccountIdentityLine;
  private readonly button: Button;
  private readonly underline: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, catalog: AchievementCatalog, pointer: PointerActions) {
    this.line = new AccountIdentityLine(scene, catalog, 'emblem');
    this.underline = addCometUnderline(scene, UNDERLINE_LOOK)
      .setTint(CELESTIAL_COLORS.textSecondary)
      .setVisible(false);
    // 밑줄은 버튼에 붙여 버튼이 숨을 때 함께 숨는다.
    this.button = new Button(scene, 0, IDENTITY_CENTER_Y_PX - IDENTITY_EMBLEM_SIZE_PX / 2, {
      variant: 'quiet',
      focus: 'slide',
      label: '',
      pointer,
    });
    this.button.add(this.underline);
  }

  render(identity: AccountIdentity | null): void {
    const { line, button, underline } = this;
    if (identity === null) {
      line.hide();
      button.setVisible(false);
      return;
    }
    const leftXPx = line.render(identity, IDENTITY_RIGHT_X_PX);
    const widthPx = IDENTITY_RIGHT_X_PX - leftXPx;
    button.setFixedSize(widthPx, IDENTITY_EMBLEM_SIZE_PX).setX(leftXPx).setVisible(true);
    underline
      .setPosition(UNDERLINE_INSET_PX, IDENTITY_EMBLEM_SIZE_PX + UNDERLINE_GAP_PX)
      .setDisplaySize(widthPx + UNDERLINE_OVERHANG_PX - UNDERLINE_INSET_PX, underline.height);
  }

  renderButton(view: ButtonView): void {
    this.underline.setVisible(UNDERLINE_SHOWN[view.appearance]);
    this.button.render(view);
  }
}

export type AccountPanelOptions =
  | {
      readonly kind: 'nameplate';
      readonly catalog: AchievementCatalog;
      readonly pointer: ButtonPointer<AccountPanelButton>;
    }
  | {
      readonly kind: 'card';
      readonly catalog: AchievementCatalog;
      readonly pointer: ButtonPointer<'accountSignOut'>;
    };

export function addAccountPanel(
  scene: Phaser.Scene,
  options: AccountPanelOptions,
): AccountNameplate | AccountCard {
  switch (options.kind) {
    case 'nameplate':
      return new AccountNameplate(
        scene,
        options.catalog,
        pointButton(options.pointer, 'accountProfile'),
      );
    case 'card':
      return new AccountCard(
        scene,
        options.catalog,
        pointButton(options.pointer, 'accountSignOut'),
      );
  }
}
