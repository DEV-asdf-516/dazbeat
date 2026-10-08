import { z } from 'zod';

export interface CelestialAtlasPresentation {
  kind: 'atlas';
  textureKey: string;
  animationKey: string;
  frames: readonly { frameName: string; durationMs: number }[];
  isLoop: boolean;
  scaleXY: readonly [number, number];
  scaleRange: { x: readonly [number, number]; y: readonly [number, number] } | null;
  originXY: readonly [number, number];
  opacity: number;
}

export interface CelestialImagePresentation {
  kind: 'image';
  textureKey: string;
  opacity: number;
}

export interface CelestialSequenceStep {
  presentationId: string;
  startMs: number;
  durationMs: number;
  presentation: CelestialAtlasPresentation;
}

export interface CelestialCatalog {
  textures: readonly { key: string; url: string }[];
  atlasFrames: readonly {
    textureKey: string;
    frames: readonly {
      frameName: string;
      xPx: number;
      yPx: number;
      widthPx: number;
      heightPx: number;
    }[];
  }[];
  presentations: ReadonlyMap<string, CelestialAtlasPresentation | CelestialImagePresentation>;
  nodeOnlyFinish: readonly CelestialSequenceStep[];
}

const MANIFEST_URL = '/assets/ui/celestial-manifest.json';
const PUBLIC_PREFIX = 'public/';
const ROLE_COUNT = 50;
const FINISH_SEQUENCE = 'constellation-finish';
const NODE_PLAYED_ID = 'C:node-played';
const ATLAS_FAMILIES = ['S', 'A', 'C', 'G', 'R', 'T'] as const;

const pair = z.tuple([z.number(), z.number()]);
const path = z.string();
const blend = z.literal('NORMAL');
// 'none; preserve baked palette' 처럼 설명이 붙어도 색을 바꾸지 않는 값만 허용한다.
const runtimeTint = z.string().startsWith('none');

const atlas = z.object({ image: z.object({ path }), regions: path });

const scaleRange = z.union([
  pair.transform((range) => ({ x: range, y: range })),
  z.object({ x: pair, y: pair }),
  // 이미지 role 의 정책 문자열처럼 수치 범위가 아닌 값은 범위가 없는 것으로 본다.
  z.unknown().transform(() => null),
]);

const role = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    id: z.string(),
    path,
    opacity: z.number(),
    blend,
    runtimeTint,
  }),
  z.object({
    kind: z.enum(['atlas-region', 'atlas-clip']),
    id: z.string(),
    resource: z.string(),
    frameDurationsMs: z.array(z.number()).nullable(),
    durationMs: z.number().nullable(),
    loop: z.boolean(),
    opacity: z.number(),
    scaleXY: pair,
    scaleRange,
    anchorPx: pair,
    blend,
    runtimeTint,
  }),
  z.object({ kind: z.literal('composed-sequence'), id: z.string(), blend, runtimeTint }),
]);

type Role = z.infer<typeof role>;
type AtlasRole = Extract<Role, { kind: 'atlas-region' | 'atlas-clip' }>;

const manifestSchema = z.object({
  atlases: z.object({ S: atlas, A: atlas, C: atlas, G: atlas, R: atlas, T: atlas }),
  roles: z.array(role),
  additionalSemanticState: z.object({
    resource: z.literal(NODE_PLAYED_ID),
    scaleXY: pair,
    opacity: z.number(),
  }),
  sequenceManifest: path,
});

const regionsSchema = z.object({
  states: z.record(
    z.string(),
    z.object({
      anchor_px: pair,
      frames: z
        .array(
          z.object({
            x: z.number(),
            y: z.number(),
            w: z.number().positive(),
            h: z.number().positive(),
            duration_ms: z.number(),
          }),
        )
        .min(1),
    }),
  ),
});

type RegionState = z.infer<typeof regionsSchema>['states'][string];

const sequenceChild = z.union([
  z.object({
    resource: z.string(),
    presentationRole: z.string(),
    startMs: z.number(),
    durationMs: z.number(),
  }),
  z.object({ role: z.string(), startMs: z.number(), durationMs: z.number() }),
  z.object({ sequence: z.string(), fallbackSequence: z.string(), startMs: z.number() }),
]);

type SequenceChild = z.infer<typeof sequenceChild>;

const sequencesSchema = z.object({
  sequences: z.record(
    z.string(),
    z.object({ durationMs: z.number(), children: z.array(sequenceChild) }),
  ),
});

