import { describe, expect, it } from 'vitest';
import type { Language } from '../../../src/i18n/language.js';
import { SettingsController } from '../../../src/game/settings/SettingsController.js';
import type { SettingsRow } from '../../../src/game/settings/state/settingsAdjust.js';
import {
  getKeyBoxButton,
  getMuteButton,
  getStepButton,
} from '../../../src/game/settings/state/settingsEditorState.js';
import type {
  SettingsButton,
  SettingsEditorState,
} from '../../../src/game/settings/state/settingsEditorState.js';
import { requireDefined } from '../../../src/invariant.js';
import { DEFAULT_SETTINGS } from '../../../src/storage/settings.js';
import type { Settings } from '../../../src/storage/settings.js';
import type { SoundEffect } from '../../../src/game/ui/view/soundEffects.js';

// 0: 배경음 볼륨, 1~2: 키 lane 0~1, 3: 언어, 4: 효과음 볼륨
const ROWS: readonly SettingsRow[] = [
  {
    kind: 'volume',
    field: 'backgroundVolume',
  },
  {
    kind: 'key',
    lane: 0,
  },
  {
    kind: 'key',
    lane: 1,
  },
  { kind: 'language' },
  {
    kind: 'volume',
    field: 'effectVolume',
  },
];
const VOLUME_INDEX = 0;
const KEY_INDEX = 1;
const LANGUAGE_INDEX = 3;
const EFFECT_VOLUME_INDEX = 4;

interface Pending<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type Event =
  | { readonly kind: 'save'; readonly settings: Settings }
  | { readonly kind: 'sound'; readonly sound: SoundEffect; readonly settings: Settings }
  | {
      readonly kind: 'render';
      readonly previous: SettingsEditorState | null;
      readonly next: SettingsEditorState;
    };

interface Harness {
  readonly controller: SettingsController;
  readonly events: Event[];
  readonly languageChanges: { readonly language: Language; readonly response: Pending<void> }[];
  readonly backgroundVolumes: Settings[];
  failSave(): void;
  leaveCount(): number;
  profileOpenCount(): number;
  clickSoundCount(): number;
  closeSoundCount(): number;
  renders(): Extract<Event, { kind: 'render' }>[];
  lastRender(): Extract<Event, { kind: 'render' }>;
}

function createHarness(): Harness {
  let profileOpenCount = 0;
  const events: Event[] = [];
  const languageChanges: { language: Language; response: Pending<void> }[] = [];
  const backgroundVolumes: Settings[] = [];
  let isSaveFailing = false;
  let leaveCount = 0;
  const controller = new SettingsController(
    {
      save: {
        saveSettings: (settings) => {
          if (isSaveFailing) {
            throw new Error('Storage is full');
          }
          events.push({
            kind: 'save',
            settings,
          });
        },
      },
      changeLanguage: (language) => {
        const response = pending<void>();
        languageChanges.push({
          language,
          response,
        });
        return response.promise;
      },
    },
    {
      render: (previous, next) =>
        events.push({
          kind: 'render',
          previous,
          next,
        }),
      playSound: (sound, settings) =>
        events.push({
          kind: 'sound',
          sound,
          settings,
        }),
      setBackgroundVolume: (settings) => backgroundVolumes.push(settings),
      leave: () => {
        leaveCount += 1;
      },
      openProfile: () => {
        profileOpenCount += 1;
      },
    },
    ROWS,
    DEFAULT_SETTINGS,
    'ko',
  );
  const renders = () =>
    events.filter((event): event is Extract<Event, { kind: 'render' }> => event.kind === 'render');
  return {
    controller,
    events,
    languageChanges,
    backgroundVolumes,
    failSave: () => {
      isSaveFailing = true;
    },
    leaveCount: () => leaveCount,
    profileOpenCount: () => profileOpenCount,
    clickSoundCount: () => countSounds(events, 'click'),
    closeSoundCount: () => countSounds(events, 'close'),
    renders,
    lastRender: () => requireDefined(renders().at(-1), 'Missing render', events.length),
  };
}

function countSounds(events: readonly Event[], sound: SoundEffect): number {
  return events.filter((event) => event.kind === 'sound' && event.sound === sound).length;
}

function kinds(events: readonly Event[]): string[] {
  return events.map(({ kind }) => kind);
}

function click(harness: Harness, button: SettingsButton): void {
  harness.controller.pointerDown(button);
  harness.controller.pointerUp(button);
}

