export type StarlightBand = 'stable' | 'caution' | 'danger';

const STABLE_MIN_HP = 70;
const CAUTION_MIN_HP = 35;

export function getStarlightBand(hp: number): StarlightBand {
  if (hp >= STABLE_MIN_HP) {
    return 'stable';
  }
  if (hp >= CAUTION_MIN_HP) {
    return 'caution';
  }
  return 'danger';
}

const BAND_ORDER: readonly StarlightBand[] = ['stable', 'caution', 'danger'];

export function isStarlightDrop(previous: StarlightBand, next: StarlightBand): boolean {
  return BAND_ORDER.indexOf(next) > BAND_ORDER.indexOf(previous);
}
