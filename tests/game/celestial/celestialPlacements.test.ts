import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  getAtlasPresentation,
  loadCelestialCatalog,
} from '../../../src/game/celestial/celestialCatalog.js';
import {
  CELESTIAL_SCREENS,
  GAMEPLAY_FAILURE_STARS,
} from '../../../src/game/celestial/celestialPlacements.js';
import type {
  AmbientPlacement,
  CelestialScreen,
} from '../../../src/game/celestial/celestialPlacements.js';

const ROOT = new URL('../../../', import.meta.url);
const SCREEN_WIDTH_PX = 1920;
const SCREEN_HEIGHT_PX = 1080;
const AMBIENT_ROLES = new Set(['R11', 'R12', 'R13', 'R27']);
// Settings UI(행 라벨·컨트롤 x160–1040, 제목 y96 부터 힌트 y1000 까지)와 겹치면 안 된다.
const SETTINGS_UI = { left: 160, top: 96, right: 1040, bottom: 1000 };

const BOARDS: readonly [CelestialScreen, string, string][] = [
  ['main', 'main', 'Main'],
  ['songSelect', 'song-select', 'SongSelect'],
  ['result', 'result', 'Result'],
  ['secondary', 'secondary', 'Secondary'],
];

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

async function readBoardAmbient(board: string): Promise<AmbientPlacement[]> {
  const placement = requireObject(
    await readJson(`design/dazbeat/review/screens/${board}-placement.json`),
    board,
  );
  return requireArray(placement['layers'], 'layers')
    .map((layer) => requireObject(layer, 'layer'))
    .filter((layer) => AMBIENT_ROLES.has(String(layer['role'])))
    .map((layer) => {
      const [xPx, yPx] = requireArray(layer['anchorAtScreenPx'], 'anchorAtScreenPx');
      const [scale] = requireArray(layer['scaleXY'], 'scaleXY');
      return {
        id: String(layer['role']),
        xPx: requireNumber(xPx, 'x'),
        yPx: requireNumber(yPx, 'y'),
        scale: requireNumber(scale, 'scale'),
        phaseFraction: requireNumber(layer['phaseOffsetFraction'], 'phase'),
      };
    });
}

async function readSceneApplication(): Promise<JsonObject> {
  return requireObject(await readJson('design/dazbeat/scene-application.json'), 'application');
}

function countRole(ambient: readonly AmbientPlacement[], id: string): number {
  return ambient.filter((placement) => placement.id === id).length;
}

