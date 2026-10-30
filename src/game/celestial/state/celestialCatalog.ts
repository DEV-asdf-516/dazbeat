import { z } from 'zod';
import { toParseIssue } from '../../data/parseIssue.js';
import { requireDefined } from '../../invariant.js';

/** 화면 코드가 id 마다 종류(이미지·정적·animation)에 기대므로 이 분류는 코드 쪽 계약이고, 로드할 때 manifest 와 정확히 같은지 확인한다. */
const IMAGE_ROLE_IDS = ['R01', 'R02', 'R03', 'R05', 'R50'] as const;
const STATIC_ROLE_IDS = [
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R15',
  'R16',
  'R17',
  'R18',
  'R19',
  'R20',
  'R21',
  'R22',
  'R26',
  'R30',
  'R31',
  'R48',
  'R49',
] as const;
const CLIP_ROLE_IDS = [
  'R11',
  'R12',
  'R13',
  'R14',
  'R23',
  'R25',
  'R27',
  'R28',
  'R29',
  'R32',
  'R33',
  'R34',
  'R35',
  'R36',
  'R37',
  'R38',
  'R39',
  'R40',
  'R41',
  'R42',
  'R44',
  'R45',
  'R46',
  'R47',
] as const;
const SEQUENCE_ROLE_IDS = ['R24', 'R43'] as const;
const NODE_PLAYED_ID = 'C:node-played';

export type CelestialImageId = (typeof IMAGE_ROLE_IDS)[number];
export type CelestialStaticId = (typeof STATIC_ROLE_IDS)[number] | typeof NODE_PLAYED_ID;
export type CelestialAtlasId = CelestialStaticId | (typeof CLIP_ROLE_IDS)[number];

export interface CelestialFrame {
  frameName: string;
  durationMs: number;
}

export type CelestialPlayback =
  | { kind: 'static' }
  | { kind: 'loop'; animationKey: string; frames: readonly CelestialFrame[] }
  | { kind: 'once'; animationKey: string; frames: readonly CelestialFrame[] };

export interface CelestialAtlasPresentation {
  textureKey: string;
  firstFrameName: string;
  playback: CelestialPlayback;
  scaleXY: readonly [number, number];
  scaleRange: { x: readonly [number, number]; y: readonly [number, number] } | null;
  originXY: readonly [number, number];
  opacity: number;
}

export interface CelestialStaticPresentation extends CelestialAtlasPresentation {
  playback: { kind: 'static' };
}

export interface CelestialImagePresentation {
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
    standInWidthPx: number;
    standInHeightPx: number;
    frames: readonly {
      frameName: string;
      xPx: number;
      yPx: number;
      widthPx: number;
      heightPx: number;
    }[];
  }[];
  atlasPresentations: Readonly<
    Record<CelestialStaticId, CelestialStaticPresentation> &
      Record<CelestialAtlasId, CelestialAtlasPresentation>
  >;
  imagePresentations: Readonly<Record<CelestialImageId, CelestialImagePresentation>>;
  nodeOnlyFinish: readonly CelestialSequenceStep[];
}

const MANIFEST_URL = '/assets/ui/celestial-manifest.json';
const PUBLIC_PREFIX = 'public/';
const FINISH_SEQUENCE = 'constellation-finish';
const ATLAS_FAMILIES = ['S', 'A', 'C', 'G', 'R', 'T'] as const;

const pair = z.tuple([z.number(), z.number()]);
const path = z.string();
const blend = z.literal('NORMAL');
// 'none; preserve baked palette' 처럼 설명이 붙어도 색을 바꾸지 않는 값만 허용한다.
const runtimeTint = z.string().startsWith('none');

const atlas = z.object({
  image: z.object({ path }),
  regions: path,
});

const scaleRange = z.union([
  pair.transform((range) => ({
    x: range,
    y: range,
  })),
  z.object({
    x: pair,
    y: pair,
  }),
  // 이미지 role 의 정책 문자열처럼 수치 범위가 아닌 값은 범위가 없는 것으로 본다.
  z.unknown().transform(() => null),
]);

const imageRole = z.object({
  kind: z.literal('image'),
  id: z.string(),
  path,
  opacity: z.number(),
  blend,
  runtimeTint,
});

const atlasRoleFields = {
  id: z.string(),
  resource: z.string(),
  opacity: z.number(),
  scaleXY: pair,
  scaleRange,
  anchorPx: pair,
  blend,
  runtimeTint,
};

