export type ComboTier = 'spark' | 'glow' | 'radiant' | 'stellar';

const GLOW_MIN_COMBO = 50;
const RADIANT_MIN_COMBO = 100;
const STELLAR_MIN_COMBO = 200;

export function getComboTier(combo: number): ComboTier {
  if (combo >= STELLAR_MIN_COMBO) {
    return 'stellar';
  }
  if (combo >= RADIANT_MIN_COMBO) {
    return 'radiant';
  }
  if (combo >= GLOW_MIN_COMBO) {
    return 'glow';
  }
  return 'spark';
}
