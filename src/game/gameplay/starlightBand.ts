export type StarlightBand = 'stable' | 'caution' | 'danger';

const STABLE_MIN_HP = 70;
const CAUTION_MIN_HP = 35;

/** STARLIGHT 게이지의 표현 단계. 경계값은 위 단계에 속한다(70 은 stable, 35 는 caution). */
export function getStarlightBand(hp: number): StarlightBand {
  if (hp >= STABLE_MIN_HP) {
    return 'stable';
  }
  if (hp >= CAUTION_MIN_HP) {
    return 'caution';
  }
  return 'danger';
}
