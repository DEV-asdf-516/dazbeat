import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { SCENE_KEYS, exitScene } from '../config.js';
import type { SceneRequest, SettingsSceneData } from '../config.js';
import type { CelestialCatalog } from '../celestial/celestialCatalog.js';
import { getAtlasPresentation } from '../celestial/celestialCatalog.js';
import { LANGUAGE_NAMES, parseLanguage } from '../../i18n/language.js';
import type { Language } from '../../i18n/language.js';
import { DEFAULT_SETTINGS } from '../../storage/LocalSave.js';
import type { LocalSave, Settings } from '../../storage/LocalSave.js';
import { canAdjust } from './settingsAdjust.js';
import type { SettingsRow } from './settingsAdjust.js';
import { STAYING } from '../sceneExit.js';
import type { SceneExit } from '../sceneExit.js';
import {
  adjustRow,
  applyPointer,
  bindWaitingKey,
  cancelWaiting,
  createSettingsEditorState,
  focusRow,
  isWaitingKey,
  moveFocus,
  startWaiting,
} from './settingsEditorState.js';
import type { SettingsEditorState } from './settingsEditorState.js';
import { Button } from '../ui/Button.js';
import { createAuxiliaryButton } from '../ui/auxiliaryButton.js';
import {
  addCelestialAtmosphere,
  playCelestialEntryTransition,
} from '../celestial/celestialAtmosphere.js';
import {
  addCelestialSprite,
  queueCelestialTextures,
  registerCelestialAnimations,
} from '../celestial/celestialSprites.js';
import { formatKeyCode } from '../ui/format.js';
import {
  handleEachEventOnce,
  readKeyCapture,
  readMenuAction,
  requireKeyboard,
} from '../ui/menuInput.js';
import { addMenuKeyHintRow } from '../ui/keyHintView.js';
import { PointerHover } from '../ui/PointerHover.js';
import { COLORS, SCREEN_LAYOUT, setTextColor, textStyle } from '../ui/theme.js';

type SettingsGroup = 'audio' | 'input' | 'general';

const ROWS: readonly (SettingsRow & { yPx: number })[] = [
  { kind: 'volume', field: 'masterVolume', yPx: 224 },
  { kind: 'volume', field: 'musicVolume', yPx: 280 },
  { kind: 'volume', field: 'effectVolume', yPx: 336 },
  { kind: 'inputOffset', yPx: 452 },
  { kind: 'key', lane: 0, yPx: 508 },
  { kind: 'key', lane: 1, yPx: 564 },
  { kind: 'key', lane: 2, yPx: 620 },
  { kind: 'key', lane: 3, yPx: 676 },
  { kind: 'scrollSpeed', yPx: 792 },
  { kind: 'mvMode', yPx: 848 },
  { kind: 'language', yPx: 904 },
];
const GROUPS: readonly { group: SettingsGroup; yPx: number }[] = [
  { group: 'audio', yPx: 184 },
  { group: 'input', yPx: 412 },
  { group: 'general', yPx: 752 },
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
// 행 라벨 영역 왼쪽에 둔다.
const FOCUS_STAR_GAP_PX = 24;
// 행이 화면 아래까지 차 있어 다른 메뉴 씬의 힌트 위치보다 조금 내린다.
const HINT_Y_PX = 984;

interface StepControl {
  button: Button;
  direction: 1 | -1;
}

/** 키 행은 키 상자, 나머지 행은 값과 −/+ 버튼을 가진다. */
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
  /** 키 입력 대기 중에만 힌트 줄 대신 보이는 안내. */
  waitingText: Phaser.GameObjects.Text;
  /** 언어가 바뀌면 문구가 달라지므로 그때 다시 만든다. */
  keyHint: { text: string; row: Phaser.GameObjects.Container } | null;
  rowHover: PointerHover<number>;
  focusStar: Phaser.GameObjects.Sprite | null;
}

type Transition = (state: SettingsEditorState) => SettingsEditorState;

