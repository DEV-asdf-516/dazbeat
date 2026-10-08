import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURSOR,
  DISABLED_CURSOR,
  DRAG_CURSOR,
  HOVER_CURSOR,
  PRESSED_CURSOR,
} from '../../../src/game/ui/cursor.js';

const CURSOR_SIZE_PX = 32;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const CURSOR_PATTERN = /^url\('([^']+)'\) (\d+) (\d+), ([a-z-]+)$/;

interface ParsedCursor {
  path: string;
  hotspotXPx: number;
  hotspotYPx: number;
  fallback: string;
}

function parseCursor(value: string): ParsedCursor {
  const match = CURSOR_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`Unexpected cursor value: ${value}`);
  }
  const [, path = '', x = '', y = '', fallback = ''] = match;
  return { path, hotspotXPx: Number(x), hotspotYPx: Number(y), fallback };
}

describe.each([
  { name: 'DEFAULT_CURSOR', value: DEFAULT_CURSOR, fallback: 'default' },
  { name: 'HOVER_CURSOR', value: HOVER_CURSOR, fallback: 'pointer' },
  { name: 'PRESSED_CURSOR', value: PRESSED_CURSOR, fallback: 'pointer' },
  { name: 'DRAG_CURSOR', value: DRAG_CURSOR, fallback: 'ew-resize' },
  { name: 'DISABLED_CURSOR', value: DISABLED_CURSOR, fallback: 'not-allowed' },
])('$name', ({ value, fallback }) => {
  it('has the url, hotspot and fallback form', () => {
    expect(value).toMatch(CURSOR_PATTERN);
  });

  it(`falls back to ${fallback}`, () => {
    expect(parseCursor(value).fallback).toBe(fallback);
  });

  it('points to a 32×32 PNG under public', () => {
    const bytes = readFileSync(`public${parseCursor(value).path}`);
    expect([...bytes.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
    expect(bytes.readUInt32BE(IHDR_WIDTH_OFFSET)).toBe(CURSOR_SIZE_PX);
    expect(bytes.readUInt32BE(IHDR_HEIGHT_OFFSET)).toBe(CURSOR_SIZE_PX);
  });

  it('keeps the hotspot inside the image', () => {
    const { hotspotXPx, hotspotYPx } = parseCursor(value);
    for (const coordinatePx of [hotspotXPx, hotspotYPx]) {
      expect(coordinatePx).toBeGreaterThanOrEqual(0);
      expect(coordinatePx).toBeLessThan(CURSOR_SIZE_PX);
    }
  });
});

describe('cursor hotspots', () => {
  it.each([HOVER_CURSOR, PRESSED_CURSOR, DRAG_CURSOR, DISABLED_CURSOR])(
    'are the same as default for %s',
    (value) => {
      const defaultCursor = parseCursor(DEFAULT_CURSOR);
      const cursor = parseCursor(value);
      expect([cursor.hotspotXPx, cursor.hotspotYPx]).toEqual([
        defaultCursor.hotspotXPx,
        defaultCursor.hotspotYPx,
      ]);
    },
  );
});
