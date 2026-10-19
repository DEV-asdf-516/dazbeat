import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadCelestialCatalog } from '../../../src/game/celestial/celestialCatalog.js';
import { GAMEPLAY_FAILURE_STARS } from '../../../src/game/gameplay/failureStars.js';

const ROOT = new URL('../../../', import.meta.url);
const SCREEN_WIDTH_PX = 1920;
const SCREEN_HEIGHT_PX = 1080;

interface JsonObject {
  [key: string]: unknown;
}

function requireObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is not an array`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new Error(`${label} is not a number`);
  }
  return value;
}

function readJson(path: string): Promise<unknown> {
  return readFile(new URL(path, ROOT), 'utf8').then((text): unknown => JSON.parse(text));
}

async function readSceneApplication(): Promise<JsonObject> {
  return requireObject(await readJson('design/dazbeat/scene-application.json'), 'application');
}

describe('GAMEPLAY_FAILURE_STARS', () => {
  it('uses only R11 within its role scale range', async () => {
    const catalog = await loadCelestialCatalog((url) => readJson(`public${url}`));
    const range = catalog.atlasPresentations.R11.scaleRange;
    expect(range).not.toBeNull();
    expect(GAMEPLAY_FAILURE_STARS).toHaveLength(10);
    GAMEPLAY_FAILURE_STARS.forEach(({ id, xPx, yPx, scale }) => {
      const label = `${id}@${xPx},${yPx}`;
      expect(id, label).toBe('R11');
      expect(scale, label).toBeGreaterThanOrEqual(range?.x[0] ?? Number.NaN);
      expect(scale, label).toBeLessThanOrEqual(range?.x[1] ?? Number.NaN);
      expect(scale, label).toBeGreaterThanOrEqual(range?.y[0] ?? Number.NaN);
      expect(scale, label).toBeLessThanOrEqual(range?.y[1] ?? Number.NaN);
    });
  });

  it('stays on screen and outside the Gameplay lanes', async () => {
    const protectedAreas = requireObject(
      (await readSceneApplication())['protectedScreenFractions'],
      'protected',
    );
    const [left = 0, top = 0, right = 0, bottom = 0] = requireArray(
      requireObject(protectedAreas['Gameplay'], 'Gameplay')['lanes'],
      'lanes',
    ).map((edge) => requireNumber(edge, 'edge'));
    GAMEPLAY_FAILURE_STARS.forEach(({ id, xPx, yPx }) => {
      const label = `${id}@${xPx},${yPx}`;
      expect(xPx, label).toBeGreaterThanOrEqual(0);
      expect(xPx, label).toBeLessThanOrEqual(SCREEN_WIDTH_PX);
      expect(yPx, label).toBeGreaterThanOrEqual(0);
      expect(yPx, label).toBeLessThanOrEqual(SCREEN_HEIGHT_PX);
      const isInsideLanes =
        xPx >= left * SCREEN_WIDTH_PX &&
        xPx <= right * SCREEN_WIDTH_PX &&
        yPx >= top * SCREEN_HEIGHT_PX &&
        yPx <= bottom * SCREEN_HEIGHT_PX;
      expect(isInsideLanes, label).toBe(false);
    });
  });
});