export class SettingsScene extends Phaser.Scene {
  private returnScene: SettingsSceneData['returnScene'] = 'main';
  private editor = createSettingsEditorState(ROWS, DEFAULT_SETTINGS);
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.settings);
  }

  preload(): void {
    queueCelestialTextures(this, this.celestial);
  }

  create(data: SettingsSceneData): void {
    this.exit = STAYING;
    registerCelestialAnimations(this, this.celestial);
    addCelestialAtmosphere(this, this.celestial, 'secondary');
    const keyboard = requireKeyboard(this);
    this.returnScene = data.returnScene;
    this.editor = createSettingsEditorState(ROWS, this.save.loadSettings());

    const rowHover = new PointerHover<number>((index) => {
      const rowView = view.rows[index];
      if (rowView === undefined) {
        throw new Error(`Invalid settings row index: ${index}`);
      }
      this.renderLabelColor(rowView, rowHover);
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
      keyHint: null,
      rowHover,
      focusStar: addCelestialSprite(
        this,
        getAtlasPresentation(this.celestial, FOCUS_STAR_ID),
        SCREEN_LAYOUT.leftXPx - FOCUS_STAR_GAP_PX,
        0,
      ),
    };
    // 한 줄 Text 의 높이는 내용과 무관하므로 제목이 아직 비어 있어도 세로 중심을 잴 수 있다.
    createAuxiliaryButton(this, 0, view.title.y + view.title.height / 2, {
      label: 'BACK',
      onActivate: () => {
        if (isWaitingKey(this.editor)) {
          update(cancelWaiting);
        } else {
          this.back();
        }
      },
    }).alignX(SCREEN_LAYOUT.rightXPx, 1);
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
        label: '',
        widthPx: KEY_BOX_WIDTH_PX,
        heightPx: KEY_BOX_HEIGHT_PX,
        onActivate: () => onPointer((state) => startWaiting(state, index)),
      });
      return { row, index, label, control: { kind: 'key', keyBox } };
    }
    // 수치가 아니라 선택지를 넘기는 행은 증감 대신 좌우 쉐브론으로 표시한다.
    const isChoice = row.kind === 'mvMode' || row.kind === 'language';
    const createStep = (xPx: number, buttonLabel: string, direction: 1 | -1): StepControl => {
      const button = new Button(this, xPx, controlYPx, {
        variant: 'secondary',
        label: buttonLabel,
        widthPx: STEP_SIZE_PX,
        heightPx: STEP_SIZE_PX,
        onActivate: () =>
          onPointer((state) => adjustRow(state, index, direction, this.getDisplayedLanguage())),
      });
      if (isChoice) {
        button.setIcon(ensureChevronTexture(this, direction), CHEVRON_SIZE_PX);
      }
      return { button, direction };
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
        update((state) => adjustRow(state, state.rowIndex, -1, this.getDisplayedLanguage()));
        return;
      case 'right':
        update((state) => adjustRow(state, state.rowIndex, 1, this.getDisplayedLanguage()));
        return;
      case 'confirm':
        update((state) => startWaiting(state, state.rowIndex));
        return;
      case 'back':
        this.back();
        return;
      case null:
        return;
    }
  }

  /** 상태가 그대로면 아무것도 다시 그리지 않는다. */
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

  private back(): void {
    this.exit = exitScene(this, this.exit, { key: this.returnScene, data: undefined });
  }

  private applySettings(view: SettingsView, settings: Settings): void {
    try {
      this.save.saveSettings(settings);
    } catch (error) {
      console.error('Failed to save settings', error);
    }
    if (settings.language !== null && settings.language !== this.i18n.language) {
      this.i18n.changeLanguage(settings.language).then(
        () => this.render(view),
        (error: unknown) => console.error('Failed to change language', error),
      );
    }
  }

  private getDisplayedLanguage(): Language {
    const language = parseLanguage(this.i18n.language);
    if (language === undefined) {
      throw new Error(`Unsupported i18n language: ${this.i18n.language}`);
    }
    return language;
  }

  private render(view: SettingsView): void {
    const { settings, waitingLane } = this.editor;
    const language = this.getDisplayedLanguage();
    view.title.setText(this.i18n.t('settings.title'));
    view.focusStar?.setY(getRowCenterYPx(this.editor.rowIndex));
    view.groups.forEach(({ group, text }) => text.setText(this.i18n.t(`settings.groups.${group}`)));
    view.rows.forEach((rowView) => {
      const { row, label, control } = rowView;
      label.setText(this.formatLabel(row));
      this.renderLabelColor(rowView, view.rowHover);
      const value = this.formatValue(row, settings, language);
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
    view.keyHint?.row.setVisible(false);
  }

  private renderKeyHint(view: SettingsView, text: string): void {
    if (view.keyHint?.text === text) {
      view.keyHint.row.setVisible(true);
      return;
    }
    view.keyHint?.row.destroy();
    view.keyHint = {
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

  private formatValue(row: SettingsRow, settings: Settings, language: Language): string {
    switch (row.kind) {
      case 'volume':
        return `${Math.round(settings[row.field] * 100)}%`;
      case 'inputOffset':
        return `${settings.inputOffsetMs}ms`;
      case 'scrollSpeed':
        return `${settings.scrollSpeedPxPerSecond}px/s`;
      case 'mvMode':
        return settings.mvMode.toUpperCase();
      case 'language':
        return LANGUAGE_NAMES[language];
      case 'key':
        return this.editor.waitingLane === row.lane
          ? '...'
          : formatKeyCode(settings.keyBindings[row.lane]);
    }
  }
}

function getRowCenterYPx(index: number): number {
  const row = ROWS[index];
  if (row === undefined) {
    throw new Error(`Invalid settings row index: ${index}`);
  }
  return row.yPx + ROW_HEIGHT_PX / 2;
}

/** 흰색으로 그려 Button 이 상태별 색을 tint 로 입힌다. */
function ensureChevronTexture(scene: Phaser.Scene, direction: 1 | -1): string {
  const key = direction === 1 ? 'ui:chevron-right' : 'ui:chevron-left';
  if (scene.textures.exists(key)) {
    return key;
  }
  const sizePx = CHEVRON_SIZE_PX * CHEVRON_TEXTURE_SCALE;
  const texture = scene.textures.createCanvas(key, sizePx, sizePx);
  if (texture === null) {
    throw new Error(`Failed to create texture: ${key}`);
  }
  const context = texture.getContext();
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
  texture.refresh();
  return key;
}
