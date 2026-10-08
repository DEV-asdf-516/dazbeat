import { describe, expect, it } from 'vitest';
import { getCenteredSquare } from '../../../src/game/ui/jacketCrop.js';

describe('getCenteredSquare', () => {
  it('crops the horizontal center of a landscape image', () => {
    expect(getCenteredSquare(1280, 720)).toEqual({ x: 280, y: 0, size: 720 });
  });

  it('crops the vertical center of a portrait image', () => {
    expect(getCenteredSquare(720, 1280)).toEqual({ x: 0, y: 280, size: 720 });
  });

  it('keeps a square image whole', () => {
    expect(getCenteredSquare(512, 512)).toEqual({ x: 0, y: 0, size: 512 });
  });

  it('floors an odd difference', () => {
    expect(getCenteredSquare(101, 100)).toEqual({ x: 0, y: 0, size: 100 });
  });
});