describe('SettingsController', () => {
  it('renders the first state once without saving or sounds', () => {
    const harness = createHarness();

    expect(kinds(harness.events)).toEqual(['render']);
    expect(harness.lastRender().previous).toBeNull();
  });

  it('only renders when the hover changes', () => {
    const harness = createHarness();

    harness.controller.hoverRow(KEY_INDEX);

    expect(kinds(harness.events)).toEqual(['render', 'render']);
    expect(harness.languageChanges).toEqual([]);
  });

  it('saves, plays the focus sound with the next settings and renders when another row is adjusted', () => {
    const harness = createHarness();
    harness.controller.handleMenuKey('down');
    harness.events.length = 0;

    click(harness, getStepButton(VOLUME_INDEX, -1));

    expect(kinds(harness.events)).toEqual(['render', 'render', 'save', 'sound', 'sound', 'render']);
    const sound = requireDefined(harness.events[3], 'Missing focus sound', 3);
    expect(sound.kind === 'sound' && sound.sound).toBe('menuFocus');
    expect(sound.kind === 'sound' && sound.settings.backgroundVolume).toBe(0.9);
  });

  it('saves and renders with only the click sound when the focused row is adjusted', () => {
    const harness = createHarness();

    click(harness, getStepButton(VOLUME_INDEX, -1));

    expect(kinds(harness.events)).toEqual([
      'render',
      'render',
      'render',
      'save',
      'sound',
      'render',
    ]);
    expect(harness.clickSoundCount()).toBe(1);
  });

  it('applies the background volume right away when it changes', () => {
    const harness = createHarness();

    click(harness, getStepButton(VOLUME_INDEX, -1));

    expect(harness.backgroundVolumes.map(({ backgroundVolume }) => backgroundVolume)).toEqual([
      0.9,
    ]);
  });

  it('leaves the background volume alone when another setting changes', () => {
    const harness = createHarness();

    click(harness, getStepButton(EFFECT_VOLUME_INDEX, -1));
    click(harness, getStepButton(LANGUAGE_INDEX, 1));

    expect(harness.events.filter(({ kind }) => kind === 'save')).toHaveLength(2);
    expect(harness.backgroundVolumes).toEqual([]);
  });

  it('mutes a volume from its speaker and keeps the volume for when it is unmuted', () => {
    const harness = createHarness();

    click(harness, getMuteButton(VOLUME_INDEX));
    click(harness, getMuteButton(VOLUME_INDEX));

    expect(
      harness.events.flatMap((event) =>
        event.kind === 'save'
          ? [[event.settings.mutedVolumes, event.settings.backgroundVolume]]
          : [],
      ),
    ).toEqual([
      [['backgroundVolume'], 1],
      [[], 1],
    ]);
    expect(harness.backgroundVolumes.map(({ mutedVolumes }) => mutedVolumes)).toEqual([
      ['backgroundVolume'],
      [],
    ]);
  });

  it('toggles the mute of the focused volume row with confirm', () => {
    const harness = createHarness();
    harness.controller.pointRow(EFFECT_VOLUME_INDEX);

    harness.controller.handleMenuKey('confirm');

    expect(harness.lastRender().next.settings.mutedVolumes).toEqual(['effectVolume']);
    expect(harness.backgroundVolumes).toEqual([]);
  });

  it('unmutes a volume when it is adjusted', () => {
    const harness = createHarness();
    click(harness, getMuteButton(VOLUME_INDEX));

    click(harness, getStepButton(VOLUME_INDEX, -1));

    const { settings } = harness.lastRender().next;
    expect(settings.mutedVolumes).toEqual([]);
    expect(settings.backgroundVolume).toBe(0.9);
  });

  it('does nothing when the setting cannot change further', () => {
    const harness = createHarness();

    click(harness, getStepButton(VOLUME_INDEX, 1));

    expect(kinds(harness.events)).toEqual(['render']);
  });

  it('changes the language and renders the displayed language when the change finishes', async () => {
    const harness = createHarness();

    click(harness, getStepButton(LANGUAGE_INDEX, 1));

    expect(harness.languageChanges.map(({ language }) => language)).toEqual(['ja']);
    expect(harness.lastRender().next.displayedLanguage).toBe('ko');
    const rendersBefore = harness.renders().length;

    requireDefined(harness.languageChanges[0], 'Missing language change', 0).response.resolve();
    await flush();

    expect(harness.renders()).toHaveLength(rendersBefore + 1);
    expect(harness.lastRender().next.displayedLanguage).toBe('ja');
  });

  it('does not render when the language change fails', async () => {
    const harness = createHarness();
    click(harness, getStepButton(LANGUAGE_INDEX, 1));
    const rendersBefore = harness.renders().length;

    requireDefined(harness.languageChanges[0], 'Missing language change', 0).response.reject(
      new Error('Failed to load messages'),
    );
    await flush();

    expect(harness.renders()).toHaveLength(rendersBefore);
  });

  it('does not render a language change that finishes after close', async () => {
    const harness = createHarness();
    click(harness, getStepButton(LANGUAGE_INDEX, 1));
    const rendersBefore = harness.renders().length;

    harness.controller.close();
    requireDefined(harness.languageChanges[0], 'Missing language change', 0).response.resolve();
    await flush();

    expect(harness.renders()).toHaveLength(rendersBefore);
  });

  it('renders even when saving throws', () => {
    const harness = createHarness();
    harness.failSave();

    click(harness, getStepButton(VOLUME_INDEX, -1));

    expect(harness.renders()).toHaveLength(4);
    expect(harness.lastRender().next.settings.backgroundVolume).toBe(0.9);
  });

  it('saves a key pressed while waiting for a key', () => {
    const harness = createHarness();
    click(harness, getKeyBoxButton(KEY_INDEX));
    harness.events.length = 0;

    expect(
      harness.controller.captureKey({
        code: 'KeyA',
        repeat: false,
      }),
    ).toBe(true);

    expect(kinds(harness.events)).toEqual(['save', 'sound', 'render']);
  });

  it('only cancels waiting on a pointer action', () => {
    const harness = createHarness();
    click(harness, getKeyBoxButton(KEY_INDEX));
    harness.events.length = 0;

    click(harness, getStepButton(VOLUME_INDEX, -1));

    expect(kinds(harness.events)).toEqual(['render', 'render', 'sound', 'render']);
    expect(harness.closeSoundCount()).toBe(1);
    expect(harness.lastRender().next.mode).toEqual({ kind: 'browsing' });
    expect(harness.lastRender().next.settings).toBe(DEFAULT_SETTINGS);
  });

  it('saves when the reset is accepted', () => {
    const harness = createHarness();
    click(harness, getStepButton(VOLUME_INDEX, -1));
    click(harness, 'resetEntry');
    harness.events.length = 0;

    click(harness, 'resetAccept');

    expect(kinds(harness.events)).toEqual(['render', 'render', 'save', 'sound', 'render']);
  });

  it('leaves on back while browsing', () => {
    const harness = createHarness();

    harness.controller.back();

    expect(harness.leaveCount()).toBe(1);
  });

  it('cancels the prompt on back while asking', () => {
    const harness = createHarness();
    click(harness, getKeyBoxButton(KEY_INDEX));

    harness.controller.back();

    expect(harness.leaveCount()).toBe(0);
    expect(harness.lastRender().next.mode).toEqual({ kind: 'browsing' });
  });
});

