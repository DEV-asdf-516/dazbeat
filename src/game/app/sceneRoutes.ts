import type Phaser from 'phaser';
import type { NamedAchievementDefinition } from '../../data/achievements.js';
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
  chartEditorSelect: 'ChartEditorSelect',
  chartEditor: 'ChartEditor',
} as const;

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

export interface GameplaySceneData extends ChartRef {
  readonly mode: PlayMode;
  readonly restore?: SongSelectRestore;
}

export interface ResultSceneData extends ChartRef {
  readonly mode: PlayMode;
  result: GameplayResult;
  readonly newAchievements: Promise<readonly NamedAchievementDefinition[]>;
  readonly restore?: SongSelectRestore;
}

export type ChartEditorSelectSceneData =
  | { readonly kind: 'fresh' }
  | { readonly kind: 'return'; readonly list: SongFeed; readonly focusedSongId: string | null };

export interface ChartEditorSceneData {
  readonly songId: string;
  readonly list: SongFeed;
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
  profile: undefined;
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