type Sequences = z.infer<typeof sequencesSchema>['sequences'];

function formatPath(issuePath: readonly PropertyKey[]): string {
  return issuePath.reduce<string>(
    (joined, key) => (typeof key === 'number' ? `${joined}[${key}]` : `${joined}.${String(key)}`),
    '',
  );
}

function parseJson<T>(schema: z.ZodType<T>, input: unknown, url: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new Error(
      `Invalid celestial metadata ${url}: ${formatPath(issue?.path ?? [])} ${issue?.message ?? 'is invalid'}`,
    );
  }
  return result.data;
}

function invalid(url: string, reason: string): Error {
  return new Error(`Invalid celestial metadata ${url}: ${reason}`);
}

/** manifest 경로는 `public/` 기준으로 기록돼 있고 런타임 URL 은 그 접두를 뗀 경로다. */
function toUrl(filePath: string): string {
  if (!filePath.startsWith(PUBLIC_PREFIX)) {
    throw invalid(MANIFEST_URL, `path ${filePath} does not start with ${PUBLIC_PREFIX}`);
  }
  return `/${filePath.slice(PUBLIC_PREFIX.length)}`;
}

function textureKeyOf(url: string): string {
  return `celestial:${url}`;
}

function frameNameOf(state: string, index: number): string {
  return `${state}#${index}`;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

interface AtlasSource {
  textureKey: string;
  states: Readonly<Record<string, RegionState>>;
}

interface ResolvedResource {
  textureKey: string;
  state: string;
  region: RegionState;
}

function checkRoleIds(roles: readonly Role[]): void {
  const ids = new Set<string>();
  roles.forEach(({ id }) => {
    if (ids.has(id)) {
      throw invalid(MANIFEST_URL, `duplicate role ${id}`);
    }
    ids.add(id);
  });
  for (let index = 1; index <= ROLE_COUNT; index += 1) {
    const id = `R${String(index).padStart(2, '0')}`;
    if (!ids.has(id)) {
      throw invalid(MANIFEST_URL, `missing role ${id}`);
    }
  }
  if (ids.size !== ROLE_COUNT) {
    throw invalid(MANIFEST_URL, `expected ${ROLE_COUNT} roles, got ${ids.size}`);
  }
}

function resolveResource(
  atlases: ReadonlyMap<string, AtlasSource>,
  resource: string,
  url: string,
): ResolvedResource {
  const [family, state, ...rest] = resource.split(':');
  const source = family === undefined ? undefined : atlases.get(family);
  const region = state === undefined ? undefined : source?.states[state];
  if (source === undefined || state === undefined || region === undefined || rest.length > 0) {
    throw invalid(url, `unknown resource ${resource}`);
  }
  return { textureKey: source.textureKey, state, region };
}

function toOrigin(anchorPx: readonly [number, number], region: RegionState): [number, number] {
  const [firstFrame] = region.frames;
  if (firstFrame === undefined) {
    throw new Error('Region state has no frames');
  }
  return [anchorPx[0] / firstFrame.w, anchorPx[1] / firstFrame.h];
}

function toFrames(
  resolved: ResolvedResource,
  durationsMs: readonly number[],
): CelestialAtlasPresentation['frames'] {
  return resolved.region.frames.map((_frame, index) => ({
    frameName: frameNameOf(resolved.state, index),
    durationMs: durationsMs[index] ?? 0,
  }));
}

function toRolePresentation(
  atlasRole: AtlasRole,
  atlases: ReadonlyMap<string, AtlasSource>,
): CelestialAtlasPresentation {
  const resolved = resolveResource(atlases, atlasRole.resource, MANIFEST_URL);
  const frameCount = resolved.region.frames.length;
  const { frameDurationsMs, durationMs } = atlasRole;
  if (frameDurationsMs === null) {
    if (frameCount !== 1) {
      throw invalid(MANIFEST_URL, `role ${atlasRole.id} has ${frameCount} frames but no durations`);
    }
  } else if (frameDurationsMs.length !== frameCount) {
    throw invalid(
      MANIFEST_URL,
      `role ${atlasRole.id} has ${frameDurationsMs.length} durations for ${frameCount} frames`,
    );
  } else if (sum(frameDurationsMs) !== durationMs) {
    throw invalid(MANIFEST_URL, `role ${atlasRole.id} frame durations do not sum to durationMs`);
  }
  return {
    kind: 'atlas',
    textureKey: resolved.textureKey,
    animationKey: `celestial:${atlasRole.id}`,
    // 정적 role 은 타이머가 없으므로 importer 의 1000ms 를 옮기지 않는다.
    frames: toFrames(resolved, frameDurationsMs ?? [0]),
    isLoop: atlasRole.loop,
    scaleXY: atlasRole.scaleXY,
    scaleRange: atlasRole.scaleRange,
    originXY: toOrigin(atlasRole.anchorPx, resolved.region),
    opacity: atlasRole.opacity,
  };
}

function checkSequences(
  sequences: Sequences,
  atlases: ReadonlyMap<string, AtlasSource>,
  atlasRoles: ReadonlyMap<string, AtlasRole>,
  url: string,
): void {
  Object.entries(sequences).forEach(([name, sequence]) => {
    sequence.children.forEach((child) => {
      const fail = (reason: string): Error => invalid(url, `sequence ${name} ${reason}`);
      let endMs: number;
      if ('resource' in child) {
        const resolved = resolveResource(atlases, child.resource, url);
        if (!atlasRoles.has(child.presentationRole)) {
          throw fail(`references unknown presentationRole ${child.presentationRole}`);
        }
        if (sum(resolved.region.frames.map((frame) => frame.duration_ms)) !== child.durationMs) {
          throw fail(`child ${child.resource} frame durations do not sum to durationMs`);
        }
        endMs = child.startMs + child.durationMs;
      } else if ('role' in child) {
        if (!atlasRoles.has(child.role)) {
          throw fail(`references unknown role ${child.role}`);
        }
        endMs = child.startMs + child.durationMs;
      } else {
        const nested = sequences[child.sequence];
        const fallback = sequences[child.fallbackSequence];
        if (nested === undefined || fallback === undefined) {
          throw fail(`references unknown sequence ${child.sequence}/${child.fallbackSequence}`);
        }
        endMs = child.startMs + Math.max(nested.durationMs, fallback.durationMs);
      }
      if (endMs > sequence.durationMs) {
        throw fail(`child ends at ${endMs}ms after ${sequence.durationMs}ms`);
      }
    });
  });
}

/** 관계 데이터가 없으므로 sequence child 는 fallback sequence 로 펼친다. */
function expandFallback(
  children: readonly SequenceChild[],
  offsetMs: number,
  sequences: Sequences,
  atlases: ReadonlyMap<string, AtlasSource>,
  atlasRoles: ReadonlyMap<string, AtlasRole>,
  rolePresentations: ReadonlyMap<string, CelestialAtlasPresentation>,
): CelestialSequenceStep[] {
  return children.flatMap((child): CelestialSequenceStep[] => {
    const startMs = offsetMs + child.startMs;
    if ('resource' in child) {
      const resolved = resolveResource(atlases, child.resource, MANIFEST_URL);
      const presentationRole = atlasRoles.get(child.presentationRole);
      if (presentationRole === undefined) {
        throw new Error(`Unknown presentationRole ${child.presentationRole}`);
      }
      return [
        {
          presentationId: presentationRole.id,
          startMs,
          durationMs: child.durationMs,
          presentation: {
            kind: 'atlas',
            textureKey: resolved.textureKey,
            animationKey: `celestial:${child.resource}@${presentationRole.id}`,
            frames: toFrames(
              resolved,
              resolved.region.frames.map((frame) => frame.duration_ms),
            ),
            isLoop: false,
            scaleXY: presentationRole.scaleXY,
            scaleRange: presentationRole.scaleRange,
            originXY: toOrigin(presentationRole.anchorPx, resolved.region),
            opacity: presentationRole.opacity,
          },
        },
      ];
    }
    if ('role' in child) {
      const presentation = rolePresentations.get(child.role);
      if (presentation === undefined) {
        throw new Error(`Unknown sequence role ${child.role}`);
      }
      return [{ presentationId: child.role, startMs, durationMs: child.durationMs, presentation }];
    }
    const fallback = sequences[child.fallbackSequence];
    if (fallback === undefined) {
      throw new Error(`Unknown fallback sequence ${child.fallbackSequence}`);
    }
    return expandFallback(
      fallback.children,
      startMs,
      sequences,
      atlases,
      atlasRoles,
      rolePresentations,
    );
  });
}

/** celestial 메타데이터(manifest·regions·sequences)를 읽어 검증된 카탈로그로 만든다. */
export async function loadCelestialCatalog(
  fetchJson: (url: string) => Promise<unknown>,
): Promise<CelestialCatalog> {
  const manifest = parseJson(manifestSchema, await fetchJson(MANIFEST_URL), MANIFEST_URL);
  const atlasEntries = ATLAS_FAMILIES.map((family) => ({
    family,
    imageUrl: toUrl(manifest.atlases[family].image.path),
    regionsUrl: toUrl(manifest.atlases[family].regions),
  }));
  const sequencesUrl = toUrl(manifest.sequenceManifest);
  const [sequencesJson, ...regionsJson] = await Promise.all([
    fetchJson(sequencesUrl),
    ...atlasEntries.map(({ regionsUrl }) => fetchJson(regionsUrl)),
  ]);

  const atlases = new Map<string, AtlasSource>(
    atlasEntries.map(({ family, imageUrl, regionsUrl }, index) => [
      family,
      {
        textureKey: textureKeyOf(imageUrl),
        states: parseJson(regionsSchema, regionsJson[index], regionsUrl).states,
      },
    ]),
  );
  const sequences = parseJson(sequencesSchema, sequencesJson, sequencesUrl).sequences;

  checkRoleIds(manifest.roles);
  const imageTextures = new Map<string, string>();
  const presentations = new Map<string, CelestialAtlasPresentation | CelestialImagePresentation>();
  const rolePresentations = new Map<string, CelestialAtlasPresentation>();
  const atlasRoles = new Map<string, AtlasRole>();
  manifest.roles.forEach((manifestRole) => {
    switch (manifestRole.kind) {
      case 'image': {
        const url = toUrl(manifestRole.path);
        imageTextures.set(url, textureKeyOf(url));
        presentations.set(manifestRole.id, {
          kind: 'image',
          textureKey: textureKeyOf(url),
          opacity: manifestRole.opacity,
        });
        return;
      }
      case 'atlas-region':
      case 'atlas-clip': {
        const presentation = toRolePresentation(manifestRole, atlases);
        atlasRoles.set(manifestRole.id, manifestRole);
        rolePresentations.set(manifestRole.id, presentation);
        presentations.set(manifestRole.id, presentation);
        return;
      }
      case 'composed-sequence':
        return;
    }
  });

  const semantic = manifest.additionalSemanticState;
  const semanticResource = resolveResource(atlases, semantic.resource, MANIFEST_URL);
  presentations.set(NODE_PLAYED_ID, {
    kind: 'atlas',
    textureKey: semanticResource.textureKey,
    animationKey: `celestial:${NODE_PLAYED_ID}`,
    frames: toFrames(semanticResource, [0]),
    isLoop: false,
    scaleXY: semantic.scaleXY,
    scaleRange: null,
    originXY: toOrigin(semanticResource.region.anchor_px, semanticResource.region),
    opacity: semantic.opacity,
  });

  checkSequences(sequences, atlases, atlasRoles, sequencesUrl);
  const finish = sequences[FINISH_SEQUENCE];
  if (finish === undefined) {
    throw invalid(sequencesUrl, `missing sequence ${FINISH_SEQUENCE}`);
  }
  const nodeOnlyFinish = expandFallback(
    finish.children,
    0,
    sequences,
    atlases,
    atlasRoles,
    rolePresentations,
  ).sort((left, right) => left.startMs - right.startMs);

  return {
    textures: [
      ...atlasEntries.map(({ imageUrl }) => ({ key: textureKeyOf(imageUrl), url: imageUrl })),
      ...[...imageTextures].map(([url, key]) => ({ key, url })),
    ],
    atlasFrames: [...atlases.values()].map(({ textureKey, states }) => ({
      textureKey,
      frames: Object.entries(states).flatMap(([state, region]) =>
        region.frames.map((frame, index) => ({
          frameName: frameNameOf(state, index),
          xPx: frame.x,
          yPx: frame.y,
          widthPx: frame.w,
          heightPx: frame.h,
        })),
      ),
    })),
    presentations,
    nodeOnlyFinish,
  };
}

export function getAtlasPresentation(
  catalog: CelestialCatalog,
  id: string,
): CelestialAtlasPresentation {
  const presentation = catalog.presentations.get(id);
  if (presentation?.kind !== 'atlas') {
    throw new Error(`Unknown celestial atlas presentation: ${id}`);
  }
  return presentation;
}

export function getImagePresentation(
  catalog: CelestialCatalog,
  id: string,
): CelestialImagePresentation {
  const presentation = catalog.presentations.get(id);
  if (presentation?.kind !== 'image') {
    throw new Error(`Unknown celestial image presentation: ${id}`);
  }
  return presentation;
}
