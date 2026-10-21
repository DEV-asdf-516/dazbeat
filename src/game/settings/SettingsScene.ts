import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { SCENE_KEYS, exitScene } from '../sceneRoutes.js';
import type { SceneRequest, SettingsReturn, SettingsSceneData } from '../sceneRoutes.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import type { Language } from '../../i18n/language.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import { DEFAULT_SETTINGS } from '../../storage/settings.js';
import type { Settings } from '../../storage/settings.js';
import { canAdjust } from './settingsAdjust.js';
import type { SettingsRow } from './settingsAdjust.js';
import { formatRowValue, isChoiceRow } from './settingsRowView.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import {
  adjustRow,
  applyPointer,
  bindWaitingKey,
  createSettingsEditorState,
  focusRow,
  isWaitingKey,
  moveFocus,
  pressBack,
  startWaiting,
} from './settingsEditorState.js';
import type { SettingsEditorState } from './settingsEditorState.js';
import { Button } from '../ui/Button.js';
import { createCanvasTexture } from '../ui/canvasTexture.js';
import { createHeaderAuxiliaryButton } from '../ui/auxiliaryButton.js';
import {
  addCelestialAtmosphere,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import { addCelestialSprite, queueCelestialTextures } from '../celestial/celestialSprites.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { addMenuKeyHintRow } from '../ui/keyHintView.js';
import { PointerHover } from '../ui/PointerHover.js';
import { COLORS, SCREEN_LAYOUT, setTextColor, textStyle } from '../ui/theme.js';
import { readKeyCapture } from './keyCapture.js';
import { requireDefined } from '../../invariant.js';

type SettingsGroup = 'audio' | 'input' | 'general';

const ROWS: readonly (SettingsRow & { yPx: number })[] = [
  {
    kind: 'volume',
    field: 'masterVolume',
    yPx: 224,
  },
  {
    kind: 'volume',
    field: 'musicVolume',
    yPx: 280,
  },
  {
    kind: 'volume',
    field: 'effectVolume',
    yPx: 336,
  },
  {
    kind: 'inputOffset',
    yPx: 452,
  },
  {
    kind: 'key',
    lane: 0,
    yPx: 508,
  },
  {
    kind: 'key',
    lane: 1,
    yPx: 564,
  },
  {
    kind: 'key',
    lane: 2,
    yPx: 620,
  },
  {
    kind: 'key',
    lane: 3,
    yPx: 676,
  },
  {
    kind: 'scrollSpeed',
    yPx: 792,
  },
  {
    kind: 'mvMode',
    yPx: 848,
  },
  {
    kind: 'language',
    yPx: 904,
  },
];
const GROUPS: readonly { group: SettingsGroup; yPx: number }[] = [
  {
    group: 'audio',
    yPx: 184,
  },
  {
    group: 'input',
    yPx: 412,
  },
  {
    group: 'general',
    yPx: 752,
  },
];
const GROUP_TITLE_WEIGHT = 700;
const ROW_HEIGHT_PX = 56;
const ROW_HIT_WIDTH_PX = 580;
const LABEL_X_PX = 184;
const CONTROL_OFFSET_Y_PX = 4;
const STEP_SIZE_PX = 48;
const STEP_GAP_PX = 12;
const VALUE_WIDTH_PX = 160;
const DECREASE_X_PX = 760;
const VALUE_X_PX = DECREASE_X_PX + STEP_SIZE_PX + STEP_GAP_PX + VALUE_WIDTH_PX / 2;
const INCREASE_X_PX = VALUE_X_PX + VALUE_WIDTH_PX / 2 + STEP_GAP_PX;
const CONTROL_RIGHT_X_PX = INCREASE_X_PX + STEP_SIZE_PX;
const KEY_BOX_WIDTH_PX = 120;
const KEY_BOX_X_PX = CONTROL_RIGHT_X_PX - KEY_BOX_WIDTH_PX;
const KEY_BOX_HEIGHT_PX = 48;
const CHEVRON_SIZE_PX = 16;
// 텍스처는 2배로 그려 축소 표시해 선 끝이 매끄럽게 보이게 한다.
const CHEVRON_TEXTURE_SCALE = 2;
// 'primary' 글자의 '−'·'+' 획 두께에 맞춘다.
const CHEVRON_STROKE_PX = 3;
const FOCUS_STAR_ID = 'R49';
const FOCUS_STAR_GAP_PX = 24;
// 행이 화면 아래까지 차 있어 다른 메뉴 씬의 힌트 위치보다 조금 내린다.
const HINT_Y_PX = 984;

interface StepControl {
  button: Button;
  direction: 1 | -1;
}

type RowControl =
  | { kind: 'key'; keyBox: Button }
  | { kind: 'step'; value: Phaser.GameObjects.Text; steps: readonly StepControl[] };

interface RowView {
  row: SettingsRow;
  index: number;
  label: Phaser.GameObjects.Text;
  control: RowControl;
}

interface SettingsView {
  title: Phaser.GameObjects.Text;
  groups: readonly { group: SettingsGroup; text: Phaser.GameObjects.Text }[];
  rows: readonly RowView[];
  waitingText: Phaser.GameObjects.Text;
  keyHint: { text: string; row: Phaser.GameObjects.Container };
  rowHover: PointerHover<number>;
  focusStar: Phaser.GameObjects.Sprite;
}

type Transition = (state: SettingsEditorState) => SettingsEditorState;

export class SettingsScene extends Phaser.Scene {
  private returnTo: SettingsReturn = {
    key: 'main',
    data: undefined,
  };
  private editor = createSettingsEditorState(ROWS, DEFAULT_SETTINGS);
  private exit: SceneExit<SceneRequest> = STAYING;

  /** 언어는 이 씬만 바꾸므로 i18n 이 언어를 바꾼 뒤 함께 갱신해 i18n 의 언어 문자열을 다시 해석하지 않는다. */
  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private displayedLanguage: Language,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.settings);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial);
  }

  create(data: SettingsSceneData): void {
    this.exit = STAYING;
    addCelestialAtmosphere(this, this.celestial, 'secondary');
    const keyboard = requireKeyboard(this);
    this.returnTo = data.returnTo;
    this.editor = createSettingsEditorState(ROWS, this.save.loadSettings());

    const rowHover = new PointerHover<number>((index) => {
      this.renderLabelColor(
        requireDefined(view.rows[index], 'Invalid settings row index', index),
        rowHover,
      );
    });
    const update = (transition: Transition): void => this.applyTransition(view, transition);
    const onPointer = (transition: Transition): void =>
      update((state) => applyPointer(state, transition));

    const view: SettingsView = {
      title: this.add.text(
        SCREEN_LAYOUT.leftXPx,
        SCREEN_LAYOUT.headerYPx,
        '',
        textStyle('heading', COLORS.textPrimary),
      ),
      groups: GROUPS.map(({ group, yPx }) => ({
        group,
        text: this.add.text(
          SCREEN_LAYOUT.leftXPx,
          yPx,
          '',
          textStyle('secondary', COLORS.textSecondary, GROUP_TITLE_WEIGHT),
        ),
      })),
      rows: ROWS.map((row, index) => this.createRow(row, index, rowHover, onPointer)),
      waitingText: this.add.text(
        SCREEN_LAYOUT.leftXPx,
        HINT_Y_PX,
        '',
        textStyle('meta', COLORS.textSecondary),
      ),
      keyHint: this.createKeyHint(this.i18n.t('settings.hint')),
      rowHover,
      focusStar: addCelestialSprite(
        this,
        this.celestial.atlasPresentations[FOCUS_STAR_ID],
        SCREEN_LAYOUT.leftXPx - FOCUS_STAR_GAP_PX,
        0,
      ),
    };
    createHeaderAuxiliaryButton(this, {
      label: 'BACK',
      onActivate: () => this.pressBack(update),
    });
    this.render(view);
    playCelestialEntryTransition(this, this.celestial, view.title.getBounds());
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, update)),
    );
  }

  private createRow(
    row: SettingsRow & { yPx: number },
    index: number,
    rowHover: PointerHover<number>,
    onPointer: (transition: Transition) => void,
  ): RowView {
    const centerYPx = getRowCenterYPx(index);
    const controlYPx = row.yPx + CONTROL_OFFSET_Y_PX;
    const hitArea = this.add
      .rectangle(SCREEN_LAYOUT.leftXPx, row.yPx, ROW_HIT_WIDTH_PX, ROW_HEIGHT_PX)
      .setOrigin(0, 0);
    rowHover.bind(hitArea, index, () => onPointer((state) => focusRow(state, index)));
    const label = this.add
      .text(LABEL_X_PX, centerYPx, '', textStyle('primary', COLORS.textSecondary))
      .setOrigin(0, 0.5);

    if (row.kind === 'key') {
      const keyBox = new Button(this, KEY_BOX_X_PX, controlYPx, {
        variant: 'secondary',
        focus: 'glow',
        label: '',
        widthPx: KEY_BOX_WIDTH_PX,
        heightPx: KEY_BOX_HEIGHT_PX,
        onActivate: () => onPointer((state) => startWaiting(state, index)),
      });
      return {
        row,
        index,
        label,
        control: {
          kind: 'key',
          keyBox,
        },
      };
    }
    const isChoice = isChoiceRow(row);
    const createStep = (xPx: number, buttonLabel: string, direction: 1 | -1): StepControl => {
      const button = new Button(this, xPx, controlYPx, {
        variant: 'secondary',
        focus: 'glow',
        label: buttonLabel,
        widthPx: STEP_SIZE_PX,
        heightPx: STEP_SIZE_PX,
        onActivate: () =>
          onPointer((state) => adjustRow(state, index, direction, this.displayedLanguage)),
      });
      if (isChoice) {
        button.setIcon(ensureChevronTexture(this, direction), CHEVRON_SIZE_PX);
      }
      return {
        button,
        direction,
      };
    };
    const value = this.add
      .text(VALUE_X_PX, centerYPx, '', textStyle('primary', COLORS.textPrimary))
      .setOrigin(0.5);
    return {
      row,
      index,
      label,
      control: {
        kind: 'step',
        value,
        steps: [createStep(DECREASE_X_PX, '−', -1), createStep(INCREASE_X_PX, '+', 1)],
      },
    };
  }

  private handleKey(event: KeyboardEvent, update: (transition: Transition) => void): void {
    if (this.exit.kind === 'leaving') {
      return;
    }
    if (isWaitingKey(this.editor)) {
      const code = readKeyCapture(event);
      if (code !== null) {
        update((state) => bindWaitingKey(state, code));
      }
      return;
    }
    switch (readMenuAction(event)) {
      case 'up':
        update((state) => moveFocus(state, -1));
        return;
      case 'down':
        update((state) => moveFocus(state, 1));
        return;
      case 'left':
        update((state) => adjustRow(state, state.rowIndex, -1, this.displayedLanguage));
        return;
      case 'right':
        update((state) => adjustRow(state, state.rowIndex, 1, this.displayedLanguage));
        return;
      case 'confirm':
        update((state) => startWaiting(state, state.rowIndex));
        return;
      case 'back':
        this.pressBack(update);
        return;
      case null:
        return;
    }
  }

  private applyTransition(view: SettingsView, transition: Transition): void {
    const previous = this.editor;
    const next = transition(previous);
    if (next === previous) {
      return;
    }
    this.editor = next;
    if (next.settings !== previous.settings) {
      this.applySettings(view, next.settings);
    }
    this.render(view);
  }

  private pressBack(update: (transition: Transition) => void): void {
    const outcome = pressBack(this.editor);
    if (outcome.kind === 'stay') {
      update(() => outcome.state);
      return;
    }
    this.exit = exitScene(this, this.exit, this.returnTo);
  }

  private applySettings(view: SettingsView, settings: Settings): void {
    try {
      this.save.saveSettings(settings);
    } catch (error) {
      console.error('Failed to save settings', error);
    }
    const { language } = settings;
    if (language !== null && language !== this.displayedLanguage) {
      this.i18n.changeLanguage(language).then(
        () => {
          this.displayedLanguage = language;
          this.render(view);
        },
        (error: unknown) => console.error('Failed to change language', error),
      );
    }
  }

  private render(view: SettingsView): void {
    const { settings, waitingLane } = this.editor;
    const language = this.displayedLanguage;
    view.title.setText(this.i18n.t('settings.title'));
    view.focusStar.setY(getRowCenterYPx(this.editor.rowIndex));
    view.groups.forEach(({ group, text }) => text.setText(this.i18n.t(`settings.groups.${group}`)));
    view.rows.forEach((rowView) => {
      const { row, label, control } = rowView;
      label.setText(this.formatLabel(row));
      this.renderLabelColor(rowView, view.rowHover);
      const value = formatRowValue(row, settings, language, waitingLane);
      switch (control.kind) {
        case 'key':
          control.keyBox.setLabel(value);
          return;
        case 'step':
          control.value.setText(value);
          control.steps.forEach(({ button, direction }) => {
            button.setEnabled(canAdjust(settings, row, direction, language));
          });
          return;
      }
    });
    view.waitingText.setVisible(waitingLane !== null);
    if (waitingLane === null) {
      this.renderKeyHint(view, this.i18n.t('settings.hint'));
      return;
    }
    view.waitingText.setText(this.i18n.t('settings.waitingKey', { lane: waitingLane + 1 }));
    view.keyHint.row.setVisible(false);
  }

  private renderKeyHint(view: SettingsView, text: string): void {
    if (view.keyHint.text === text) {
      view.keyHint.row.setVisible(true);
      return;
    }
    view.keyHint.row.destroy();
    view.keyHint = this.createKeyHint(text);
  }

  private createKeyHint(text: string): SettingsView['keyHint'] {
    return {
      text,
      row: addMenuKeyHintRow(this, text, SCREEN_LAYOUT.leftXPx, HINT_Y_PX),
    };
  }

  private renderLabelColor(rowView: RowView, rowHover: PointerHover<number>): void {
    const isEmphasized =
      rowView.index === this.editor.rowIndex || rowHover.isHovered(rowView.index);
    setTextColor(rowView.label, isEmphasized ? COLORS.textPrimary : COLORS.textSecondary);
  }

  private formatLabel(row: SettingsRow): string {
    switch (row.kind) {
      case 'volume':
        return this.i18n.t(`settings.rows.${row.field}`);
      case 'inputOffset':
        return this.i18n.t('settings.rows.inputOffset');
      case 'scrollSpeed':
        return this.i18n.t('settings.rows.noteSpeed');
      case 'mvMode':
        return this.i18n.t('settings.rows.mvMode');
      case 'language':
        return this.i18n.t('settings.rows.language');
      case 'key':
        return this.i18n.t('settings.rows.laneKey', { lane: row.lane + 1 });
    }
  }
}

