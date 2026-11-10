import type Phaser from 'phaser';
import type { RankingSubmission } from '../../data/playSession.js';
import type { ChartRef } from '../../data/songs.js';
import type { Difficulty, GameplayResult } from '../../rhythm/types.js';
import { requestSceneExit } from './sceneExit.js';
import type { SceneExit } from './sceneExit.js';
import type { SongFeed } from './SongFeed.js';

export const SCENE_KEYS = {
  main: 'Main',
  songSelect: 'SongSelect',
  gameplay: 'Gameplay',
  result: 'Result',
  settings: 'Settings',
  credits: 'Credits',
  profile: 'Profile',
  ranking: 'Ranking',
  chartEditorSelect: 'ChartEditorSelect',
  chartEditor: 'ChartEditor',
  bootError: 'BootError',
} as const;

// 메뉴 음악을 끊지 않고 이어 트는 화면이다. 자기 곡을 트는 선곡, 게임플레이, 에디터와 겹치지 않도록
// 나머지 화면에 들어가면 멈춘다.
export const MENU_MUSIC_SCENE_KEYS: ReadonlySet<string> = new Set([
  SCENE_KEYS.main,
  SCENE_KEYS.settings,
  SCENE_KEYS.credits,
  SCENE_KEYS.profile,
  SCENE_KEYS.chartEditorSelect,
]);

export type PlayMode = 'standard' | 'practice';

export interface SongSelectRestore {
  readonly feed: SongFeed;
  readonly index: number;
  readonly songId: string | null;
  readonly difficulty: Difficulty | null;
}

export interface SongSelectSceneData {
  readonly mode: PlayMode;
  readonly restore?: SongSelectRestore;
}

export interface ProfileSceneData {
  readonly returnTo: SceneRequest;
}

export interface RankingSceneData {
  readonly mode: PlayMode;
  readonly restore: SongSelectRestore;
  readonly chart: ChartRef;
}

/** 시각은 채보 타임라인 기준이다. */
export type PlayStart =
  { readonly kind: 'whole' } | { readonly kind: 'from'; readonly timeMs: number };

export type PlayQuitKey = 'confirm' | 'leave';

export type PlayOrigin =
  | {
      readonly kind: 'songSelect';
      readonly mode: PlayMode;
      readonly quitKey: 'confirm';
      readonly start: { readonly kind: 'whole' };
      readonly restore?: SongSelectRestore;
    }
  | {
      readonly kind: 'chartEditor';
      readonly mode: 'practice';
      readonly quitKey: 'leave';
      readonly start: { readonly kind: 'from'; readonly timeMs: number };
      readonly list: SongFeed;
    };

export interface GameplaySceneData extends ChartRef {
  readonly origin: PlayOrigin;
}

/** submitted 의 submission 은 거절되지 않는다. 제출이 예외로 끝나면 unknown 이 된다. */
export type ResultRanking =
  | { readonly kind: 'none' }
  | { readonly kind: 'issueFailed' }
  | { readonly kind: 'submitted'; readonly submission: Promise<RankingSubmission> };

/** section 은 곡의 일부만 친 판이라 곡 전체를 평가하는 등급과 점수를 매기지 않는다. */
export type ResultReport =
  | { readonly kind: 'graded' }
  | {
      readonly kind: 'section';
      readonly startTimeMs: number;
      readonly endTimeMs: number;
      readonly noteCount: number;
      readonly totalNoteCount: number;
    };

export interface ResultSceneData extends ChartRef {
  readonly origin: PlayOrigin;
  readonly report: ResultReport;
  result: GameplayResult;
  readonly ranking: ResultRanking;
}

export type ChartEditorSelectSceneData =
  | { readonly kind: 'fresh' }
  | { readonly kind: 'return'; readonly list: SongFeed; readonly focusedSongId: string | null };

export interface ChartEditorSceneData {
  readonly songId: string;
  readonly list: SongFeed;
  readonly chart?: Pick<ChartRef, 'laneCount' | 'difficulty'>;
  readonly resumeTimeMs?: number;
}

export type SettingsReturn =
  | { readonly key: 'main'; readonly data: undefined }
  | { readonly key: 'songSelect'; readonly data: SongSelectSceneData };

export interface SettingsSceneData {
  readonly returnTo: SettingsReturn;
}

export interface SceneDataMap {
  main: undefined;
  songSelect: SongSelectSceneData;
  gameplay: GameplaySceneData;
  result: ResultSceneData;
  settings: SettingsSceneData;
  credits: undefined;
  profile: ProfileSceneData;
  ranking: RankingSceneData;
  chartEditorSelect: ChartEditorSelectSceneData;
  chartEditor: ChartEditorSceneData;
}

export function startScene<K extends keyof SceneDataMap>(
  scene: Phaser.Scene,
  key: K,
  ...data: SceneDataMap[K] extends undefined ? [] : [SceneDataMap[K]]
): void {
  scene.scene.start(SCENE_KEYS[key], data[0]);
}

export type SceneRequest = {
  [K in keyof SceneDataMap]: { readonly key: K; readonly data: SceneDataMap[K] };
}[keyof SceneDataMap];

/** played 는 실제로 플레이한 채보, selected 는 화면에서 고른 채보, stoppedTimeMs 는 플레이를 멈춘 시각이다. */
export function getPlayOriginRequest(
  origin: PlayOrigin,
  played: ChartRef,
  selected: ChartRef,
  stoppedTimeMs = 0,
): SceneRequest {
  switch (origin.kind) {
    case 'songSelect':
      return {
        key: 'songSelect',
        data: {
          mode: origin.mode,
          ...(origin.restore === undefined
            ? {}
            : {
                restore: {
                  ...origin.restore,
                  difficulty: selected.difficulty,
                },
              }),
        },
      };
    case 'chartEditor':
      return {
        key: 'chartEditor',
        data: {
          songId: played.song.id,
          list: origin.list,
          chart: {
            laneCount: played.laneCount,
            difficulty: played.difficulty,
          },
          // 시작 전 카운트다운에 나가도 고른 위치를 잃지 않는다.
          resumeTimeMs: Math.max(origin.start.timeMs, stoppedTimeMs),
        },
      };
  }
}

export function exitScene(
  scene: Phaser.Scene,
  exit: SceneExit<SceneRequest>,
  request: SceneRequest,
): SceneExit<SceneRequest> {
  const next = requestSceneExit(exit, request);
  if (next !== exit) {
    scene.scene.start(SCENE_KEYS[request.key], request.data);
  }
  return next;
}
