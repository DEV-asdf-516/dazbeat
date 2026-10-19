import { describe, expect, it } from 'vitest';
import { getDifficultyAppearance } from '../../src/game/difficultyAppearance.js';

describe('getDifficultyAppearance', () => {
  it('is disabled for a difficulty without a chart even when hovered', () => {
    expect(
      getDifficultyAppearance({
        isSelected: false,
        isAvailable: false,
        isHovered: true,
      }),
    ).toBe('disabled');
    expect(
      getDifficultyAppearance({
        isSelected: false,
        isAvailable: false,
        isHovered: false,
      }),
    ).toBe('disabled');
  });

  it('is selected for the selected difficulty regardless of hover', () => {
    expect(
      getDifficultyAppearance({
        isSelected: true,
        isAvailable: true,
        isHovered: false,
      }),
    ).toBe('selected');
    expect(
      getDifficultyAppearance({
        isSelected: true,
        isAvailable: true,
        isHovered: true,
      }),
    ).toBe('selected');
  });

  it('is emphasized when hovered and normal otherwise for other charted difficulties', () => {
    expect(
      getDifficultyAppearance({
        isSelected: false,
        isAvailable: true,
        isHovered: true,
      }),
    ).toBe('emphasized');
    expect(
      getDifficultyAppearance({
        isSelected: false,
        isAvailable: true,
        isHovered: false,
      }),
    ).toBe('normal');
  });
});
