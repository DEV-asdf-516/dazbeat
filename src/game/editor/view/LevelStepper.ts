import type Phaser from 'phaser';
import type { ChartLevel } from '../../../data/songs.js';
import type { ButtonView } from '../../ui/state/buttonPointer.js';
import type { PointerActions } from '../../ui/view/input/hoverTarget.js';
import { addBakedRoundedRect } from '../../ui/view/textures/bakedTexture.js';
import { CELESTIAL_COLORS, RADIUS } from '../../ui/view/theme.js';
import { TextInput } from '../../ui/view/widgets/TextInput.js';
import { EDITOR_ICON_HIT_SIZE_PX, EditorIconButton } from './EditorIconButton.js';
import { EDITOR_TYPE_SCALE } from './editorTheme.js';
import { SEGMENTED_CONTROL_HEIGHT_PX } from './SegmentedControl.js';

// 레인 수 칸과 같은 트랙 안에 값 칸을 띄워 같은 묶음으로 읽히게 한다.
const TRACK_INSET_PX = 4;
const VALUE_TEXT_INSET_PX = 12;
// "4.5" 보다 긴 글자는 값 집합에 없다.
const INPUT_MAX_LENGTH = 4;
const INPUT_TYPE = {
  sizePx: EDITOR_TYPE_SCALE.control.sizePx,
  weight: 600,
} as const;
const EMPTY_LEVEL_TEXT = '—';

export interface LevelStepperActions {
  readonly down: PointerActions;
  readonly up: PointerActions;
  /** 입력칸에서 포커스가 빠질 때 그때의 글자로 확정한다. */
  readonly onCommit: (text: string) => void;
}

function formatLevel(level: ChartLevel | null): string {
  return level === null ? '' : String(level);
}

export class LevelStepper {
  private readonly down: EditorIconButton;
  private readonly up: EditorIconButton;
  private readonly input: TextInput;

  constructor(
    scene: Phaser.Scene,
    frame: { leftPx: number; topYPx: number; widthPx: number },
    actions: LevelStepperActions,
  ) {
    const { leftPx, topYPx, widthPx } = frame;
    const centerYPx = topYPx + SEGMENTED_CONTROL_HEIGHT_PX / 2;
    addBakedRoundedRect(scene, leftPx, topYPx, {
      widthPx,
      heightPx: SEGMENTED_CONTROL_HEIGHT_PX,
      radiusPx: RADIUS.mediumPx,
      fillColor: CELESTIAL_COLORS.background,
      fillAlpha: 1,
      border: null,
    }).setOrigin(0, 0);
    const valueLeftPx = leftPx + EDITOR_ICON_HIT_SIZE_PX;
    const valueWidthPx = widthPx - EDITOR_ICON_HIT_SIZE_PX * 2;
    const valueHeightPx = SEGMENTED_CONTROL_HEIGHT_PX - TRACK_INSET_PX * 2;
    addBakedRoundedRect(scene, valueLeftPx, topYPx + TRACK_INSET_PX, {
      widthPx: valueWidthPx,
      heightPx: valueHeightPx,
      radiusPx: RADIUS.smallPx,
      fillColor: CELESTIAL_COLORS.surfaceHover,
      fillAlpha: 1,
      border: null,
    }).setOrigin(0, 0);
    this.down = new EditorIconButton(
      scene,
      leftPx + EDITOR_ICON_HIT_SIZE_PX / 2,
      centerYPx,
      'previous',
      actions.down,
    );
    this.up = new EditorIconButton(
      scene,
      leftPx + widthPx - EDITOR_ICON_HIT_SIZE_PX / 2,
      centerYPx,
      'next',
      actions.up,
    );
    this.input = new TextInput(
      scene,
      {
        leftPx: valueLeftPx + VALUE_TEXT_INSET_PX,
        topYPx: topYPx + TRACK_INSET_PX,
        widthPx: valueWidthPx - VALUE_TEXT_INSET_PX * 2,
        heightPx: valueHeightPx,
      },
      {
        label: EMPTY_LEVEL_TEXT,
        maxLength: INPUT_MAX_LENGTH,
        type: INPUT_TYPE,
        enterKeyHint: 'done',
        isBare: true,
        align: 'center',
      },
    );
    this.input.onBlur(() => actions.onCommit(this.input.text));
  }

  get isInputFocused(): boolean {
    return this.input.isFocused;
  }

  render(view: {
    readonly level: ChartLevel | null;
    readonly isEnabled: boolean;
    readonly down: ButtonView;
    readonly up: ButtonView;
  }): void {
    this.down.render(view.down, 'previous');
    this.up.render(view.up, 'next');
    this.input.setEnabled(view.isEnabled);
    // 쓰는 중인 글자를 지우지 않는다.
    if (!this.input.isFocused) {
      this.input.setText(formatLevel(view.level));
    }
  }

  /** 글자만 맞춘다. 확정은 blur 리스너 한 곳이라 여기서 blur 하면 확정이 확정을 부른다. */
  syncInput(level: ChartLevel | null): void {
    this.input.setText(formatLevel(level));
  }

  blur(): void {
    this.input.blur();
  }
}
