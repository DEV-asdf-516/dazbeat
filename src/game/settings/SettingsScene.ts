import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { getControlsGuide } from '../controlsGuide.js';
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
  cancelPrompt,
  confirmReset,
  createSettingsEditorState,
  focusRow,
  isRowShown,
  isWaitingKey,
  moveFocus,
  pressBack,
  requestReset,
  startWaiting,
} from './settingsEditorState.js';
import type { SettingsEditorState } from './settingsEditorState.js';
import { Button } from '../ui/Button.js';
import type { SecondaryButtonColors } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { HOVER_CURSOR } from '../ui/cursor.js';
import { MENU_KEY_HINT_STYLE } from '../ui/keyHintView.js';
import { createCanvasTexture } from '../ui/canvasTexture.js';
import { createHeaderAuxiliaryButtons } from '../ui/auxiliaryButton.js';
import {
  addCelestialAtmosphere,
  getCelestialAtmosphereUses,
  getCelestialEntryTransitionUses,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import { addCelestialSprite, queueCelestialTextures } from '../celestial/celestialSprites.js';
import { handleEachEventOnce, readMenuAction, requireKeyboard } from '../ui/menuInput.js';
import { ControlsOverlay, addControlsEntry } from '../ui/ControlsOverlay.js';
import { PointerHover } from '../ui/PointerHover.js';
import { bindTextEntry } from '../ui/textEntry.js';
import { COLORS, SCREEN_LAYOUT, setTextColor, textStyle } from '../ui/theme.js';
import { readKeyCapture } from './keyCapture.js';
import { requireDefined } from '../../invariant.js';

type SettingsGroup = 'audio' | 'input' | 'general';
type SettingsColumn = 'left' | 'right';

interface RowLayout {
  column: SettingsColumn;
  yPx: number;
}

// 키 행은 가장 많은 6K 까지 만들어 두고, 선택한 레인 모드보다 많은 행은 숨긴다.
const ROWS: readonly (SettingsRow & RowLayout)[] = [
  {
    kind: 'volume',
    field: 'masterVolume',
    column: 'left',
    yPx: 224,
  },
  {
    kind: 'volume',
    field: 'musicVolume',
    column: 'left',
    yPx: 280,
  },
  {
    kind: 'volume',
    field: 'effectVolume',
    column: 'left',
    yPx: 336,
  },
  {
    kind: 'inputOffset',
    column: 'left',
    yPx: 452,
  },
  {
    kind: 'laneMode',
    column: 'left',
    yPx: 508,
  },
  {
    kind: 'key',
    lane: 0,
    column: 'left',
    yPx: 564,
  },
  {
    kind: 'key',
    lane: 1,
    column: 'left',
    yPx: 620,
  },
  {
    kind: 'key',
    lane: 2,
    column: 'left',
    yPx: 676,
  },
  {
    kind: 'key',
    lane: 3,
    column: 'left',
    yPx: 732,
  },
  {
    kind: 'key',
    lane: 4,
    column: 'left',
    yPx: 788,
  },
  {
    kind: 'key',
    lane: 5,
    column: 'left',
    yPx: 844,
  },
  {
    kind: 'scrollSpeed',
    column: 'right',
    yPx: 224,
  },
  {
    kind: 'mvMode',
    column: 'right',
    yPx: 280,
  },
  {
    kind: 'language',
    column: 'right',
    yPx: 336,
  },
];
const GROUPS: readonly ({ group: SettingsGroup } & RowLayout)[] = [
  {
    group: 'audio',
    column: 'left',
    yPx: 184,
  },
  {
    group: 'input',
    column: 'left',
    yPx: 412,
  },
  {
    group: 'general',
    column: 'right',
    yPx: 184,
  },
];
const COLUMN_WIDTH_PX = 760;
const COLUMN_LEFT_X_PX: Readonly<Record<SettingsColumn, number>> = {
  left: SCREEN_LAYOUT.leftXPx,
  right: SCREEN_LAYOUT.rightXPx - COLUMN_WIDTH_PX,
};
const GROUP_TITLE_WEIGHT = 700;
const ROW_HEIGHT_PX = 56;
const ROW_HIT_WIDTH_PX = 460;
const LABEL_OFFSET_X_PX = 24;
const CONTROL_OFFSET_Y_PX = 4;
const STEP_SIZE_PX = 48;
const STEP_GAP_PX = 12;
const VALUE_WIDTH_PX = 160;
const DECREASE_OFFSET_X_PX = 480;
const VALUE_OFFSET_X_PX = DECREASE_OFFSET_X_PX + STEP_SIZE_PX + STEP_GAP_PX + VALUE_WIDTH_PX / 2;
const INCREASE_OFFSET_X_PX = VALUE_OFFSET_X_PX + VALUE_WIDTH_PX / 2 + STEP_GAP_PX;
const KEY_BOX_WIDTH_PX = 120;
const KEY_BOX_OFFSET_X_PX = COLUMN_WIDTH_PX - KEY_BOX_WIDTH_PX;
const KEY_BOX_HEIGHT_PX = 48;
const CHEVRON_SIZE_PX = 16;
// 텍스처는 2배로 그려 축소 표시해 선 끝이 매끄럽게 보이게 한다.
const CHEVRON_TEXTURE_SCALE = 2;
// 'primary' 글자의 '−'·'+' 획 두께에 맞춘다.
const CHEVRON_STROKE_PX = 3;
const CONTROL_BUTTON_COLORS: Partial<SecondaryButtonColors> = { border: COLORS.textMuted };
const FOCUS_STAR_ID = 'R49';
const FOCUS_STAR_GAP_PX = 24;

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
  hitArea: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  control: RowControl;
}

