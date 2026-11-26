import type { i18n as I18n } from 'i18next';
import Phaser from 'phaser';
import {
  getControlsCloseView,
  getControlsGuide,
  getControlsHelpButtonView,
  isControlsEntryHovered,
  isControlsHelpShown,
  isControlsPanelOpen,
} from '../app/controlsGuide.js';
import { SCENE_KEYS, exitScene } from '../app/sceneRoutes.js';
import type { SceneRequest, SettingsReturn, SettingsSceneData } from '../app/sceneRoutes.js';
import type { CelestialCatalog } from '../celestial/state/celestialCatalog.js';
import { parseLanguage } from '../../i18n/language.js';
import type { LocalSave } from '../../storage/LocalSave.js';
import type { MenuMusic } from '../ui/view/MenuMusic.js';
import type { SettingsRow } from './state/settingsAdjust.js';
import { isChoiceRow } from './state/settingsRowView.js';
import { STAYING } from '../app/sceneExit.js';
import type { SceneExit } from '../app/sceneExit.js';
import { SettingsController } from './SettingsController.js';
import type { SettingsScreen } from './SettingsController.js';
import {
  getBackButtonView,
  getChangedRegions,
  getKeyBoxButton,
  getKeyBoxView,
  getMuteButton,
  getMuteToggleView,
  getResetDialogButtonViews,
  getRowAppearance,
  getRowValue,
  getStepButton,
  getStepView,
  getVolumeMeterView,
  getWaitingLane,
  isResetEntryHovered,
  isRowShownAt,
} from './state/settingsEditorState.js';
import type { MuteToggleTone } from './state/settingsEditorState.js';
import { Button, SURFACE_BUTTON_COLORS } from '../ui/view/widgets/Button.js';
import type { SecondaryButtonColors } from '../ui/view/widgets/Button.js';
import { ConfirmDialog } from '../ui/view/widgets/ConfirmDialog.js';
import { HOVER_CURSOR } from '../ui/view/input/cursor.js';
import { bindHoverTarget, bindPointer, pointButton } from '../ui/view/input/hoverTarget.js';
import {
  MENU_KEY_HINT_STYLE,
  createKeyCap,
  getKeyCapObjects,
  placeKeyCap,
} from '../ui/view/widgets/keyHintView.js';
import type { KeyCap } from '../ui/view/widgets/keyHintView.js';
import {
  CHEVRON_SIZE_PX,
  ensureChevronTexture,
  ensureSpeakerTexture,
  ensureVolumeMeterTexture,
} from './view/settingsTextures.js';
import {
  AUXILIARY_LABEL_TYPE,
  FOOTER_AUXILIARY_ENTRY_GAP_PX,
  createFooterAuxiliaryButtons,
  getFooterAuxiliaryCenterYPx,
} from '../ui/view/widgets/auxiliaryButton.js';
import { queueCelestialTextures } from '../celestial/view/celestialSprites.js';
import {
  ListRowMarker,
  SelectedRowHalo,
  slideSelectedRowContent,
} from '../ui/view/widgets/listRowFocus.js';
import { requireKeyboard } from '../ui/view/input/menuInput.js';
import { getAccountPanelButtonView } from '../ui/state/accountIdentity.js';
import type { AccountSource } from '../ui/state/accountIdentity.js';
import { MenuSceneChrome, getMenuSceneTextureUses } from '../ui/view/widgets/MenuSceneChrome.js';
import { SoundEffects, queueSoundEffects } from '../ui/view/soundEffects.js';
import { renderTextEntry } from '../ui/view/widgets/textEntry.js';
import { HELP_BUTTON, HelpTip } from '../ui/view/widgets/HelpTip.js';
import { isButtonHovered } from '../ui/state/buttonPointer.js';
import {
  CELESTIAL_COLORS,
  COLORS,
  LIST_ROW,
  SCREEN_LAYOUT,
  TYPE_SCALE,
  setTextColor,
  setTextWeight,
  textStyle,
  typeStyle,
} from '../ui/view/theme.js';
import { requireDefined } from '../../invariant.js';
import type { ListDirection } from '../../range.js';

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
    field: 'backgroundVolume',
    column: 'left',
    yPx: 228,
  },
  {
    kind: 'volume',
    field: 'effectVolume',
    column: 'left',
    yPx: 300,
  },
  {
    kind: 'volume',
    field: 'musicVolume',
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
const ROW_HELP_GAP_PX = 12;
const ROW_HELP_OFFSET_X_PX = ROW_HELP_GAP_PX + HELP_BUTTON.radiusPx + HELP_BUTTON.ringWidthPx;
// 도움말 판 위끝을 줄 이름 아래끝에서 이만큼 띄운다(시안 ⑦).
const ROW_HELP_PANEL_GAP_PX = 18;
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
// 스피커는 크기를 바꾸지 않고 켜고 끄기만 하므로 −/+ 묶음과 떨어뜨려 조정 버튼으로 읽히지 않게 한다.
const MUTE_OFFSET_X_PX = DECREASE_OFFSET_X_PX - STEP_GAP_PX * 2 - STEP_SIZE_PX;
const MUTE_TONE_COLORS: Readonly<Record<MuteToggleTone, number>> = {
  focused: COLORS.textPrimary,
  audible: CELESTIAL_COLORS.selected,
  muted: COLORS.textDisabled,
};
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
  direction: ListDirection;
}

