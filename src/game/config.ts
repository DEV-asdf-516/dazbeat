import Phaser from 'phaser';
import type { Song, SongFilter } from '../data/songs.js';
import type { Difficulty, GameplayResult } from '../rhythm/types.js';
import { requestSceneExit } from './sceneExit.js';
import type { SceneExit } from './sceneExit.js';

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

export const SCENE_KEYS = {
  main: 'Main',
  songSelect: 'SongSelect',
  gameplay: 'Gameplay',
  result: 'Result',
  settings: 'Settings',
  credits: 'Credits',
  chartEditorSelect: 'ChartEditorSelect',
  chartEditor: 'ChartEditor',
} as const;

export interface GameplaySceneData {
  song: Song;
  difficulty: Difficulty;
}

export interface ResultSceneData {
  song: Song;
  difficulty: Difficulty;
  result: GameplayResult;
}

export interface ChartEditorSelectSceneData {
  /** 목록을 열 때 포커스할 곡. 편집하다 돌아오면 그 곡이고, 없으면 첫 곡이다. */
  focusedSongId: string | null;
  /** 목록을 열 때의 카테고리. 편집하다 돌아오면 떠날 때의 카테고리다. */
  filter: SongFilter;
}

export interface ChartEditorSceneData {
  songId: string;
  /** 곡 목록으로 돌아갈 때 되살릴 카테고리. 에디터 안에서는 쓰지 않는다. */
  listFilter: SongFilter;
}

export interface SettingsSceneData {
  returnScene: 'main' | 'songSelect';
}

/** 씬 키와 그 씬이 받는 data 의 짝. data 가 없는 씬은 undefined 다. */
export interface SceneDataMap {
  main: undefined;
  songSelect: undefined;
  gameplay: GameplaySceneData;
  result: ResultSceneData;
  settings: SettingsSceneData;
  credits: undefined;
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

/** 이동할 씬 key 와 그 씬 data 의 짝. */
export type SceneRequest = {
  [K in keyof SceneDataMap]: { readonly key: K; readonly data: SceneDataMap[K] };
}[keyof SceneDataMap];

/** 이탈 상태가 바뀐 경우에만 요청한 씬을 시작한다. 같은 씬에서 여러 번 불려도 시작은 1번이다. */
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

export function createGameConfig(scenes: Phaser.Scene[]): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    transparent: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: scenes,
    audio: { noAudio: true },
  };
}
