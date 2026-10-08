import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  getAtlasPresentation,
  getImagePresentation,
  loadCelestialCatalog,
} from '../../../src/game/celestial/celestialCatalog.js';
import type { CelestialCatalog } from '../../../src/game/celestial/celestialCatalog.js';

const ROOT = new URL('../../../', import.meta.url);
const MANIFEST_URL = '/assets/ui/celestial-manifest.json';
const SEQUENCES_URL = '/assets/ui/constellation/constellation-sequences.json';
const REGIONS_URLS = {
  A: '/assets/ui/celestial/animations/celestial-ambient-atlas.regions.json',
  C: '/assets/ui/constellation/constellation-atlas.regions.json',
  T: '/assets/ui/transition/transition-atlas.regions.json',
} as const;

function readPublicJson(url: string): Promise<unknown> {
  return readFile(new URL(`public${url}`, ROOT), 'utf8').then((text): unknown => JSON.parse(text));
}

interface JsonObject {
  [key: string]: unknown;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is not an array`);
  }
  return value;
}

async function readManifestRoles(): Promise<{ manifest: JsonObject; roles: JsonObject[] }> {
  const manifest = requireObject(await readPublicJson(MANIFEST_URL), 'manifest');
  const roles = requireArray(manifest['roles'], 'roles').map((role, index) =>
    requireObject(role, `roles[${index}]`),
  );
  return { manifest, roles };
}

function findRole(roles: readonly JsonObject[], id: string): JsonObject {
  const role = roles.find((candidate) => candidate['id'] === id);
  if (role === undefined) {
    throw new Error(`Missing role ${id}`);
  }
  return role;
}

async function readRegionFrameCount(regionsUrl: string, state: string): Promise<number> {
  const regions = requireObject(await readPublicJson(regionsUrl), regionsUrl);
  const states = requireObject(regions['states'], 'states');
  const region = requireObject(states[state], state);
  return requireArray(region['frames'], 'frames').length;
}

/** url 의 실제 JSON 을 `edit` 으로 바꾼 사본을 돌려주는 fetchJson 을 만든다. */
function fetchWithEdit(
  targetUrl: string,
  edit: (json: JsonObject) => void,
): (url: string) => Promise<unknown> {
  return async (url) => {
    const json = await readPublicJson(url);
    if (url !== targetUrl) {
      return json;
    }
    const copy = requireObject(structuredClone(json), url);
    edit(copy);
    return copy;
  };
}

function editRole(id: string, edit: (role: JsonObject) => void): (manifest: JsonObject) => void {
  return (manifest) => {
    const roles = requireArray(manifest['roles'], 'roles');
    const role = roles
      .map((entry) => requireObject(entry, 'role'))
      .find((entry) => entry['id'] === id);
    if (role === undefined) {
      throw new Error(`Missing role ${id}`);
    }
    edit(role);
  };
}

function toPublicUrl(path: unknown): string {
  const text = String(path);
  if (!text.startsWith('public/')) {
    throw new Error(`${text} does not start with public/`);
  }
  return `/${text.slice('public/'.length)}`;
}

function requireNumbers(value: unknown, label: string): number[] {
  return requireArray(value, label).map((entry) => Number(entry));
}

interface AtlasFamily {
  imageUrl: string;
  states: JsonObject;
}

async function readAtlasFamilies(manifest: JsonObject): Promise<Map<string, AtlasFamily>> {
  const atlases = requireObject(manifest['atlases'], 'atlases');
  const families = new Map<string, AtlasFamily>();
  for (const [family, entry] of Object.entries(atlases)) {
    const atlas = requireObject(entry, family);
    const regions = requireObject(await readPublicJson(toPublicUrl(atlas['regions'])), family);
    families.set(family, {
      imageUrl: toPublicUrl(requireObject(atlas['image'], 'image')['path']),
      states: requireObject(regions['states'], 'states'),
    });
  }
  return families;
}

function loadCatalog(): Promise<CelestialCatalog> {
  return loadCelestialCatalog(readPublicJson);
}

describe('loadCelestialCatalog', () => {
  it('matches the SHA256 of every file listed in the manifest', async () => {
    const { manifest } = await readManifestRoles();
    const files = requireArray(manifest['files'], 'files').map((file) =>
      requireObject(file, 'file'),
    );
    expect(files).toHaveLength(34);
    for (const file of files) {
      const path = String(file['path']);
      const bytes = await readFile(new URL(path, ROOT));
      expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(file['sha256']);
    }
  });

  it('builds presentations for R01–R50 except composed sequences, plus C:node-played', async () => {
    const catalog = await loadCatalog();
    const expectedIds = [
      ...Array.from({ length: 50 }, (_unused, index) => `R${String(index + 1).padStart(2, '0')}`),
      'C:node-played',
    ].filter((id) => id !== 'R24' && id !== 'R43');
    expect([...catalog.presentations.keys()].sort()).toEqual(expectedIds.sort());
    const imageIds = [...catalog.presentations]
      .filter(([, presentation]) => presentation.kind === 'image')
      .map(([id]) => id)
      .sort();
    expect(imageIds).toEqual(['R01', 'R02', 'R03', 'R04', 'R05', 'R50']);
  });

  it('lists 9 textures with unique URLs and keys', async () => {
    const catalog = await loadCatalog();
    expect(catalog.textures).toHaveLength(9);
    expect(new Set(catalog.textures.map(({ url }) => url)).size).toBe(9);
    expect(new Set(catalog.textures.map(({ key }) => key)).size).toBe(9);
    // 모든 화면 배경(R01–R04)이 같은 성운·궤도 이미지를 공유하므로 텍스처도 하나다.
    const mainKey = getImagePresentation(catalog, 'R01').textureKey;
    ['R02', 'R03', 'R04'].forEach((id) =>
      expect(getImagePresentation(catalog, id).textureKey, id).toBe(mainKey),
    );
    catalog.textures.forEach(({ url }) => expect(url.startsWith('/assets/ui/')).toBe(true));
  });

  it('uses the actual region frame order and the role frame durations', async () => {
    const catalog = await loadCatalog();
    const { roles } = await readManifestRoles();
    const cases: readonly [string, string, string, readonly number[]][] = [
      ['R28', REGIONS_URLS.A, 'twinkle-cross', [13, 14, 13, 13, 14, 13, 13, 14, 13, 13, 14, 13]],
      ['R32', REGIONS_URLS.A, 'twinkle-cross', Array<number>(12).fill(10)],
      ['R25', REGIONS_URLS.A, 'glint-sweep', Array<number>(8).fill(30)],
      ['R37', REGIONS_URLS.A, 'glint-sweep', Array<number>(8).fill(30)],
      ['R38', REGIONS_URLS.A, 'glint-sweep', Array<number>(8).fill(20)],
      ['R40', REGIONS_URLS.A, 'glint-sweep', Array<number>(8).fill(50)],
      ['R47', REGIONS_URLS.A, 'twinkle-small', Array<number>(12).fill(100)],
      ['R11', REGIONS_URLS.A, 'twinkle-small', Array<number>(12).fill(167)],
      [
        'R34',
        '/assets/ui/gameplay/gameplay-effects-atlas.regions.json',
        'hit-flare',
        Array<number>(8).fill(17),
      ],
    ];
    for (const [id, regionsUrl, state, durationsMs] of cases) {
      const presentation = getAtlasPresentation(catalog, id);
      const frameCount = await readRegionFrameCount(regionsUrl, state);
      expect(
        presentation.frames.map(({ durationMs }) => durationMs),
        id,
      ).toEqual(durationsMs);
      expect(presentation.frames).toHaveLength(frameCount);
      const frameNames = presentation.frames.map(({ frameName }) => frameName);
      const atlasFrames = catalog.atlasFrames.find(
        ({ textureKey }) => textureKey === presentation.textureKey,
      );
      const stateFrames = atlasFrames?.frames.filter(({ frameName }) =>
        frameName.startsWith(`${state}#`),
      );
      expect(
        stateFrames?.map(({ frameName }) => frameName),
        id,
      ).toEqual(frameNames);
      expect(String(findRole(roles, id)['resource']), id).toMatch(new RegExp(`:${state}$`));
    }
  });

  it('maps every atlas role to its resource frames in region order with role durations', async () => {
    const catalog = await loadCatalog();
    const { manifest, roles } = await readManifestRoles();
    const families = await readAtlasFamilies(manifest);
    const atlasRoles = roles.filter(
      (candidate) => candidate['kind'] === 'atlas-region' || candidate['kind'] === 'atlas-clip',
    );
    expect(atlasRoles).toHaveLength(42);
    for (const atlasRole of atlasRoles) {
      const id = String(atlasRole['id']);
      const [family, state] = String(atlasRole['resource']).split(':');
      const source = families.get(String(family));
      const regionFrames = requireArray(
        requireObject(source?.states[String(state)], `${id} state`)['frames'],
        `${id} frames`,
      );
      const presentation = getAtlasPresentation(catalog, id);
      const textureKey = catalog.textures.find(({ url }) => url === source?.imageUrl)?.key;
      expect(presentation.textureKey, id).toBe(textureKey);
      expect(
        presentation.frames.map(({ frameName }) => frameName),
        id,
      ).toEqual(regionFrames.map((_frame, index) => `${String(state)}#${index}`));
      const durationsMs = atlasRole['frameDurationsMs'];
      expect(
        presentation.frames.map(({ durationMs }) => durationMs),
        id,
      ).toEqual(durationsMs === null ? [0] : requireNumbers(durationsMs, `${id} durations`));
    }
  });

  it('maps every atlas frame rectangle to the actual regions data', async () => {
    const catalog = await loadCatalog();
    const { manifest } = await readManifestRoles();
    const families = await readAtlasFamilies(manifest);
    expect(catalog.atlasFrames).toHaveLength(families.size);
    for (const [family, { imageUrl, states }] of families) {
      const textureKey = catalog.textures.find(({ url }) => url === imageUrl)?.key;
      const actual = catalog.atlasFrames
        .find((entry) => entry.textureKey === textureKey)
        ?.frames.map(({ frameName, xPx, yPx, widthPx, heightPx }) => [
          frameName,
          xPx,
          yPx,
          widthPx,
          heightPx,
        ]);
      const expected = Object.entries(states).flatMap(([state, region]) =>
        requireArray(requireObject(region, state)['frames'], `${state} frames`).map(
          (frame, index) => {
            const { x, y, w, h } = requireObject(frame, 'frame');
            return [`${state}#${index}`, x, y, w, h];
          },
        ),
      );
      expect(actual, family).toEqual(expected);
    }
  });

  it('keeps atlas frame rectangles in region order', async () => {
    const catalog = await loadCatalog();
    const regions = requireObject(await readPublicJson(REGIONS_URLS.C), 'regions');
    const states = requireObject(regions['states'], 'states');
    const ignite = requireArray(requireObject(states['node-ignite'], 'node-ignite')['frames'], 'f');
    const textureFrames = catalog.atlasFrames.find(({ textureKey }) =>
      textureKey.includes('constellation-atlas'),
    );
    const igniteFrames = textureFrames?.frames.filter(({ frameName }) =>
      frameName.startsWith('node-ignite#'),
    );
    expect(
      igniteFrames?.map(({ xPx, yPx, widthPx, heightPx }) => ({
        x: xPx,
        y: yPx,
        w: widthPx,
        h: heightPx,
      })),
    ).toEqual(
      ignite.map((frame) => {
        const { x, y, w, h } = requireObject(frame, 'frame');
        return { x, y, w, h };
      }),
    );
  });

  it('distinguishes loop, one-shot and static roles', async () => {
    const catalog = await loadCatalog();
    const loopIds = [...catalog.presentations]
      .filter(([, presentation]) => presentation.kind === 'atlas' && presentation.isLoop)
      .map(([id]) => id)
      .sort();
    expect(loopIds).toEqual(['R11', 'R12', 'R13', 'R14', 'R27', 'R29', 'R47']);
    ['R06', 'R15', 'R18', 'R20', 'R26', 'R30', 'R49', 'C:node-played'].forEach((id) => {
      expect(getAtlasPresentation(catalog, id).frames, id).toHaveLength(1);
    });
    expect(getAtlasPresentation(catalog, 'R25').isLoop).toBe(false);
    expect(getAtlasPresentation(catalog, 'R25').frames.length).toBeGreaterThan(1);
  });

  it('derives origin, scale and opacity from the role contract', async () => {
    const catalog = await loadCatalog();
    ['R20', 'R21', 'R22', 'R23'].forEach((id) => {
      expect(getAtlasPresentation(catalog, id).originXY, id).toEqual([8 / 256, 128 / 256]);
    });
    expect(getAtlasPresentation(catalog, 'R33').originXY).toEqual([129 / 256, 224 / 256]);
    expect(getAtlasPresentation(catalog, 'R34').originXY).toEqual([128 / 256, 142 / 256]);
    ['R06', 'R07', 'R08', 'R09', 'R10', 'R48'].forEach((id) => {
      expect(getAtlasPresentation(catalog, id).originXY, id).toEqual([0.5, 0.5]);
    });
    ['R26', 'R44', 'R45', 'R46'].forEach((id) => {
      expect(getAtlasPresentation(catalog, id).originXY, id).toEqual([0.5, 0.5]);
    });
    expect(getAtlasPresentation(catalog, 'R17').scaleXY).toEqual([0.171875, 0.171875]);
    expect(getAtlasPresentation(catalog, 'R20').scaleXY).toEqual([1, 1]);
    expect(getAtlasPresentation(catalog, 'R20').scaleRange).toEqual({
      x: [0.25, 3],
      y: [0.75, 1.5],
    });
    expect(getAtlasPresentation(catalog, 'R11').scaleRange).toEqual({
      x: [0.046875, 0.125],
      y: [0.046875, 0.125],
    });
    const played = getAtlasPresentation(catalog, 'C:node-played');
    expect(played.scaleXY).toEqual([0.140625, 0.140625]);
    expect(played.opacity).toBe(1);
    expect(played.originXY).toEqual([0.5, 0.5]);
    expect(getImagePresentation(catalog, 'R50').opacity).toBe(0.018);
  });

  it('expands constellation-finish with the node-only fallback', async () => {
    const catalog = await loadCatalog();
    expect(
      catalog.nodeOnlyFinish.map(({ presentationId, startMs, durationMs }) => [
        presentationId,
        startMs,
        durationMs,
      ]),
    ).toEqual([
      ['R18', 0, 200],
      ['R39', 180, 996],
      ['R42', 200, 400],
      ['R41', 244, 996],
      ['R40', 840, 400],
    ]);
    expect(Math.max(...catalog.nodeOnlyFinish.map((step) => step.startMs + step.durationMs))).toBe(
      1240,
    );
    const ignite = catalog.nodeOnlyFinish[0]?.presentation;
    expect(ignite?.frames).toHaveLength(8);
    expect(ignite?.frames.every(({ durationMs }) => durationMs === 25)).toBe(true);
    expect(ignite?.frames.every(({ frameName }) => frameName.startsWith('node-ignite#'))).toBe(
      true,
    );
    expect(
      catalog.nodeOnlyFinish.map(({ presentationId, presentation }) => [
        presentationId,
        presentation.scaleXY[0],
        presentation.opacity,
      ]),
    ).toEqual([
      ['R18', 0.15625, 1],
      ['R39', 1.125, 0.85],
      ['R42', 0.5, 0.9],
      ['R41', 1, 0.6],
      ['R40', 1, 0.5],
    ]);
    catalog.nodeOnlyFinish.forEach(({ presentation }) => expect(presentation.isLoop).toBe(false));
  });

  it('throws for unknown or mismatched lookups', async () => {
    const catalog = await loadCatalog();
    expect(() => getAtlasPresentation(catalog, 'R01')).toThrow();
    expect(() => getImagePresentation(catalog, 'R11')).toThrow();
    expect(() => getAtlasPresentation(catalog, 'R43')).toThrow();
    expect(() => getAtlasPresentation(catalog, 'R99')).toThrow();
  });

  describe('boundary failures', () => {
    const cases: readonly [string, (url: string) => Promise<unknown>][] = [
      [
        'empty roles',
        fetchWithEdit(MANIFEST_URL, (manifest) => {
          manifest['roles'] = [];
        }),
      ],
      [
        'duplicate role',
        fetchWithEdit(MANIFEST_URL, (manifest) => {
          const roles = requireArray(manifest['roles'], 'roles');
          roles.push(structuredClone(roles[10]));
        }),
      ],
      [
        'missing role',
        fetchWithEdit(MANIFEST_URL, (manifest) => {
          manifest['roles'] = requireArray(manifest['roles'], 'roles').slice(1);
        }),
      ],
      [
        'unknown resource',
        fetchWithEdit(
          MANIFEST_URL,
          editRole('R15', (role) => {
            role['resource'] = 'C:node-missing';
          }),
        ),
      ],
      [
        'frameDurationsMs length mismatch',
        fetchWithEdit(
          MANIFEST_URL,
          editRole('R11', (role) => {
            role['frameDurationsMs'] = Array<number>(11).fill(167);
            role['durationMs'] = 167 * 11;
          }),
        ),
      ],
      [
        'frameDurationsMs sum mismatch',
        fetchWithEdit(
          MANIFEST_URL,
          editRole('R11', (role) => {
            role['durationMs'] = 2000;
          }),
        ),
      ],
      [
        'node-played semantic state with another resource',
        fetchWithEdit(MANIFEST_URL, (manifest) => {
          requireObject(manifest['additionalSemanticState'], 'state')['resource'] = 'C:node-ignite';
        }),
      ],
      [
        'non-NORMAL blend',
        fetchWithEdit(
          MANIFEST_URL,
          editRole('R11', (role) => {
            role['blend'] = 'SCREEN';
          }),
        ),
      ],
      [
        'runtime tint',
        fetchWithEdit(
          MANIFEST_URL,
          editRole('R11', (role) => {
            role['runtimeTint'] = 'accent';
          }),
        ),
      ],
      [
        'path without public/ prefix',
        fetchWithEdit(
          MANIFEST_URL,
          editRole('R01', (role) => {
            role['path'] = 'assets/ui/celestial/scenes/main-scene.webp';
          }),
        ),
      ],
      [
        'sequence child with unknown presentationRole',
        fetchWithEdit(SEQUENCES_URL, (json) => {
          const sequences = requireObject(json['sequences'], 'sequences');
          const reveal = requireObject(sequences['node-only-reveal'], 'node-only-reveal');
          const child = requireObject(requireArray(reveal['children'], 'children')[0], 'child');
          child['presentationRole'] = 'R99';
        }),
      ],
      [
        'sequence child with unknown role',
        fetchWithEdit(SEQUENCES_URL, (json) => {
          const sequences = requireObject(json['sequences'], 'sequences');
          const finish = requireObject(sequences['constellation-finish'], 'finish');
          const child = requireObject(requireArray(finish['children'], 'children')[3], 'child');
          child['role'] = 'R99';
        }),
      ],
      [
        'sequence child with unknown fallback',
        fetchWithEdit(SEQUENCES_URL, (json) => {
          const sequences = requireObject(json['sequences'], 'sequences');
          const finish = requireObject(sequences['constellation-finish'], 'finish');
          const child = requireObject(requireArray(finish['children'], 'children')[0], 'child');
          child['fallbackSequence'] = 'missing';
        }),
      ],
      [
        'resource child duration mismatch',
        fetchWithEdit(SEQUENCES_URL, (json) => {
          const sequences = requireObject(json['sequences'], 'sequences');
          const reveal = requireObject(sequences['node-only-reveal'], 'node-only-reveal');
          const child = requireObject(requireArray(reveal['children'], 'children')[0], 'child');
          child['durationMs'] = 199;
        }),
      ],
      [
        'child outside sequence duration',
        fetchWithEdit(SEQUENCES_URL, (json) => {
          const sequences = requireObject(json['sequences'], 'sequences');
          const finish = requireObject(sequences['constellation-finish'], 'finish');
          const child = requireObject(requireArray(finish['children'], 'children')[3], 'child');
          child['startMs'] = 841;
        }),
      ],
      [
        'region state without frames',
        fetchWithEdit(REGIONS_URLS.T, (json) => {
          const states = requireObject(json['states'], 'states');
          requireObject(states['star-thread'], 'star-thread')['frames'] = [];
        }),
      ],
    ];

    it.each(cases)('throws for %s', async (_label, fetchJson) => {
      await expect(loadCelestialCatalog(fetchJson)).rejects.toThrow(/Invalid celestial metadata/);
    });

    it('propagates a fetchJson rejection', async () => {
      const failure = new Error('network down');
      await expect(
        loadCelestialCatalog((url) =>
          url === SEQUENCES_URL ? Promise.reject(failure) : readPublicJson(url),
        ),
      ).rejects.toBe(failure);
    });
  });
});