const staticRole = z.object({
  kind: z.literal('atlas-region'),
  ...atlasRoleFields,
  frameDurationsMs: z.null(),
});

const clipRole = z.object({
  kind: z.literal('atlas-clip'),
  ...atlasRoleFields,
  frameDurationsMs: z.array(z.number()),
  durationMs: z.number(),
  loop: z.boolean(),
});

const sequenceRole = z.object({
  kind: z.literal('composed-sequence'),
  id: z.string(),
  blend,
  runtimeTint,
});

const role = z.discriminatedUnion('kind', [imageRole, staticRole, clipRole, sequenceRole]);

type Role = z.infer<typeof role>;
type StaticRole = z.infer<typeof staticRole>;
type ClipRole = z.infer<typeof clipRole>;
type AtlasRole = StaticRole | ClipRole;

const manifestSchema = z.object({
  atlases: z.object({
    S: atlas,
    A: atlas,
    C: atlas,
    G: atlas,
    R: atlas,
    T: atlas,
  }),
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

type SequenceChild =
  | { kind: 'step'; step: CelestialSequenceStep }
  | { kind: 'sequence'; startMs: number; sequence: string; fallbackSequence: string };

interface ExpandedSequence {
  durationMs: number;
  steps: readonly CelestialSequenceStep[];
}

function parseJson<T>(schema: z.ZodType<T>, input: unknown, url: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const { path, reason } = toParseIssue(result.error, '');
    throw new Error(`Invalid celestial metadata ${url}: ${path} ${reason}`);
  }
  return result.data;
}

function invalid(url: string, reason: string): Error {
  return new Error(`Invalid celestial metadata ${url}: ${reason}`);
}

function requireKnown<T>(value: T | undefined, url: string, kind: string, id: string): T {
  if (value === undefined) {
    throw invalid(url, `unknown ${kind} ${id}`);
  }
  return value;
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

function groupRolesByKind(roles: readonly Role[]): Record<Role['kind'], Record<string, Role>> {
  const groups: Record<Role['kind'], Record<string, Role>> = {
    image: {},
    'atlas-region': {},
    'atlas-clip': {},
    'composed-sequence': {},
  };
  const ids = new Set<string>();
  roles.forEach((manifestRole) => {
    if (ids.has(manifestRole.id)) {
      throw invalid(MANIFEST_URL, `duplicate role ${manifestRole.id}`);
    }
    ids.add(manifestRole.id);
    groups[manifestRole.kind][manifestRole.id] = manifestRole;
  });
  return groups;
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
  return {
    textureKey: source.textureKey,
    state,
    region,
  };
}

function toOrigin(anchorPx: readonly [number, number], region: RegionState): [number, number] {
  const firstFrame = requireDefined(region.frames[0], 'Region state has no frames');
  return [anchorPx[0] / firstFrame.w, anchorPx[1] / firstFrame.h];
}

function toFrames(resolved: ResolvedResource, durationsMs: readonly number[]): CelestialFrame[] {
  return resolved.region.frames.map((_frame, index) => ({
    frameName: frameNameOf(resolved.state, index),
    durationMs: durationsMs[index] ?? 0,
  }));
}

function toStaticPresentation(
  resolved: ResolvedResource,
  anchorPx: readonly [number, number],
  scaleXY: readonly [number, number],
  scaleRange: CelestialAtlasPresentation['scaleRange'],
  opacity: number,
): CelestialStaticPresentation {
  return {
    textureKey: resolved.textureKey,
    firstFrameName: frameNameOf(resolved.state, 0),
    playback: { kind: 'static' },
    scaleXY,
    scaleRange,
    originXY: toOrigin(anchorPx, resolved.region),
    opacity,
  };
}

function toStaticRolePresentation(
  atlasRole: StaticRole,
  atlases: ReadonlyMap<string, AtlasSource>,
): CelestialStaticPresentation {
  const resolved = resolveResource(atlases, atlasRole.resource, MANIFEST_URL);
  const frameCount = resolved.region.frames.length;
  if (frameCount !== 1) {
    throw invalid(MANIFEST_URL, `role ${atlasRole.id} has ${frameCount} frames but no durations`);
  }
  return toStaticPresentation(
    resolved,
    atlasRole.anchorPx,
    atlasRole.scaleXY,
    atlasRole.scaleRange,
    atlasRole.opacity,
  );
}

function toClipRolePresentation(
  atlasRole: ClipRole,
  atlases: ReadonlyMap<string, AtlasSource>,
): CelestialAtlasPresentation {
  const resolved = resolveResource(atlases, atlasRole.resource, MANIFEST_URL);
  const frameCount = resolved.region.frames.length;
  const { frameDurationsMs, durationMs } = atlasRole;
  if (frameDurationsMs.length !== frameCount) {
    throw invalid(
      MANIFEST_URL,
      `role ${atlasRole.id} has ${frameDurationsMs.length} durations for ${frameCount} frames`,
    );
  }
  if (sum(frameDurationsMs) !== durationMs) {
    throw invalid(MANIFEST_URL, `role ${atlasRole.id} frame durations do not sum to durationMs`);
  }
  return {
    textureKey: resolved.textureKey,
    firstFrameName: frameNameOf(resolved.state, 0),
    playback: {
      kind: atlasRole.loop ? 'loop' : 'once',
      animationKey: `celestial:${atlasRole.id}`,
      frames: toFrames(resolved, frameDurationsMs),
    },
    scaleXY: atlasRole.scaleXY,
    scaleRange: atlasRole.scaleRange,
    originXY: toOrigin(atlasRole.anchorPx, resolved.region),
    opacity: atlasRole.opacity,
  };
}

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

  // 종류별 id 가 코드의 목록과 정확히 같아야 하므로 enum key record 로 빠짐·남는 id 를 함께 거른다.
  const rolesById = parseJson(
    z.object({
      image: z.record(
        z.enum(IMAGE_ROLE_IDS),
        imageRole.transform((imageRoleEntry): CelestialImagePresentation => ({
          textureKey: textureKeyOf(toUrl(imageRoleEntry.path)),
          opacity: imageRoleEntry.opacity,
        })),
      ),
      'atlas-region': z.record(
        z.enum(STATIC_ROLE_IDS),
        staticRole.transform((staticRoleEntry) =>
          toStaticRolePresentation(staticRoleEntry, atlases),
        ),
      ),
      'atlas-clip': z.record(
        z.enum(CLIP_ROLE_IDS),
        clipRole.transform((clipRoleEntry) => toClipRolePresentation(clipRoleEntry, atlases)),
      ),
      'composed-sequence': z.record(z.enum(SEQUENCE_ROLE_IDS), sequenceRole),
    }),
    groupRolesByKind(manifest.roles),
    MANIFEST_URL,
  );
  const imageUrls = new Set(
    manifest.roles.flatMap((manifestRole) =>
      manifestRole.kind === 'image' ? [toUrl(manifestRole.path)] : [],
    ),
  );
  const atlasRoles = new Map<string, AtlasRole>(
    manifest.roles.flatMap((manifestRole) =>
      manifestRole.kind === 'atlas-region' || manifestRole.kind === 'atlas-clip'
        ? [[manifestRole.id, manifestRole] as const]
        : [],
    ),
  );
  const rolePresentations = new Map<string, CelestialAtlasPresentation>([
    ...Object.entries(rolesById['atlas-region']),
    ...Object.entries(rolesById['atlas-clip']),
  ]);

  const semantic = manifest.additionalSemanticState;
  const semanticResource = resolveResource(atlases, semantic.resource, MANIFEST_URL);
  const nodePlayed = toStaticPresentation(
    semanticResource,
    semanticResource.region.anchor_px,
    semantic.scaleXY,
    null,
    semantic.opacity,
  );

  const sequences = parseJson(
    z.object({
      sequences: z.record(
        z.string(),
        z.object({
          durationMs: z.number(),
          children: z.array(
            z.union([
              z
                .object({
                  resource: z.string(),
                  presentationRole: z.string(),
                  startMs: z.number(),
                  durationMs: z.number(),
                })
                .transform((child): SequenceChild => {
                  const resolved = resolveResource(atlases, child.resource, sequencesUrl);
                  const presentationRole = requireKnown(
                    atlasRoles.get(child.presentationRole),
                    sequencesUrl,
                    'presentationRole',
                    child.presentationRole,
                  );
                  const frameDurationsMs = resolved.region.frames.map((frame) => frame.duration_ms);
                  if (sum(frameDurationsMs) !== child.durationMs) {
                    throw invalid(
                      sequencesUrl,
                      `child ${child.resource} frame durations do not sum to durationMs`,
                    );
                  }
                  return {
                    kind: 'step',
                    step: {
                      presentationId: presentationRole.id,
                      startMs: child.startMs,
                      durationMs: child.durationMs,
                      presentation: {
                        textureKey: resolved.textureKey,
                        firstFrameName: frameNameOf(resolved.state, 0),
                        playback: {
                          kind: 'once',
                          animationKey: `celestial:${child.resource}@${presentationRole.id}`,
                          frames: toFrames(resolved, frameDurationsMs),
                        },
                        scaleXY: presentationRole.scaleXY,
                        scaleRange: presentationRole.scaleRange,
                        originXY: toOrigin(presentationRole.anchorPx, resolved.region),
                        opacity: presentationRole.opacity,
                      },
                    },
                  };
                }),
              z
                .object({
                  role: z.string(),
                  startMs: z.number(),
                  durationMs: z.number(),
                })
                .transform((child): SequenceChild => {
                  const presentation = requireKnown(
                    rolePresentations.get(child.role),
                    sequencesUrl,
                    'role',
                    child.role,
                  );
                  return {
                    kind: 'step',
                    step: {
                      presentationId: child.role,
                      startMs: child.startMs,
                      durationMs: child.durationMs,
                      presentation,
                    },
                  };
                }),
              z
                .object({
                  sequence: z.string(),
                  fallbackSequence: z.string(),
                  startMs: z.number(),
                })
                .transform((child): SequenceChild => ({
                  kind: 'sequence',
                  ...child,
                })),
            ]),
          ),
        }),
      ),
    }),
    sequencesJson,
    sequencesUrl,
  ).sequences;

  // 관계 데이터가 없으므로 sequence child 는 fallback sequence 로 펼친다.
  const expanded = new Map<string, ExpandedSequence>();
  const expanding = new Set<string>();
  const expand = (name: string): ExpandedSequence => {
    const cached = expanded.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const sequence = requireKnown(sequences[name], sequencesUrl, 'sequence', name);
    if (expanding.has(name)) {
      throw invalid(sequencesUrl, `sequence ${name} is in a reference cycle`);
    }
    expanding.add(name);
    const placed = sequence.children.map((child) => {
      if (child.kind === 'step') {
        return {
          endMs: child.step.startMs + child.step.durationMs,
          steps: [child.step],
        };
      }
      const nested = expand(child.sequence);
      const fallback = expand(child.fallbackSequence);
      return {
        endMs: child.startMs + Math.max(nested.durationMs, fallback.durationMs),
        steps: fallback.steps.map((step) => ({
          ...step,
          startMs: child.startMs + step.startMs,
        })),
      };
    });
    placed.forEach(({ endMs }) => {
      if (endMs > sequence.durationMs) {
        throw invalid(
          sequencesUrl,
          `sequence ${name} child ends at ${endMs}ms after ${sequence.durationMs}ms`,
        );
      }
    });
    expanding.delete(name);
    const result = {
      durationMs: sequence.durationMs,
      steps: placed.flatMap(({ steps }) => steps),
    };
    expanded.set(name, result);
    return result;
  };
  Object.keys(sequences).forEach((name) => expand(name));
  const finish = requireKnown(
    expanded.get(FINISH_SEQUENCE),
    sequencesUrl,
    'sequence',
    FINISH_SEQUENCE,
  );
  const nodeOnlyFinish = [...finish.steps].sort((left, right) => left.startMs - right.startMs);

  return {
    textures: [
      ...atlasEntries.map(({ imageUrl }) => ({
        key: textureKeyOf(imageUrl),
        url: imageUrl,
      })),
      ...[...imageUrls].map((url) => ({
        key: textureKeyOf(url),
        url,
      })),
    ],
    atlasFrames: [...atlases.values()].map(({ textureKey, states }) => {
      const frames = Object.values(states).flatMap((region) => region.frames);
      // state 가 없는 atlas 도 canvas 는 1px 이상이어야 한다.
      return {
        textureKey,
        standInWidthPx: Math.max(1, ...frames.map((frame) => frame.w)),
        standInHeightPx: Math.max(1, ...frames.map((frame) => frame.h)),
        frames: Object.entries(states).flatMap(([state, region]) =>
          region.frames.map((frame, index) => ({
            frameName: frameNameOf(state, index),
            xPx: frame.x,
            yPx: frame.y,
            widthPx: frame.w,
            heightPx: frame.h,
          })),
        ),
      };
    }),
    atlasPresentations: {
      ...rolesById['atlas-region'],
      ...rolesById['atlas-clip'],
      [NODE_PLAYED_ID]: nodePlayed,
    },
    imagePresentations: rolesById.image,
    nodeOnlyFinish,
  };
}
