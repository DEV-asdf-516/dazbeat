import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import { getControlsGuide } from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { SceneRequest, SettingsReturn, SettingsSceneData } from '../app/sceneRoutes.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import { parseLanguage } from '../../i18n/language.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { SettingsRow } from './state/settingsAdjust.js';
import { isChoiceRow } from './state/settingsRowView.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { SettingsController } from './SettingsController.js';
import {
  getBackButtonView,
  getChangedRegions,
  getKeyBoxButton,
  getKeyBoxView,
  getResetDialogButtonViews,
  getRowAppearance,
  getRowValue,
  getSettingsControlsCloseView,
  getStepButton,
  getStepView,
  getWaitingLane,
  isResetEntryHovered,
  isRowShownAt,
  isSettingsControlsEntryHovered,
} from './state/settingsEditorState.js';
import type {
  SettingsButton,
  SettingsEditorState,
  SettingsRegion,
} from './state/settingsEditorState.js';
import { Button, SURFACE_BUTTON_COLORS } from '../ui/view/widgets/Button.js';
import type { SecondaryButtonColors } from '../ui/view/widgets/Button.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import { HOVER_CURSOR } from '../ui/view/input/cursor.js';
import { bindHoverTarget, bindPointer, pointButton } from '../ui/view/input/hoverTarget.js';
import type { ButtonPointer } from '../ui/view/input/hoverTarget.js';
import {
  MENU_KEY_HINT_STYLE,
  createKeyCap,
  getKeyCapObjects,
  placeKeyCap,
} from '../ui/view/widgets/keyHintView.js';
import type { KeyCap } from '../ui/view/widgets/keyHintView.js';
import { createCanvasTexture } from '../ui/view/textures/canvasTexture.js';
import { createHeaderAuxiliaryButtons } from '../ui/view/widgets/auxiliaryButton.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import {
  ListRowMarker,
  SelectedRowHalo,
  slideSelectedRowContent,
} from '../ui/view/widgets/listRowFocus.js';
import { requireKeyboard } from '../ui/view/input/menuInput.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { renderTextEntry } from '../ui/view/widgets/textEntry.js';
import {
  COLORS,
  LIST_ROW,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  setTextColor,
  setTextWeight,
  textStyle,
} from '../ui/view/theme.js';
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
    yPx: 228,
  },
  {
    kind: 'volume',
    field: 'musicVolume',
    column: 'left',
    yPx: 300,
  },
  {
    kind: 'volume',
    field: 'effectVolume',
    column: 'left',
    yPx: 372,
  },
  {
    kind: 'scrollSpeed',
    column: 'left',
    yPx: 536,
  },
  {
    kind: 'mvMode',
    column: 'left',
    yPx: 608,
  },
  {
    kind: 'language',
    column: 'left',
    yPx: 680,
  },
  {
    kind: 'inputOffset',
    column: 'right',
    yPx: 228,
  },
  {
    kind: 'laneMode',
    column: 'right',
    yPx: 300,
  },
  {
    kind: 'key',
    lane: 0,
    column: 'right',
    yPx: 372,
  },
  {
    kind: 'key',
    lane: 1,
    column: 'right',
    yPx: 444,
  },
  {
    kind: 'key',
    lane: 2,
    column: 'right',
    yPx: 516,
  },
  {
    kind: 'key',
    lane: 3,
    column: 'right',
    yPx: 588,
  },
  {
    kind: 'key',
    lane: 4,
    column: 'right',
    yPx: 660,
  },
  {
    kind: 'key',
    lane: 5,
    column: 'right',
    yPx: 732,
  },
];
const GROUPS: readonly ({ group: SettingsGroup } & RowLayout)[] = [
  {
    group: 'audio',
    column: 'left',
    yPx: 184,
  },
  {
    group: 'general',
    column: 'left',
    yPx: 492,
  },
  {
    group: 'input',
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
const ROW_HEIGHT_PX = 72;
// 선택 띠는 그룹 제목 선에서 시작하고 열 오른쪽 끝에서 끝난다. 노드와 링(반지름 약 20px)은 띠 안에 둔다.
const ROW_NODE_OFFSET_X_PX = 28;
const LABEL_OFFSET_X_PX = ROW_NODE_OFFSET_X_PX + LIST_ROW.nodeOffsetXPx;
const CONTROL_INSET_RIGHT_PX = 16;
const STEP_SIZE_PX = 48;
const STEP_GAP_PX = 12;
const VALUE_WIDTH_PX = 160;
const INCREASE_OFFSET_X_PX = COLUMN_WIDTH_PX - CONTROL_INSET_RIGHT_PX - STEP_SIZE_PX;
const VALUE_OFFSET_X_PX = INCREASE_OFFSET_X_PX - STEP_GAP_PX - VALUE_WIDTH_PX / 2;
const DECREASE_OFFSET_X_PX = VALUE_OFFSET_X_PX - VALUE_WIDTH_PX / 2 - STEP_GAP_PX - STEP_SIZE_PX;
const KEY_BOX_WIDTH_PX = 120;
// 키 이름이 위아래 행의 값과 같은 세로선에 오게 한다.
const KEY_BOX_OFFSET_X_PX = VALUE_OFFSET_X_PX - KEY_BOX_WIDTH_PX / 2;
const KEY_BOX_HEIGHT_PX = 48;
const CHEVRON_SIZE_PX = 14;
// 텍스처는 2배로 그려 축소 표시해 선 끝이 매끄럽게 보이게 한다.
const CHEVRON_TEXTURE_SCALE = 2;
// 'secondary' 글자의 '−'·'+' 획 두께에 맞춘다.
const CHEVRON_STROKE_PX = 2.5;
const STEP_BUTTON_COLORS: Partial<SecondaryButtonColors> = {
  ...SURFACE_BUTTON_COLORS,
  unframedLabel: COLORS.textMuted,
};
const ROW_LABEL_WEIGHT = 500;
const ROW_EMPHASIS_WEIGHT = 600;
const CONTROL_LABEL_TYPE = {
  sizePx: TYPE_SCALE.secondary.sizePx,
  weight: ROW_EMPHASIS_WEIGHT,
} as const;
const ROW_NODE_IDS = {
  selected: 'R17',
  emphasized: 'R16',
  normal: 'R15',
} as const;
const SELECTED_HALO_ID = 'R29';

interface StepControl {
  button: Button;
  direction: 1 | -1;
}

type RowControl =
  | { kind: 'key'; keyBox: Button }
  | { kind: 'step'; value: Phaser.GameObjects.Text; steps: readonly StepControl[] };

interface RowView {
  row: SettingsRow & RowLayout;
  index: number;
  hitArea: Phaser.GameObjects.Rectangle;
  marker: ListRowMarker;
  label: Phaser.GameObjects.Text;
  control: RowControl;
}

interface SettingsView {
  chrome: MenuSceneChrome;
  backButton: Button;
  resetEntry: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  groups: readonly { group: SettingsGroup; text: Phaser.GameObjects.Text }[];
  rows: readonly RowView[];
  waiting: {
    container: Phaser.GameObjects.Container;
    text: Phaser.GameObjects.Text;
    escCap: KeyCap;
    cancel: Phaser.GameObjects.Text;
  };
  controlsEntry: Phaser.GameObjects.Container;
  selectedHalo: SelectedRowHalo;
  resetDialog: ConfirmDialog;
}

export class SettingsScene extends Phaser.Scene {
  private returnTo: SettingsReturn = {
    key: 'main',
    data: undefined,
  };
  private exit: SceneExit<SceneRequest> = STAYING;

  constructor(
    private readonly save: LocalSave,
    private readonly i18n: I18n,
    private readonly celestial: CelestialCatalog,
  ) {
    super(SCENE_KEYS.settings);
  }

  preload(): void {
    queueSoundEffects(this);
    queueCelestialTextures(this, this.celestial, [
      ...getMenuSceneTextureUses(this.celestial, 'secondary'),
      ...Object.values(ROW_NODE_IDS).map((id) => this.celestial.atlasPresentations[id]),
      this.celestial.atlasPresentations[SELECTED_HALO_ID],
    ]);
  }

  create(data: SettingsSceneData): void {
    this.exit = STAYING;
    this.returnTo = data.returnTo;
    // 컨트롤러는 첫 그림을 위해 view 가 먼저 있어야 하므로, 입력 콜백은 만든 뒤에 불릴 때 컨트롤러를 찾는다.
    const getController = (): SettingsController => controller;
    const pointer: ButtonPointer<SettingsButton> = {
      pointerOver: (button) => controller.pointerOver(button),
      pointerOut: (button) => controller.pointerOut(button),
      pointerDown: (button) => controller.pointerDown(button),
      pointerUp: (button) => controller.pointerUp(button),
    };
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'secondary',
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        captureKey: (event) => controller.captureKey(event),
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => controller.handleMenuKey(action),
      },
      pointer,
    );
    const keyboard = requireKeyboard(this);

    const widgets: Omit<SettingsView, 'controlsEntry' | 'backButton'> = {
      chrome,
      title: this.add.text(
        SCREEN_LAYOUT.leftXPx,
        SCREEN_LAYOUT.headerYPx,
        this.i18n.t('settings.title'),
        textStyle('heading', COLORS.textPrimary),
      ),
      groups: GROUPS.map(({ group, column, yPx }) => ({
        group,
        text: this.add.text(
          COLUMN_LEFT_X_PX[column],
          yPx,
          '',
          textStyle('primary', COLORS.textSecondary, GROUP_TITLE_WEIGHT),
        ),
      })),
      rows: ROWS.map((row, index) => this.createRow(row, index, getController, pointer)),
      waiting: this.addWaitingHint(),
      selectedHalo: new SelectedRowHalo(this, this.celestial.atlasPresentations[SELECTED_HALO_ID]),
      resetDialog: new ConfirmDialog(this, {
        cancel: pointButton(pointer, 'resetCancel'),
        accept: pointButton(pointer, 'resetAccept'),
      }),
      resetEntry: this.addResetEntry(pointer),
    };
    const [backButton] = createHeaderAuxiliaryButtons(this, [
      {
        label: 'BACK',
        pointer: pointButton(pointer, 'back'),
      },
    ]);
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    const view: SettingsView = {
      ...widgets,
      backButton: requireDefined(backButton, 'Missing settings header button', 'BACK'),
      controlsEntry: chrome.start(widgets.title.getBounds()),
    };
    const controller = new SettingsController(
      {
        save: this.save,
        changeLanguage: (language) => this.i18n.changeLanguage(language),
      },
      {
        render: (previous, next) => {
          for (const region of getChangedRegions(previous, next)) {
            this.renderRegion(view, next, region);
          }
        },
        // 이 화면에서 효과음 볼륨이 바뀌므로 재생할 때마다 지금 설정으로 만든다.
        playFocusSound: (settings) => new SoundEffects(this, settings).play('menuFocus'),
        leave: () => {
          this.exit = exitScene(this, this.exit, this.returnTo);
        },
      },
      ROWS,
      this.save.loadSettings(),
      requireDefined(
        parseLanguage(this.i18n.language),
        'Unsupported i18n language',
        this.i18n.language,
      ),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
  }

  private addWaitingHint(): SettingsView['waiting'] {
    const text = this.add.text(0, 0, '', textStyle('meta', COLORS.textSecondary)).setOrigin(0, 0.5);
    const escCap = createKeyCap(this, 'Esc', MENU_KEY_HINT_STYLE);
    const cancel = this.add
      .text(0, 0, '', textStyle('meta', MENU_KEY_HINT_STYLE.labelColor))
      .setOrigin(0, 0.5);
    return {
      container: this.add.container(
        SCREEN_LAYOUT.leftXPx,
        SCREEN_LAYOUT.hintYPx + MENU_KEY_HINT_STYLE.capHeightPx / 2,
        [text, ...getKeyCapObjects(escCap), cancel],
      ),
      text,
      escCap,
      cancel,
    };
  }

  /** 되돌릴 수 없는 동작이라 설정 행과 떨어뜨려 화면 우하단에 CONTROLS 진입점과 같은 높이로 둔다. */
  private addResetEntry(pointer: ButtonPointer<SettingsButton>): Phaser.GameObjects.Text {
    const label = this.add
      .text(
        SCREEN_LAYOUT.rightXPx,
        SCREEN_LAYOUT.hintYPx + MENU_KEY_HINT_STYLE.capHeightPx / 2,
        'RESET',
        textStyle('meta', COLORS.textSecondary),
      )
      .setOrigin(1, 0.5)
      .setInteractive({ cursor: HOVER_CURSOR });
    bindPointer(label, pointButton(pointer, 'resetEntry'));
    return label;
  }

  private createRow(
    row: SettingsRow & RowLayout,
    index: number,
    getController: () => SettingsController,
    pointer: ButtonPointer<SettingsButton>,
  ): RowView {
    const leftXPx = COLUMN_LEFT_X_PX[row.column];
    const centerYPx = row.yPx + ROW_HEIGHT_PX / 2;
    const marker = new ListRowMarker(
      this,
      {
        topYPx: row.yPx,
        heightPx: ROW_HEIGHT_PX,
        nodeXPx: leftXPx + ROW_NODE_OFFSET_X_PX,
        fillXPx: leftXPx,
        fillWidthPx: COLUMN_WIDTH_PX,
      },
      this.celestial.atlasPresentations[ROW_NODE_IDS.normal],
    );
    const hitArea = this.add
      .rectangle(leftXPx, row.yPx, COLUMN_WIDTH_PX, ROW_HEIGHT_PX)
      .setOrigin(0, 0);
    bindHoverTarget(hitArea, {
      onOver: () => getController().hoverRow(index),
      onOut: () => getController().unhoverRow(index),
      onActivate: () => getController().pointRow(index),
    });
    const label = this.add
      .text(
        leftXPx + LABEL_OFFSET_X_PX,
        centerYPx,
        '',
        textStyle('secondary', COLORS.textSecondary),
      )
      .setOrigin(0, 0.5);

    if (row.kind === 'key') {
      const keyBox = new Button(
        this,
        leftXPx + KEY_BOX_OFFSET_X_PX,
        centerYPx - KEY_BOX_HEIGHT_PX / 2,
        {
          variant: 'secondary',
          focus: 'frame',
          colors: SURFACE_BUTTON_COLORS,
          labelType: CONTROL_LABEL_TYPE,
          label: '',
          widthPx: KEY_BOX_WIDTH_PX,
          heightPx: KEY_BOX_HEIGHT_PX,
          pointer: pointButton(pointer, getKeyBoxButton(index)),
        },
      );
      return {
        row,
        index,
        hitArea,
        marker,
        label,
        control: {
          kind: 'key',
          keyBox,
        },
      };
    }
    const isChoice = isChoiceRow(row);
    const createStep = (xPx: number, buttonLabel: string, direction: 1 | -1): StepControl => {
      const button = new Button(this, xPx, centerYPx - STEP_SIZE_PX / 2, {
        variant: 'secondary',
        focus: 'frame',
        colors: STEP_BUTTON_COLORS,
        labelType: CONTROL_LABEL_TYPE,
        label: buttonLabel,
        widthPx: STEP_SIZE_PX,
        heightPx: STEP_SIZE_PX,
        pointer: pointButton(pointer, getStepButton(index, direction)),
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
      .text(
        leftXPx + VALUE_OFFSET_X_PX,
        centerYPx,
        '',
        textStyle('secondary', COLORS.textPrimary, ROW_EMPHASIS_WEIGHT),
      )
      .setOrigin(0.5);
    return {
      row,
      index,
      hitArea,
      marker,
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

  private renderRegion(
    view: SettingsView,
    state: SettingsEditorState,
    region: SettingsRegion,
  ): void {
    switch (region) {
      case 'title':
        view.title.setText(this.i18n.t('settings.title'));
        return;
      case 'groups':
        view.groups.forEach(({ group, text }) =>
          text.setText(this.i18n.t(`settings.groups.${group}`)),
        );
        return;
      case 'rowLabels':
        view.rows.forEach((rowView) => this.renderRowLabel(rowView, state));
        return;
      case 'rowControls':
        view.rows.forEach((rowView) => this.renderRowControl(rowView, state));
        return;
      case 'selectedHalo':
        view.selectedHalo.render(
          requireDefined(view.rows[state.rowIndex], 'Invalid settings row index', state.rowIndex)
            .marker,
        );
        return;
      case 'waitingText': {
        const waitingLane = getWaitingLane(state);
        const { container, text, escCap, cancel } = view.waiting;
        container.setVisible(waitingLane !== null);
        if (waitingLane === null) {
          return;
        }
        text.setText(this.i18n.t('settings.waitingKey', { lane: waitingLane + 1 }));
        cancel.setText(this.i18n.t('settings.waitingCancel'));
        const capLeftPx = text.width + MENU_KEY_HINT_STYLE.rowItemGapPx;
        placeKeyCap(escCap, capLeftPx, 0);
        cancel.setX(capLeftPx + escCap.cap.width + MENU_KEY_HINT_STYLE.capLabelGapPx);
        return;
      }
      case 'controlsEntry':
        view.controlsEntry.setVisible(getWaitingLane(state) === null);
        view.chrome.renderControlsEntry(isSettingsControlsEntryHovered(state));
        return;
      case 'controlsClose':
        view.chrome.renderControlsClose(getSettingsControlsCloseView(state));
        return;
      case 'backButton':
        view.backButton.render(getBackButtonView(state));
        return;
      case 'resetEntry':
        renderTextEntry(view.resetEntry, isResetEntryHovered(state));
        return;
      case 'resetButtons': {
        const { cancel, accept } = getResetDialogButtonViews(state);
        view.resetDialog.renderButtons(cancel, accept);
        return;
      }
      case 'rowButtons':
        view.rows.forEach(({ index, control }) => {
          switch (control.kind) {
            case 'key':
              control.keyBox.render(getKeyBoxView(state, index));
              return;
            case 'step':
              control.steps.forEach(({ button, direction }) =>
                button.render(getStepView(state, index, direction)),
              );
              return;
          }
        });
        return;
      case 'resetDialog':
        switch (state.mode.kind) {
          case 'confirmingReset':
            view.resetDialog.render({
              title: this.i18n.t('settings.resetTitle'),
              body: this.i18n.t('settings.resetConfirm'),
              cancelLabel: 'CANCEL',
              acceptLabel: 'RESET',
              acceptTone: 'danger',
            });
            return;
          case 'browsing':
          case 'waitingKey':
            view.resetDialog.render(null);
            return;
        }
        return;
      case 'controls':
        // 조작 안내의 레인 키는 이 화면에서 바뀌므로 저장소가 아니라 지금 설정으로 그린다.
        view.chrome.renderControls(
          state.isControlsOpen
            ? getControlsGuide(this.i18n.t('controls', { returnObjects: true }), state.settings)
            : null,
        );
        return;
    }
  }

  private renderRowLabel(
    { row, index, hitArea, marker, label }: RowView,
    state: SettingsEditorState,
  ): void {
    const isShown = isRowShownAt(state, index);
    hitArea.setVisible(isShown);
    label.setVisible(isShown);
    if (!isShown) {
      marker.render(null);
      return;
    }
    const appearance = getRowAppearance(state, index);
    const isSelected = appearance === 'selected';
    marker.render({
      node: this.celestial.atlasPresentations[ROW_NODE_IDS[appearance]],
      isSelected,
    });
    label.setText(this.formatLabel(row));
    setTextColor(label, appearance === 'normal' ? COLORS.textSecondary : COLORS.textPrimary);
    setTextWeight(label, isSelected ? ROW_EMPHASIS_WEIGHT : ROW_LABEL_WEIGHT);
    slideSelectedRowContent(
      this,
      label,
      COLUMN_LEFT_X_PX[row.column] + LABEL_OFFSET_X_PX,
      isSelected,
    );
  }

  private renderRowControl({ index, control }: RowView, state: SettingsEditorState): void {
    const isShown = isRowShownAt(state, index);
    switch (control.kind) {
      case 'key':
        control.keyBox.setVisible(isShown);
        if (isShown) {
          control.keyBox.setLabel(getRowValue(state, index));
        }
        return;
      case 'step':
        control.value.setVisible(isShown);
        control.steps.forEach(({ button }) => button.setVisible(isShown));
        if (!isShown) {
          return;
        }
        control.value.setText(getRowValue(state, index));
        return;
    }
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