const H_KEY = {
  code: 'KeyH',
  repeat: false,
};
const ESCAPE_KEY = {
  code: 'Escape',
  repeat: false,
};
const DOWN_KEY = {
  code: 'ArrowDown',
  repeat: false,
};

describe('SettingsController prompt sounds', () => {
  it('plays the click sound on opening a prompt and the close sound on cancelling it', () => {
    const harness = createHarness();

    click(harness, 'resetEntry');
    click(harness, 'resetCancel');
    harness.controller.pointRow(KEY_INDEX);
    harness.controller.handleMenuKey('confirm');
    harness.controller.captureKey({
      code: 'Escape',
      repeat: false,
    });

    expect(harness.clickSoundCount()).toBe(2);
    expect(harness.closeSoundCount()).toBe(2);
  });

  it('plays the click sound when a key binding or a reset changes the settings', () => {
    const harness = createHarness();
    harness.controller.pointRow(KEY_INDEX);
    harness.controller.handleMenuKey('confirm');

    harness.controller.captureKey({
      code: 'KeyZ',
      repeat: false,
    });
    click(harness, 'resetEntry');
    click(harness, 'resetAccept');

    expect(harness.clickSoundCount()).toBe(4);
    expect(harness.closeSoundCount()).toBe(0);
  });

  it('plays the click sound on H and the close sound on closing the controls or leaving', () => {
    const harness = createHarness();

    harness.controller.handleControlsKey(H_KEY);
    harness.controller.handleControlsKey(H_KEY);
    harness.controller.back();

    expect(harness.clickSoundCount()).toBe(1);
    expect(harness.closeSoundCount()).toBe(2);
    expect(harness.leaveCount()).toBe(1);
  });
});