interface SettingsView {
  title: Phaser.GameObjects.Text;
  groups: readonly { group: SettingsGroup; text: Phaser.GameObjects.Text }[];
  rows: readonly RowView[];
  waitingText: Phaser.GameObjects.Text;
  controlsEntry: Phaser.GameObjects.Container;
  rowHover: PointerHover<number>;
  focusStar: Phaser.GameObjects.Sprite;
  resetDialog: ConfirmDialog;
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
    queueCelestialTextures(this, this.celestial, [
      ...getCelestialAtmosphereUses(this.celestial, 'secondary'),
      ...getCelestialEntryTransitionUses(this.celestial),
      this.celestial.atlasPresentations[FOCUS_STAR_ID],
    ]);
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

    const overlay = new ControlsOverlay(this, () =>
      getControlsGuide(this.i18n.t('controls', { returnObjects: true }), this.editor.settings),
    );
    const view: SettingsView = {
      title: this.add.text(
        SCREEN_LAYOUT.leftXPx,
        SCREEN_LAYOUT.headerYPx,
        '',
        textStyle('heading', COLORS.textPrimary),
      ),
      groups: GROUPS.map(({ group, column, yPx }) => ({
        group,
        text: this.add.text(
          COLUMN_LEFT_X_PX[column],
          yPx,
          '',
          textStyle('secondary', COLORS.textSecondary, GROUP_TITLE_WEIGHT),
        ),
      })),
      rows: ROWS.map((row, index) => this.createRow(row, index, rowHover, onPointer)),
      waitingText: this.add.text(
        SCREEN_LAYOUT.leftXPx,
        SCREEN_LAYOUT.hintYPx,
        '',
        textStyle('meta', COLORS.textSecondary),
      ),
      controlsEntry: addControlsEntry(this, SCREEN_LAYOUT.leftXPx, SCREEN_LAYOUT.hintYPx, () =>
        overlay.open(),
      ),
      rowHover,
      focusStar: addCelestialSprite(this, this.celestial.atlasPresentations[FOCUS_STAR_ID], 0, 0),
      resetDialog: new ConfirmDialog(this, {
        onAccept: () => update(confirmReset),
        onCancel: () => update(cancelPrompt),
      }),
    };
    this.addResetEntry(() => onPointer(requestReset));
    createHeaderAuxiliaryButtons(this, [
      {
        label: 'BACK',
        onActivate: () => this.pressBack(update),
      },
    ]);
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    this.render(view);
    playCelestialEntryTransition(this, this.celestial, view.title.getBounds());
    keyboard.on(
      'keydown',
      handleEachEventOnce((event: KeyboardEvent) => this.handleKey(event, update, overlay)),
    );
  }

  /** 되돌릴 수 없는 동작이라 설정 행과 떨어뜨려 화면 우하단에 CONTROLS 진입점과 같은 높이로 둔다. */
  private addResetEntry(onActivate: () => void): void {
    const label = this.add
      .text(
        SCREEN_LAYOUT.rightXPx,
        SCREEN_LAYOUT.hintYPx + MENU_KEY_HINT_STYLE.capHeightPx / 2,
        'RESET',
        textStyle('meta', COLORS.textSecondary),
      )
      .setOrigin(1, 0.5)
      .setInteractive({ cursor: HOVER_CURSOR });
    bindTextEntry(label, label, onActivate);
  }

  private createRow(
    row: SettingsRow & RowLayout,
    index: number,
    rowHover: PointerHover<number>,
    onPointer: (transition: Transition) => void,
  ): RowView {
    const leftXPx = COLUMN_LEFT_X_PX[row.column];
    const centerYPx = row.yPx + ROW_HEIGHT_PX / 2;
    const controlYPx = row.yPx + CONTROL_OFFSET_Y_PX;
    const hitArea = this.add
      .rectangle(leftXPx, row.yPx, ROW_HIT_WIDTH_PX, ROW_HEIGHT_PX)
      .setOrigin(0, 0);
    rowHover.bind(hitArea, index, () => onPointer((state) => focusRow(state, index)));
    const label = this.add
      .text(leftXPx + LABEL_OFFSET_X_PX, centerYPx, '', textStyle('primary', COLORS.textSecondary))
      .setOrigin(0, 0.5);

    if (row.kind === 'key') {
      const keyBox = new Button(this, leftXPx + KEY_BOX_OFFSET_X_PX, controlYPx, {
        variant: 'secondary',
        focus: 'glow',
        colors: CONTROL_BUTTON_COLORS,
        label: '',
        widthPx: KEY_BOX_WIDTH_PX,
        heightPx: KEY_BOX_HEIGHT_PX,
        onActivate: () => onPointer((state) => startWaiting(state, index)),
      });
      return {
        row,
        index,
        hitArea,
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
        colors: CONTROL_BUTTON_COLORS,
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
      .text(leftXPx + VALUE_OFFSET_X_PX, centerYPx, '', textStyle('primary', COLORS.textPrimary))
      .setOrigin(0.5);
    return {
      row,
      index,
      hitArea,
      label,
      control: {
        kind: 'step',
        value,
        steps: [
          createStep(leftXPx + DECREASE_OFFSET_X_PX, '−', -1),
          createStep(leftXPx + INCREASE_OFFSET_X_PX, '+', 1),
        ],
      },
    };
  }

  private handleKey(
    event: KeyboardEvent,
    update: (transition: Transition) => void,
    overlay: ControlsOverlay,
  ): void {
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
    if (this.editor.mode.kind === 'confirmingReset') {
      switch (readMenuAction(event)) {
        case 'confirm':
          update(confirmReset);
          return;
        case 'back':
          update(cancelPrompt);
          return;
        default:
          return;
      }
    }
    if (overlay.handleKey(event)) {
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
    const { settings, mode } = this.editor;
    const waitingLane = mode.kind === 'waitingKey' ? mode.lane : null;
    const language = this.displayedLanguage;
    view.title.setText(this.i18n.t('settings.title'));
    const focused = requireDefined(
      ROWS[this.editor.rowIndex],
      'Invalid settings row index',
      this.editor.rowIndex,
    );
    view.focusStar.setPosition(
      COLUMN_LEFT_X_PX[focused.column] - FOCUS_STAR_GAP_PX,
      focused.yPx + ROW_HEIGHT_PX / 2,
    );
    view.groups.forEach(({ group, text }) => text.setText(this.i18n.t(`settings.groups.${group}`)));
    view.rows.forEach((rowView) => {
      const { row, index, hitArea, label, control } = rowView;
      const isShown = isRowShown(row, settings);
      hitArea.setVisible(isShown);
      label.setVisible(isShown);
      switch (control.kind) {
        case 'key':
          control.keyBox.setVisible(isShown);
          break;
        case 'step':
          control.value.setVisible(isShown);
          control.steps.forEach(({ button }) => button.setVisible(isShown));
          break;
      }
      if (!isShown) {
        // 숨긴 대상은 POINTER_OUT 을 받지 못하므로 hover 를 직접 해제한다.
        view.rowHover.release(index);
        return;
      }
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
    view.controlsEntry.setVisible(waitingLane === null);
    if (waitingLane !== null) {
      view.waitingText.setText(this.i18n.t('settings.waitingKey', { lane: waitingLane + 1 }));
    }
    if (mode.kind === 'confirmingReset') {
      view.resetDialog.show({
        title: this.i18n.t('settings.resetTitle'),
        body: this.i18n.t('settings.resetConfirm'),
        cancelLabel: 'CANCEL',
        acceptLabel: 'RESET',
        acceptTone: 'danger',
      });
    } else {
      view.resetDialog.hide();
    }
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
      case 'laneMode':
        return this.i18n.t('settings.rows.laneMode');
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