function getRowCenterYPx(index: number): number {
  return requireDefined(ROWS[index], 'Invalid settings row index', index).yPx + ROW_HEIGHT_PX / 2;
}

/** 흰색으로 그려 Button 이 상태별 색을 tint 로 입힌다. */
function ensureChevronTexture(scene: Phaser.Scene, direction: 1 | -1): string {
  const key = direction === 1 ? 'ui:chevron-right' : 'ui:chevron-left';
  const sizePx = CHEVRON_SIZE_PX * CHEVRON_TEXTURE_SCALE;
  createCanvasTexture(scene, key, sizePx, sizePx, (context) => {
    const strokePx = CHEVRON_STROKE_PX * CHEVRON_TEXTURE_SCALE;
    const insetPx = strokePx / 2;
    // 꼭짓점이 가운데에 오도록 쉐브론의 폭은 높이의 절반으로 둔다.
    const tipXPx = direction === 1 ? (sizePx * 3) / 4 - insetPx : sizePx / 4 + insetPx;
    const tailXPx = direction === 1 ? sizePx / 4 + insetPx : (sizePx * 3) / 4 - insetPx;
    context.strokeStyle = '#ffffff';
    context.lineWidth = strokePx;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(tailXPx, insetPx);
    context.lineTo(tipXPx, sizePx / 2);
    context.lineTo(tailXPx, sizePx - insetPx);
    context.stroke();
  });
  return key;
}
