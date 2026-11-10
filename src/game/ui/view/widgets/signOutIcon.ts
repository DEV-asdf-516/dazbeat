import type Phaser from 'phaser';
import { createLineIconTexture } from './listControlIcons.js';

export function getSignOutIconTexture(scene: Phaser.Scene, sizePx: number): string {
  return createLineIconTexture(scene, `sign-out-icon:${sizePx}`, sizePx, (context) => {
    context.moveTo(15, 10);
    context.lineTo(15, 8.5);
    context.arc(10, 8.5, 5, 0, Math.PI, true);
    context.lineTo(5, 20.5);
    context.moveTo(15, 15.5);
    context.lineTo(15, 20.5);
    context.moveTo(3.5, 20.5);
    context.lineTo(16.5, 20.5);
    context.moveTo(9, 12.75);
    context.lineTo(21, 12.75);
    context.moveTo(18, 9.75);
    context.lineTo(21, 12.75);
    context.lineTo(18, 15.75);
  });
}
