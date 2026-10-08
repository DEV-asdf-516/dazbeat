import { describe, expect, it } from 'vitest';
import {
  handleEachEventOnce,
  readKeyCapture,
  readMenuAction,
  toMenuAction,
} from '../../../src/game/ui/menuInput.js';
import type { MenuAction } from '../../../src/game/ui/menuInput.js';

const MENU_KEYS: readonly [string, MenuAction][] = [
  ['ArrowUp', 'up'],
  ['KeyW', 'up'],
  ['ArrowDown', 'down'],
  ['KeyS', 'down'],
  ['ArrowLeft', 'left'],
  ['KeyA', 'left'],
  ['ArrowRight', 'right'],
  ['KeyD', 'right'],
  ['Enter', 'confirm'],
  ['Escape', 'back'],
];

const UNMAPPED_KEYS = ['KeyQ', 'KeyE', 'Tab', 'KeyF', 'Space', ''];

describe('toMenuAction', () => {
  it.each(MENU_KEYS)('maps %s to %s', (code, action) => {
    expect(toMenuAction(code)).toBe(action);
  });

  it.each(UNMAPPED_KEYS)('maps %j to null', (code) => {
    expect(toMenuAction(code)).toBeNull();
  });
});

describe('readMenuAction', () => {
  it.each(MENU_KEYS)('reads non-repeated %s as %s', (code, action) => {
    expect(readMenuAction({ code, repeat: false })).toBe(action);
  });

  it.each(UNMAPPED_KEYS)('reads non-repeated %j as null', (code) => {
    expect(readMenuAction({ code, repeat: false })).toBeNull();
  });

  it.each(MENU_KEYS.filter(([, action]) => action !== 'confirm' && action !== 'back'))(
    'keeps repeated %s as %s',
    (code, action) => {
      expect(readMenuAction({ code, repeat: true })).toBe(action);
    },
  );

  it.each(['Enter', 'Escape', ...UNMAPPED_KEYS])('reads repeated %j as null', (code) => {
    expect(readMenuAction({ code, repeat: true })).toBeNull();
  });
});

describe('readKeyCapture', () => {
  it.each(['Enter', 'KeyF', 'Escape'])('reads non-repeated %s as its code', (code) => {
    expect(readKeyCapture({ code, repeat: false })).toBe(code);
  });

  it.each(['Enter', 'KeyF', 'Escape'])('reads repeated %s as null', (code) => {
    expect(readKeyCapture({ code, repeat: true })).toBeNull();
  });
});

describe('handleEachEventOnce', () => {
  it('calls the handler once for the same event object', () => {
    const received: object[] = [];
    const handle = handleEachEventOnce((event: object) => received.push(event));
    const event = {};
    handle(event);
    handle(event);
    expect(received).toEqual([event]);
  });

  it('calls the handler for each different event object', () => {
    const received: object[] = [];
    const handle = handleEachEventOnce((event: object) => received.push(event));
    const first = {};
    const second = {};
    handle(first);
    handle(second);
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(first);
    expect(received[1]).toBe(second);
  });

  it('does not share handled events between wrapped handlers', () => {
    const received: string[] = [];
    const handleA = handleEachEventOnce(() => received.push('a'));
    const handleB = handleEachEventOnce(() => received.push('b'));
    const event = {};
    handleA(event);
    handleB(event);
    expect(received).toEqual(['a', 'b']);
  });
});
