export type DifficultyAppearance = 'disabled' | 'selected' | 'emphasized' | 'normal';

/** 고른 난이도는 채보가 있는 난이도에서만 고르므로 채보 유무보다 먼저 본다. */
export function getDifficultyAppearance({
  isSelected,
  isAvailable,
  isHovered,
}: {
  isSelected: boolean;
  isAvailable: boolean;
  isHovered: boolean;
}): DifficultyAppearance {
  if (isSelected) {
    return 'selected';
  }
  if (!isAvailable) {
    return 'disabled';
  }
  return isHovered ? 'emphasized' : 'normal';
}
