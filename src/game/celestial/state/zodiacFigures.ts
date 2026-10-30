import type { Zodiac } from '../../data/songs.js';

/**
 * node 는 긴 변을 1 로 정규화한 좌표(동쪽이 왼쪽, 북쪽이 위), edge 는 node index 쌍이다.
 * edge 목록은 첫 edge 를 빼면 한쪽 끝이 앞에서 이미 나온 node 이도록 이어진다.
 */
export interface ZodiacFigure {
  nodes: readonly (readonly [x: number, y: number])[];
  edges: readonly (readonly [from: number, to: number])[];
  accentNodeIndices: readonly number[];
  /** node 마다 실제 겉보기 등급. 작을수록 밝다. */
  magnitudes: readonly number[];
  /** node 마다 실제 분광형. 별빛 색을 정한다. */
  spectralClasses: readonly SpectralClass[];
}

export type SpectralClass = 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

// 실제 주요 별의 적경·적위를 국소 투영한 값이다. 물병자리 물병 부분(γ·η·π)만 ζ 기준 1.6배 벌렸다.
export const ZODIAC_FIGURES: Readonly<Record<Zodiac, ZodiacFigure>> = {
  // 41 Ari, Hamal, Sheratan, Mesarthim
  aries: {
    nodes: [
      [0.0, 0.0],
      [0.758, 0.293],
      [0.98, 0.497],
      [1.0, 0.615],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    accentNodeIndices: [1],
    magnitudes: [3.6, 2.0, 2.65, 3.9],
    spectralClasses: ['B', 'K', 'A', 'A'],
  },
  // Elnath, eps, delta, gamma, theta2, Aldebaran, zeta, lambda, omicron
  taurus: {
    nodes: [
      [0.085, 0.0],
      [0.52, 0.3],
      [0.563, 0.352],
      [0.586, 0.413],
      [0.519, 0.405],
      [0.465, 0.385],
      [0.0, 0.238],
      [0.73, 0.513],
      [1.0, 0.623],
    ],
    edges: [
      [5, 4],
      [4, 3],
      [3, 2],
      [2, 1],
      [1, 0],
      [5, 6],
      [3, 7],
      [7, 8],
    ],
    accentNodeIndices: [5, 0],
    magnitudes: [1.65, 3.5, 3.8, 3.65, 3.4, 0.85, 3.0, 3.4, 3.6],
    spectralClasses: ['B', 'K', 'K', 'K', 'A', 'K', 'B', 'B', 'G'],
  },
  // Castor, Pollux, tau, eps, mu, eta, iota, delta, zeta, Alhena
  gemini: {
    nodes: [
      [0.118, 0.0],
      [0.0, 0.187],
      [0.378, 0.08],
      [0.679, 0.328],
      [0.91, 0.455],
      [1.0, 0.455],
      [0.216, 0.198],
      [0.279, 0.48],
      [0.456, 0.549],
      [0.747, 0.751],
    ],
    edges: [
      [0, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [2, 6],
      [6, 1],
      [1, 7],
      [7, 8],
      [8, 9],
    ],
    accentNodeIndices: [1, 0],
    magnitudes: [1.6, 1.15, 4.4, 3.0, 2.9, 3.3, 3.8, 3.5, 3.9, 1.9],
    spectralClasses: ['A', 'K', 'K', 'G', 'M', 'M', 'K', 'F', 'G', 'A'],
  },
  // iota, gamma, delta, Acubens, Altarf
  cancer: {
    nodes: [
      [0.143, 0.0],
      [0.184, 0.373],
      [0.167, 0.542],
      [0.0, 0.864],
      [0.507, 1.0],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
    accentNodeIndices: [4],
    magnitudes: [4.0, 4.65, 3.9, 4.25, 3.5],
    spectralClasses: ['G', 'A', 'K', 'A', 'K'],
  },
  // eps, mu, zeta, Algieba, eta, Regulus, Chertan, Denebola, Zosma
  leo: {
    nodes: [
      [1.0, 0.077],
      [0.944, 0.0],
      [0.75, 0.089],
      [0.723, 0.212],
      [0.826, 0.318],
      [0.817, 0.482],
      [0.283, 0.363],
      [0.0, 0.393],
      [0.284, 0.188],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 3],
    ],
    accentNodeIndices: [5, 7, 3],
    magnitudes: [3.0, 3.9, 3.4, 2.0, 3.5, 1.35, 3.3, 2.1, 2.55],
    spectralClasses: ['G', 'K', 'F', 'K', 'A', 'B', 'A', 'A', 'A'],
  },
  // Zavijava, Zaniah, Porrima, Minelauva, Vindemiatrix, Spica, Heze, iota, mu
  virgo: {
    nodes: [
      [1.0, 0.213],
      [0.83, 0.27],
      [0.704, 0.288],
      [0.623, 0.175],
      [0.585, 0.0],
      [0.452, 0.513],
      [0.397, 0.268],
      [0.157, 0.394],
      [0.0, 0.386],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [3, 6],
      [6, 7],
      [7, 8],
    ],
    accentNodeIndices: [5],
    magnitudes: [3.6, 3.9, 2.7, 3.4, 2.8, 0.97, 3.4, 4.1, 3.9],
    spectralClasses: ['F', 'A', 'F', 'M', 'G', 'B', 'A', 'F', 'F'],
  },
  // Zubeneschamali, Zubenelgenubi, Zubenelakrab, sigma, upsilon
  libra: {
    nodes: [
      [0.253, 0.0],
      [0.583, 0.355],
      [0.019, 0.289],
      [0.416, 0.848],
      [0.0, 1.0],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 4],
    ],
    accentNodeIndices: [0, 1],
    magnitudes: [2.6, 2.75, 3.9, 3.3, 3.6],
    spectralClasses: ['B', 'A', 'K', 'M', 'K'],
  },
  // Acrab, Dschubba, pi, sigma, Antares, tau, eps, mu1, zeta2, eta, Sargas, kappa, Shaula
  scorpio: {
    nodes: [
      [0.882, 0.0],
      [0.929, 0.12],
      [0.942, 0.269],
      [0.739, 0.247],
      [0.665, 0.283],
      [0.606, 0.359],
      [0.476, 0.618],
      [0.46, 0.778],
      [0.435, 0.962],
      [0.276, 1.0],
      [0.047, 0.99],
      [0.0, 0.82],
      [0.081, 0.738],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
    ],
    accentNodeIndices: [4, 12],
    magnitudes: [2.6, 2.3, 2.9, 2.9, 1.0, 2.8, 2.3, 3.0, 3.6, 3.3, 1.85, 2.4, 1.6],
    spectralClasses: ['B', 'B', 'B', 'B', 'M', 'B', 'K', 'B', 'K', 'F', 'F', 'B', 'B'],
  },
  // Alnasl, Kaus Media, Kaus Australis, Kaus Borealis, phi, Nunki, tau, Ascella
  sagittarius: {
    nodes: [
      [1.0, 0.377],
      [0.752, 0.333],
      [0.7, 0.676],
      [0.638, 0.0],
      [0.348, 0.118],
      [0.191, 0.066],
      [0.0, 0.17],
      [0.071, 0.337],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [3, 4],
      [1, 4],
      [2, 7],
      [7, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ],
    accentNodeIndices: [2, 5],
    magnitudes: [2.95, 2.7, 1.8, 2.8, 3.2, 2.05, 3.3, 2.6],
    spectralClasses: ['K', 'K', 'B', 'K', 'B', 'B', 'K', 'A'],
  },
  // Algedi, Dabih, psi, omega, zeta, Deneb Algedi, Nashira, iota, theta
  capricorn: {
    nodes: [
      [1.0, 0.0],
      [0.966, 0.107],
      [0.685, 0.608],
      [0.621, 0.686],
      [0.229, 0.471],
      [0.0, 0.171],
      [0.078, 0.197],
      [0.278, 0.205],
      [0.462, 0.224],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 1],
    ],
    accentNodeIndices: [5, 0],
    magnitudes: [3.6, 3.05, 4.1, 4.1, 3.75, 2.85, 3.7, 4.3, 4.1],
    spectralClasses: ['G', 'K', 'F', 'M', 'G', 'A', 'A', 'G', 'A'],
  },
  // Albali, Sadalsuud, Sadalmelik, Sadachbia, zeta, eta, pi, theta, lambda, tau, Skat, phi, psi1
  aquarius: {
    nodes: [
      [1.0, 0.319],
      [0.704, 0.212],
      [0.473, 0.069],
      [0.395, 0.121],
      [0.317, 0.061],
      [0.247, 0.065],
      [0.356, 0.0],
      [0.398, 0.272],
      [0.157, 0.267],
      [0.177, 0.43],
      [0.143, 0.491],
      [0.011, 0.225],
      [0.0, 0.308],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [4, 6],
      [2, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [8, 11],
      [11, 12],
    ],
    accentNodeIndices: [1, 2],
    magnitudes: [3.8, 2.9, 2.95, 3.85, 3.65, 4.0, 4.8, 4.2, 3.7, 4.0, 3.3, 4.2, 4.2],
    spectralClasses: ['A', 'G', 'G', 'A', 'F', 'B', 'B', 'G', 'M', 'M', 'A', 'M', 'K'],
  },
  // gamma, kappa, lambda, iota, theta, omega, delta, eps, nu, Alrescha, omicron, eta, phi, upsilon, tau
  pisces: {
    nodes: [
      [1.0, 0.676],
      [0.941, 0.726],
      [0.849, 0.713],
      [0.862, 0.616],
      [0.934, 0.597],
      [0.744, 0.585],
      [0.445, 0.567],
      [0.358, 0.559],
      [0.125, 0.62],
      [0.0, 0.689],
      [0.101, 0.527],
      [0.185, 0.371],
      [0.293, 0.139],
      [0.258, 0.071],
      [0.306, 0.0],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
      [3, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
      [13, 14],
      [14, 12],
    ],
    accentNodeIndices: [9, 11],
    magnitudes: [3.7, 4.9, 4.5, 4.1, 4.3, 4.0, 4.4, 4.3, 4.4, 3.8, 4.25, 3.6, 4.65, 4.75, 4.5],
    spectralClasses: ['G', 'A', 'A', 'F', 'K', 'F', 'K', 'K', 'K', 'A', 'G', 'G', 'K', 'A', 'K'],
  },
};

export type FigurePoint = readonly [x: number, y: number];

/** 긴 변이 span 이 되도록 키워 (centerX, centerY) 가운데에 놓은 node 좌표. */
export function fitZodiacFigure(
  figure: ZodiacFigure,
  centerX: number,
  centerY: number,
  span: number,
): FigurePoint[] {
  const xs = figure.nodes.map(([x]) => x);
  const ys = figure.nodes.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = span / Math.max(maxX - minX, maxY - minY);
  return figure.nodes.map(([x, y]) => [
    centerX + (x - (minX + maxX) / 2) * scale,
    centerY + (y - (minY + maxY) / 2) * scale,
  ]);
}