describe('SettingsController key click sound', () => {
  it('plays the click sound when left, right or Enter changes the focused row', () => {
    const harness = createHarness();

    harness.controller.handleMenuKey('left');
    harness.controller.handleMenuKey('right');
    harness.controller.handleMenuKey('confirm');
    harness.controller.handleMenuKey('down');

    expect(harness.clickSoundCount()).toBe(3);
  });

  it('stays silent when the key changes nothing', () => {
    const harness = createHarness();
    harness.controller.handleMenuKey('right');
    harness.controller.handleMenuKey('down');

    harness.controller.handleMenuKey('left');
    harness.controller.handleMenuKey('right');

    expect(harness.lastRender().next.rowIndex).toBe(KEY_INDEX);
    expect(harness.clickSoundCount()).toBe(0);
  });
});

describe('SettingsController controls', () => {
  it('opens with H, closes with H and Esc, and blocks other keys while open', () => {
    const harness = createHarness();
    const isOpen = (): boolean => harness.lastRender().next.isControlsOpen;

    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(false);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(isOpen()).toBe(true);
    expect(harness.controller.handleControlsKey(DOWN_KEY)).toBe(true);
    expect(harness.controller.handleControlsKey(H_KEY)).toBe(true);
    expect(isOpen()).toBe(false);
    harness.controller.openControls();
    expect(harness.controller.handleControlsKey(ESCAPE_KEY)).toBe(true);
    expect(isOpen()).toBe(false);
  });
});

describe('SettingsController button pointer', () => {
  it('runs the button once for over, down and up on it', () => {
    const harness = createHarness();

    harness.controller.pointerOver('back');
    harness.controller.pointerDown('back');
    harness.controller.pointerUp('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(1);
  });

  it('does not run the button for an up that was pressed elsewhere', () => {
    const harness = createHarness();

    harness.controller.pointerOver(getStepButton(VOLUME_INDEX, -1));
    harness.controller.pointerUp(getStepButton(VOLUME_INDEX, -1));

    expect(harness.lastRender().next.settings).toBe(DEFAULT_SETTINGS);
  });

  it('ignores a press on an adjust button that cannot change the setting', () => {
    const harness = createHarness();
    const renderCount = harness.renders().length;

    harness.controller.pointerDown(getStepButton(VOLUME_INDEX, 1));

    expect(harness.renders()).toHaveLength(renderCount);
  });

  it('releases the press when the pointer leaves the button', () => {
    const harness = createHarness();

    harness.controller.pointerDown('back');
    harness.controller.pointerOut('back');
    harness.controller.pointerUp('back');

    expect(harness.leaveCount()).toBe(0);
    expect(harness.lastRender().next.hover).toBeNull();
  });

  it('releases the press of an adjust button that the keys make unusable', () => {
    const harness = createHarness();
    click(harness, getStepButton(VOLUME_INDEX, -1));
    harness.controller.pointerDown(getStepButton(VOLUME_INDEX, 1));

    harness.controller.handleMenuKey('right');
    harness.controller.handleMenuKey('left');
    harness.controller.pointerUp(getStepButton(VOLUME_INDEX, 1));

    expect(harness.lastRender().next.settings.backgroundVolume).toBe(0.9);
  });

  it('releases the hover of the dialog buttons when the reset dialog closes', () => {
    const harness = createHarness();
    click(harness, 'resetEntry');
    harness.controller.pointerOver('resetCancel');

    harness.controller.back();

    expect(harness.lastRender().next.hover).toBeNull();
  });

  it('releases the hover of the close button when the controls close', () => {
    const harness = createHarness();
    harness.controller.openControls();
    harness.controller.pointerOver('controlsClose');

    harness.controller.handleControlsKey(ESCAPE_KEY);

    expect(harness.lastRender().next.hover).toBeNull();
  });

  it('opens the profile from the account panel', () => {
    const harness = createHarness();

    harness.controller.pointerDown('accountProfile');
    harness.controller.pointerUp('accountProfile');
    expect(harness.profileOpenCount()).toBe(1);

    expect(harness.leaveCount()).toBe(0);
    expect(harness.clickSoundCount()).toBe(1);
  });
});
