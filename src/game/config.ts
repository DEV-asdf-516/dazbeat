import Phaser from 'phaser';

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

export function createGameConfig(scenes: Phaser.Scene[]): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    transparent: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: scenes,
    audio: { noAudio: true },
    dom: { createContainer: true },
  };
}