describe('CELESTIAL_SCREENS', () => {
  it.each(BOARDS.filter(([screen]) => screen !== 'secondary'))(
    '%s ambient matches the art-only board layers',
    async (screen, board) => {
      expect(CELESTIAL_SCREENS[screen].ambient).toEqual(await readBoardAmbient(board));
    },
  );

  it('secondary ambient keeps the board except the three moved Settings overlaps', async () => {
    const moved = new Map([
      ['R11@120,254', { xPx: 1760, yPx: 300 }],
      ['R11@315,929', { xPx: 1380, yPx: 180 }],
      ['R13@193,145', { xPx: 1700, yPx: 520 }],
    ]);
    const expected = (await readBoardAmbient('secondary')).map((placement) => ({
      ...placement,
      ...moved.get(`${placement.id}@${placement.xPx},${placement.yPx}`),
    }));
    expect(CELESTIAL_SCREENS.secondary.ambient).toEqual(expected);
  });

  it('declares the layers and dust opacity of each screen', async () => {
    const application = await readSceneApplication();
    BOARDS.forEach(([screen, , applicationKey]) => {
      expect(CELESTIAL_SCREENS[screen].dustOpacity, screen).toBe(
        requireObject(application[applicationKey], applicationKey)['dustOpacity'],
      );
      expect(CELESTIAL_SCREENS[screen].hasGrain, screen).toBe(true);
    });
    expect(CELESTIAL_SCREENS.main.backgroundId).toBe('R01');
    expect(CELESTIAL_SCREENS.songSelect.backgroundId).toBe('R02');
    expect(CELESTIAL_SCREENS.result.backgroundId).toBe('R03');
    expect(CELESTIAL_SCREENS.secondary.backgroundId).toBe('R04');
    expect(CELESTIAL_SCREENS.gameplay).toEqual({
      backgroundId: null,
      hasGrain: false,
      dustOpacity: requireObject(application['Gameplay'], 'Gameplay')['dustOpacity'],
      ambient: [],
    });
  });

  it.each(BOARDS)(
    '%s ambient stays within the scene density limits',
    async (screen, _board, key) => {
      const limits = requireObject((await readSceneApplication())[key], key);
      const { ambient } = CELESTIAL_SCREENS[screen];
      expect(countRole(ambient, 'R11')).toBeLessThanOrEqual(
        requireNumber(limits['smallTwinklesMax'], 'smallTwinklesMax'),
      );
      expect(countRole(ambient, 'R12')).toBeLessThanOrEqual(
        requireNumber(limits['strongCrossMax'], 'strongCrossMax'),
      );
      expect(countRole(ambient, 'R13')).toBeLessThanOrEqual(
        requireNumber(limits['pearlMax'], 'pearlMax'),
      );
      expect(countRole(ambient, 'R27')).toBeLessThanOrEqual(
        screen === 'main'
          ? requireNumber(limits['foregroundPatchesMax'], 'foregroundPatchesMax')
          : 0,
      );
    },
  );

  it('scales every placement within its role scale range', async () => {
    const catalog = await loadCelestialCatalog((url) => readJson(`public${url}`));
    Object.values(CELESTIAL_SCREENS).forEach(({ ambient }) => {
      ambient.forEach(({ id, scale }) => {
        const range = getAtlasPresentation(catalog, id).scaleRange;
        expect(range, id).not.toBeNull();
        expect(scale, id).toBeGreaterThanOrEqual(range?.x[0] ?? Number.NaN);
        expect(scale, id).toBeLessThanOrEqual(range?.x[1] ?? Number.NaN);
        expect(scale, id).toBeGreaterThanOrEqual(range?.y[0] ?? Number.NaN);
        expect(scale, id).toBeLessThanOrEqual(range?.y[1] ?? Number.NaN);
      });
    });
  });

  it.each(BOARDS)(
    '%s ambient stays on screen and outside protected areas',
    async (screen, _board, key) => {
      const protectedAreas = requireObject(
        requireObject((await readSceneApplication())['protectedScreenFractions'], 'protected')[
          key
        ] ?? {},
        key,
      );
      const rects = Object.values(protectedAreas)
        .map((value) => requireArray(value, 'area'))
        // 사각형([left, top, right, bottom] 비율)만 보호 영역이다. 점 목록은 밝기 안내다.
        .filter((area) => area.length === 4 && area.every((edge) => typeof edge === 'number'))
        .map((area) => area.map((edge) => requireNumber(edge, 'edge')));
      CELESTIAL_SCREENS[screen].ambient.forEach(({ id, xPx, yPx }) => {
        const label = `${id}@${xPx},${yPx}`;
        expect(xPx, label).toBeGreaterThanOrEqual(0);
        expect(xPx, label).toBeLessThanOrEqual(SCREEN_WIDTH_PX);
        expect(yPx, label).toBeGreaterThanOrEqual(0);
        expect(yPx, label).toBeLessThanOrEqual(SCREEN_HEIGHT_PX);
        rects.forEach(([left = 0, top = 0, right = 0, bottom = 0]) => {
          const isInside =
            xPx >= left * SCREEN_WIDTH_PX &&
            xPx <= right * SCREEN_WIDTH_PX &&
            yPx >= top * SCREEN_HEIGHT_PX &&
            yPx <= bottom * SCREEN_HEIGHT_PX;
          expect(isInside, label).toBe(false);
        });
      });
    },
  );

  it('keeps secondary ambient outside the Settings UI', () => {
    CELESTIAL_SCREENS.secondary.ambient.forEach(({ id, xPx, yPx }) => {
      const isInside =
        xPx >= SETTINGS_UI.left &&
        xPx <= SETTINGS_UI.right &&
        yPx >= SETTINGS_UI.top &&
        yPx <= SETTINGS_UI.bottom;
      expect(isInside, `${id}@${xPx},${yPx}`).toBe(false);
    });
  });
});

describe('GAMEPLAY_FAILURE_STARS', () => {
  it('uses only R11 within its role scale range', async () => {
    const catalog = await loadCelestialCatalog((url) => readJson(`public${url}`));
    const range = getAtlasPresentation(catalog, 'R11').scaleRange;
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