type RowControl =
  | { kind: 'key'; keyBox: Button }
  | { kind: 'step'; value: Phaser.GameObjects.Text; steps: readonly StepControl[] }
  | {
      kind: 'volume';
      meter: Phaser.GameObjects.Image;
      mute: Phaser.GameObjects.Image;
      steps: readonly StepControl[];
    };

interface RowView {
  row: SettingsRow & RowLayout;
  index: number;
  hitArea: Phaser.GameObjects.Rectangle;
  marker: ListRowMarker;
  label: Phaser.GameObjects.Text;
  help: HelpTip | null;
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
    private readonly menuMusic: MenuMusic,
    private readonly account: AccountSource,
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
    const screen: SettingsScreen = {
      render: (previous, next) => {
        for (const region of getChangedRegions(previous, next)) {
          switch (region) {
            case 'title':
              view.title.setText(this.i18n.t('settings.title'));
              break;
            case 'groups':
              view.groups.forEach(({ group, text }) =>
                text.setText(this.i18n.t(`settings.groups.${group}`)),
              );
              break;
            case 'rowLabels':
              for (const { row, index, hitArea, marker, label, help } of view.rows) {
                const isShown = isRowShownAt(next, index);
                hitArea.setVisible(isShown);
                label.setVisible(isShown);
                help?.container.setVisible(isShown);
                if (!isShown) {
                  marker.render(null);
                  continue;
                }
                const appearance = getRowAppearance(next, index);
                const isSelected = appearance === 'selected';
                marker.render({
                  node: this.celestial.atlasPresentations[ROW_NODE_IDS[appearance]],
                  isSelected,
                });
                label.setText(this.formatLabel(row));
                setTextColor(
                  label,
                  appearance === 'normal' ? COLORS.textSecondary : COLORS.textPrimary,
                );
                setTextWeight(label, isSelected ? ROW_EMPHASIS_WEIGHT : ROW_LABEL_WEIGHT);
                const labelRestXPx = COLUMN_LEFT_X_PX[row.column] + LABEL_OFFSET_X_PX;
                slideSelectedRowContent(this, label, labelRestXPx, isSelected);
                if (help !== null) {
                  slideSelectedRowContent(
                    this,
                    help.container,
                    labelRestXPx + label.width + ROW_HELP_OFFSET_X_PX,
                    isSelected,
                  );
                }
              }
              break;
            case 'rowControls':
              for (const { index, control } of view.rows) {
                switch (control.kind) {
                  case 'key': {
                    const isShown = isRowShownAt(next, index);
                    control.keyBox.setVisible(isShown);
                    if (isShown) {
                      control.keyBox.setContent({
                        kind: 'label',
                        label: getRowValue(next, index),
                      });
                    }
                    break;
                  }
                  case 'step':
                    control.value.setText(getRowValue(next, index));
                    break;
                  case 'volume':
                    control.meter.setTexture(
                      ensureVolumeMeterTexture(this, getVolumeMeterView(next, index)),
                    );
                    break;
                }
              }
              break;
            case 'selectedHalo':
              view.selectedHalo.render(
                requireDefined(
                  view.rows[next.rowIndex],
                  'Invalid settings row index',
                  next.rowIndex,
                ).marker,
              );
              break;
            case 'waitingText': {
              const waitingLane = getWaitingLane(next);
              const { container, text, escCap, cancel } = view.waiting;
              container.setVisible(waitingLane !== null);
              if (waitingLane === null) {
                break;
              }
              text.setText(this.i18n.t('settings.waitingKey', { lane: waitingLane + 1 }));
              cancel.setText(this.i18n.t('settings.waitingCancel'));
              const capLeftPx = text.width + MENU_KEY_HINT_STYLE.rowItemGapPx;
              placeKeyCap(escCap, capLeftPx, 0);
              cancel.setX(capLeftPx + escCap.cap.width + MENU_KEY_HINT_STYLE.capLabelGapPx);
              break;
            }
            case 'controlsEntry':
              view.controlsEntry.setVisible(getWaitingLane(next) === null);
              view.chrome.renderControlsEntry(isControlsEntryHovered(next.hover));
              break;
            case 'controlsClose':
              view.chrome.controls.closeButton.render(getControlsCloseView(next.hover));
              break;
            case 'controlsHelpCard':
              view.chrome.controls.helpCard.render(isControlsHelpShown(next));
              break;
            case 'controlsHelpButton':
              view.chrome.controls.renderHelpButton(getControlsHelpButtonView(next));
              break;
            case 'inputOffsetHelp':
              for (const { help } of view.rows) {
                help?.render(
                  {
                    title: this.i18n.t('settings.rows.inputOffset'),
                    lines: [
                      this.i18n.t('settings.rowHelp.inputOffset.meaning'),
                      this.i18n.t('settings.rowHelp.inputOffset.direction'),
                    ],
                  },
                  isButtonHovered(next.hover, 'inputOffsetHelp'),
                );
              }
              break;
            case 'accountButton': {
              const views = getAccountPanelButtonView(next.hover);
              view.chrome.accountCorner.nameplate.renderButton(views.accountProfile);
              view.chrome.accountCorner.signInButton.render(views.accountSignIn);
              break;
            }
            case 'backButton':
              view.backButton.render(getBackButtonView(next));
              break;
            case 'resetEntry':
              renderTextEntry(view.resetEntry, isResetEntryHovered(next));
              break;
            case 'resetButtons': {
              const { cancel, accept } = getResetDialogButtonViews(next);
              view.resetDialog.renderButtons(cancel, accept);
              break;
            }
            case 'rowButtons':
              for (const { index, control } of view.rows) {
                switch (control.kind) {
                  case 'key':
                    control.keyBox.render(getKeyBoxView(next, index));
                    continue;
                  case 'step':
                    control.steps.forEach(({ button, direction }) =>
                      button.render(getStepView(next, index, direction)),
                    );
                    continue;
                  case 'volume': {
                    control.steps.forEach(({ button, direction }) =>
                      button.render(getStepView(next, index, direction)),
                    );
                    const { isMuted, tone } = getMuteToggleView(next, index);
                    control.mute
                      .setTexture(ensureSpeakerTexture(this, isMuted, STEP_SIZE_PX))
                      .setDisplaySize(STEP_SIZE_PX, STEP_SIZE_PX)
                      .setTint(MUTE_TONE_COLORS[tone]);
                    continue;
                  }
                }
              }
              break;
            case 'resetDialog':
              view.resetDialog.render(
                next.mode.kind === 'confirmingReset'
                  ? {
                      title: this.i18n.t('settings.resetTitle'),
                      body: this.i18n.t('settings.resetConfirm'),
                      cancelLabel: 'CANCEL',
                      acceptLabel: 'RESET',
                      acceptTone: 'danger',
                    }
                  : null,
              );
              break;
            case 'controls':
              // 조작 안내의 레인 키는 이 화면에서 바뀌므로 저장소가 아니라 지금 설정으로 그린다.
              view.chrome.controls.render(
                isControlsPanelOpen(next)
                  ? getControlsGuide(
                      this.i18n.t('controls', { returnObjects: true }),
                      next.settings,
                    )
                  : null,
              );
              break;
          }
        }
      },
      // 이 화면에서 효과음 볼륨이 바뀌므로 재생할 때마다 지금 설정으로 만든다.
      playSound: (sound, settings) => new SoundEffects(this, settings).play(sound),
      setBackgroundVolume: (settings) => this.menuMusic.setVolume(settings),
      renderAccount: () => {
        const identity = this.account.getIdentity();
        view.chrome.accountCorner.nameplate.render(identity);
        view.chrome.accountCorner.renderSignIn(identity);
      },
      openProfile: () => {
        this.exit = exitScene(this, this.exit, {
          key: 'profile',
          data: {
            returnTo: {
              key: 'settings',
              data: { returnTo: this.returnTo },
            },
          },
        });
      },
      leave: () => {
        this.exit = exitScene(this, this.exit, this.returnTo);
      },
    };
    const controller = new SettingsController(
      {
        save: this.save,
        changeLanguage: (language) => this.i18n.changeLanguage(language),
        signIn: () => this.account.signIn(),
      },
      screen,
      ROWS,
      this.save.loadSettings(),
      requireDefined(
        parseLanguage(this.i18n.language),
        'Unsupported i18n language',
        this.i18n.language,
      ),
    );
    const chrome = new MenuSceneChrome(
      this,
      {
        celestial: this.celestial,
        screen: 'secondary',
        account: {
          kind: 'corner',
          catalog: this.account.catalog,
          pointer: controller,
        },
      },
      {
        isLeaving: () => this.exit.kind === 'leaving',
        captureKey: (event) => controller.captureKey(event),
        handleControlsKey: (event) => controller.handleControlsKey(event),
        handleMenuKey: (action) => controller.handleMenuKey(action),
      },
      controller,
    );
    const identity = this.account.getIdentity();
    chrome.accountCorner.nameplate.render(identity);
    chrome.accountCorner.renderSignIn(identity);
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
      rows: ROWS.map((row, index) => this.createRow(row, index, controller)),
      waiting: this.addWaitingHint(),
      selectedHalo: new SelectedRowHalo(this, this.celestial.atlasPresentations[SELECTED_HALO_ID]),
      resetDialog: new ConfirmDialog(this, {
        cancel: pointButton(controller, 'resetCancel'),
        accept: pointButton(controller, 'resetAccept'),
      }),
      resetEntry: this.addResetEntry(controller),
    };
    const [backButton] = createFooterAuxiliaryButtons(this, [
      {
        label: 'BACK',
        pointer: pointButton(controller, 'back'),
      },
    ]);
    widgets.resetEntry.setX(
      requireDefined(backButton, 'Missing settings header button', 'BACK').x -
        FOOTER_AUXILIARY_ENTRY_GAP_PX,
    );
    keyboard.addCapture('TAB');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.removeCapture('TAB'));
    const view: SettingsView = {
      ...widgets,
      backButton: requireDefined(backButton, 'Missing settings header button', 'BACK'),
      controlsEntry: chrome.start(widgets.title.getBounds()),
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => controller.close());
    controller.start();
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

  /** 되돌릴 수 없는 동작이라 설정 행과 떨어뜨려 화면 우하단 BACK 옆에 CONTROLS 진입점과 같은 높이로 둔다. */
  private addResetEntry(controller: SettingsController): Phaser.GameObjects.Text {
    const label = this.add
      .text(
        SCREEN_LAYOUT.rightXPx,
        getFooterAuxiliaryCenterYPx(this),
        'RESET',
        typeStyle(AUXILIARY_LABEL_TYPE, COLORS.textSecondary),
      )
      .setOrigin(1, 0.5)
      .setInteractive({ cursor: HOVER_CURSOR });
    bindPointer(label, pointButton(controller, 'resetEntry'));
    return label;
  }

  private createRow(
    row: SettingsRow & RowLayout,
    index: number,
    controller: SettingsController,
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
      onOver: () => controller.hoverRow(index),
      onOut: () => controller.unhoverRow(index),
      onActivate: () => controller.pointRow(index),
    });
    const label = this.add
      .text(
        leftXPx + LABEL_OFFSET_X_PX,
        centerYPx,
        this.formatLabel(row),
        textStyle('secondary', COLORS.textSecondary),
      )
      .setOrigin(0, 0.5);
    const help =
      row.kind === 'inputOffset'
        ? new HelpTip(this, pointButton(controller, 'inputOffsetHelp'), {
            panelTopOffsetPx: label.height / 2 + ROW_HELP_PANEL_GAP_PX,
          })
        : null;
    help?.container.setPosition(label.x + label.width + ROW_HELP_OFFSET_X_PX, centerYPx);

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
          pointer: pointButton(controller, getKeyBoxButton(index)),
        },
      );
      return {
        row,
        index,
        hitArea,
        marker,
        label,
        help,
        control: {
          kind: 'key',
          keyBox,
        },
      };
    }
    const isChoice = isChoiceRow(row);
    const createStep = (
      xPx: number,
      buttonLabel: string,
      direction: ListDirection,
    ): StepControl => {
      const button = new Button(this, xPx, centerYPx - STEP_SIZE_PX / 2, {
        variant: 'secondary',
        focus: 'frame',
        colors: STEP_BUTTON_COLORS,
        labelType: CONTROL_LABEL_TYPE,
        label: buttonLabel,
        widthPx: STEP_SIZE_PX,
        heightPx: STEP_SIZE_PX,
        pointer: pointButton(controller, getStepButton(index, direction)),
      });
      if (isChoice) {
        button.setContent({
          kind: 'icon',
          textureKey: ensureChevronTexture(this, direction),
          sizePx: CHEVRON_SIZE_PX,
        });
      }
      return {
        button,
        direction,
      };
    };
    const steps = [
      createStep(leftXPx + DECREASE_OFFSET_X_PX, '−', 'previous'),
      createStep(leftXPx + INCREASE_OFFSET_X_PX, '+', 'next'),
    ];
    if (row.kind === 'volume') {
      const mute = this.add
        .image(
          leftXPx + MUTE_OFFSET_X_PX + STEP_SIZE_PX / 2,
          centerYPx,
          ensureSpeakerTexture(this, false, STEP_SIZE_PX),
        )
        .setDisplaySize(STEP_SIZE_PX, STEP_SIZE_PX)
        .setInteractive({ cursor: HOVER_CURSOR });
      bindPointer(mute, pointButton(controller, getMuteButton(index)));
      return {
        row,
        index,
        hitArea,
        marker,
        label,
        help,
        control: {
          kind: 'volume',
          meter: this.add.image(leftXPx + VALUE_OFFSET_X_PX, centerYPx, '__DEFAULT'),
          mute,
          steps,
        },
      };
    }
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
      help,
      control: {
        kind: 'step',
        value,
        steps,
      },
    };
  }

  private formatLabel(row: SettingsRow): string {
    switch (row.kind) {
      case 'volume':
        return this.i18n.t(`settings.rows.${row.field}`);
      case 'inputOffset':
      case 'laneMode':
      case 'mvMode':
      case 'language':
        return this.i18n.t(`settings.rows.${row.kind}`);
      case 'scrollSpeed':
        return this.i18n.t('settings.rows.noteSpeed');
      case 'key':
        return this.i18n.t('settings.rows.laneKey', { lane: row.lane + 1 });
    }
  }
}
