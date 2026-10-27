import type Phaser from 'phaser';
import { ACHIEVEMENTS, findAchievement } from '../../data/achievements.js';
import type {
  AchievementDefinition,
  AchievementId,
  AchievementMark,
  AchievementRule,
} from '../../data/achievements.js';
import { requireDefined } from '../../invariant.js';
import { lerp } from '../../range.js';
import { ZODIAC_FIGURES, fitZodiacFigure } from '../celestial/zodiacFigures.js';
import { createCanvasTexture } from './canvasTexture.js';
import { fillFourPointStar, fillStar } from './starShapes.js';
import { CELESTIAL_COLORS, cssColor } from './theme.js';

// 시안(glyph-sheet)과 같은 100 단위 정사각 좌표계에서 그리고 표시 크기로 확대한다.
const GRID_UNITS = 100;
// 틀 꼭대기 표식(S·FC·AP 별)은 틀 선 위에 중심을 둬서 격자 위로 튀어나오므로, 잘리지 않게 사방을 띄운다.
const EDGE_PADDING_UNITS = 2.5;
const CENTER = 50;
const FRAME_RADIUS = 46;
const FRAME_LINE_WIDTH = 2.4;
const INNER_FRAME_RADIUS = 41.5;
const INNER_FRAME_LINE_WIDTH = 1.4;
// 틀 맨 위 표식 자리만큼 끊는 호의 길이(꼭대기 양쪽 각각). 이중 원도 같은 길이만큼 끊는다.
const TOP_MARK_GAP_ARC = 0.2 * FRAME_RADIUS;
const STAGE_DOT_STEP_DEG = 7.2;
const STAGE_DOT_RADIUS = 1.9;
const STAGE_DOT_ORBIT_RADIUS = 40;
const INNER_STAGE_DOT_ORBIT_RADIUS = 36;
const ZODIAC_FIGURE_SPAN = 52;
const ZODIAC_FIGURE_CENTER_Y = 49;
const ZODIAC_FIGURE_LINE_WIDTH = 1.6;
const ZODIAC_ACCENT_RADIUS = 4.6;
const ZODIAC_NODE_RADIUS = 2.2;
const EMBLEM_COLOR = cssColor(CELESTIAL_COLORS.highlight);
// 플레이 단계별 궤적 길이(바퀴). 1단계는 궤적 없이 별만 둔다.
// 플레이 횟수가 늘수록 궤적이 길어지고, 순서대로 가운데 별이 커진다.
const PLAY_TRAILS = [
  {
    id: 'FIRST_FINISH',
    turns: 0,
  },
  {
    id: 'PLAY_3',
    turns: 0.25,
  },
  {
    id: 'PLAY_10',
    turns: 0.5,
  },
  {
    id: 'PLAY_50',
    turns: 0.75,
  },
  {
    id: 'PLAY_100',
    turns: 1,
  },
  {
    id: 'PLAY_200',
    turns: 1.5,
  },
  {
    id: 'PLAY_500',
    turns: 2,
  },
] as const satisfies readonly { readonly id: AchievementId; readonly turns: number }[];
const PLAY_ORBIT_RADIUS_X = 27;
const PLAY_ORBIT_RADIUS_Y = 11;
// 한 바퀴를 넘긴 궤적은 바깥으로 넓어지는 나선이라 지난 바퀴와 겹치지 않고 별과도 부딪히지 않는다.
const PLAY_ORBIT_GROWTH_X_PER_TURN = 5.5;
const PLAY_ORBIT_GROWTH_Y_PER_TURN = 4.4;
const PLAY_ORBIT_TILT = -0.33;
const PLAY_ORBIT_START_ANGLE = Math.PI * 0.82;
const PLAY_TRAIL_SEGMENTS_PER_TURN = 240;
const PLAY_TRAIL_HEAD_LINE_WIDTH = 2.2;
const PLAY_TRAIL_TAIL_LINE_WIDTH = 1.1;
// 별 뒤로 지나는 궤도 절반을 흐리게 해 궤도가 별을 감싸 도는 깊이를 만든다.
const PLAY_ORBIT_BACK_ALPHA = 0.5;
const PLAY_ORBIT_BACK_LINE_SCALE = 0.75;
const PLAY_TRAIL_HEAD_RADIUS = 2.4;
const PLAY_STAR_RADIUS = 6;
const PLAY_STAR_GROWTH_PER_STAGE = 0.55;
const NEEDLE_STAR_WAIST = 0.11;
interface ZodiacStageArc {
  readonly centerDeg: number;
  readonly spanDeg: number;
}

type ZodiacStageShape =
  { readonly kind: 'arcs'; readonly arcs: readonly ZodiacStageArc[] } | { readonly kind: 'ring' };

// 황도 완성 수가 늘수록 원호가 늘다가 마지막에 원이 닫힌다(각도는 캔버스 기준, -90 이 꼭대기).
const ZODIAC_STAGES: Partial<Record<AchievementId, ZodiacStageShape>> = {
  ZODIAC_1_COMPLETE: {
    kind: 'arcs',
    arcs: [
      {
        centerDeg: -90,
        spanDeg: 70,
      },
    ],
  },
  ZODIAC_3_COMPLETE: {
    kind: 'arcs',
    arcs: [
      {
        centerDeg: -90,
        spanDeg: 100,
      },
      {
        centerDeg: 90,
        spanDeg: 100,
      },
    ],
  },
  ZODIAC_6_COMPLETE: {
    kind: 'arcs',
    arcs: [
      {
        centerDeg: -150,
        spanDeg: 80,
      },
      {
        centerDeg: -30,
        spanDeg: 80,
      },
      {
        centerDeg: 90,
        spanDeg: 80,
      },
    ],
  },
  ZODIAC_12_COMPLETE: { kind: 'ring' },
};
const ZODIAC_STAGE_ARC_RADIUS = 32;
const ZODIAC_STAGE_ARC_LINE_WIDTH = 2;
const ZODIAC_STAGE_ARC_SEGMENTS = 60;
// 원호 양 끝에서 굵기가 줄어드는 구간의 비율.
const ZODIAC_STAGE_ARC_TAPER = 0.25;
const ZODIAC_STAGE_STAR_RADIUS = 20;
const ZODIAC_STAGE_STAR_WAIST = 0.08;
// 별자리 여행 기호(STAR TRAVELER 시안 v2)의 선 굵기. 12단계 모두 같은 굵기로 그린다.
const TRAVEL_LINE_WIDTH = 2;
const TRAVEL_THIN_LINE_WIDTH = 1.4;
const TRAVEL_STAR_WAIST = 0.24;
const TRAVEL_NEEDLE_WAIST = 0.12;
const TRAVEL_GLOW_ALPHA = 0.45;
type Point = readonly [number, number];

export function getAchievementEmblemTexture(
  scene: Phaser.Scene,
  id: AchievementId,
  sizePx: number,
): string {
  const key = `achievement-emblem:${id}:${sizePx}`;
  createCanvasTexture(scene, key, sizePx, sizePx, (context) => {
    const achievement = requireDefined(findAchievement(id), 'Unknown achievement', id);
    const scale = sizePx / (GRID_UNITS + 2 * EDGE_PADDING_UNITS);
    context.scale(scale, scale);
    context.translate(EDGE_PADDING_UNITS, EDGE_PADDING_UNITS);
    context.strokeStyle = EMBLEM_COLOR;
    context.fillStyle = EMBLEM_COLOR;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    paintEmblem(context, achievement);
  });
  return key;
}

function paintEmblem(context: CanvasRenderingContext2D, achievement: AchievementDefinition): void {
  const { rule } = achievement;
  const isJourney = achievement.set === 'starJourney';
  const hasAscent = rule.kind === 'charts' && rule.difficulty === 'expert' && rule.mark !== 'clear';
  const hasTopMark = (rule.kind === 'zodiacComplete' && rule.mark !== 'clear') || hasAscent;

  context.lineWidth = FRAME_LINE_WIDTH;
  strokeFrame(context, FRAME_RADIUS, hasTopMark);
  if (isJourney) {
    withLineWidth(context, INNER_FRAME_LINE_WIDTH, () =>
      strokeFrame(context, INNER_FRAME_RADIUS, hasTopMark),
    );
  }
  paintStageDots(
    context,
    getStageDotCount(achievement),
    isJourney ? INNER_STAGE_DOT_ORBIT_RADIUS : STAGE_DOT_ORBIT_RADIUS,
  );
  paintSymbol(context, achievement);
  if (hasAscent) {
    withLineWidth(context, FRAME_LINE_WIDTH, () => {
      context.beginPath();
      context.moveTo(45, 6.5);
      context.lineTo(50, 1.5);
      context.lineTo(55, 6.5);
      context.stroke();
    });
  }
}

// 단계 점은 같은 계열(rule.kind + mark + difficulty) 안에서 target 이 몇 번째인지 보여 준다.
// 플레이, 황도 단계, 별자리 여행은 기호 자체가 단계를 보여 주고, 별자리 완성은 단계가 없다.
function getStageDotCount({ rule }: AchievementDefinition): number {
  switch (rule.kind) {
    case 'songs':
    case 'charts':
    case 'masteries': {
      const series = getSeries(rule);
      return ACHIEVEMENTS.filter(
        ({ rule: other }) =>
          (other.kind === 'songs' || other.kind === 'charts' || other.kind === 'masteries') &&
          getSeries(other) === series &&
          other.target <= rule.target,
      ).length;
    }
    case 'plays':
    case 'zodiacVisits':
    case 'zodiacComplete':
    case 'zodiacCompletions':
      return 0;
  }
}

function getSeries(rule: AchievementRule): string {
  const mark = 'mark' in rule ? rule.mark : '';
  const difficulty = rule.kind === 'charts' ? (rule.difficulty ?? '') : '';
  return `${rule.kind}:${mark}:${difficulty}`;
}

function strokeFrame(context: CanvasRenderingContext2D, radius: number, hasTopMark: boolean): void {
  const gap = hasTopMark ? TOP_MARK_GAP_ARC / radius : 0;
  const topAngle = -Math.PI / 2;
  context.beginPath();
  context.arc(CENTER, CENTER, radius, topAngle + gap, topAngle - gap + 2 * Math.PI);
  context.stroke();
}

function paintStageDots(
  context: CanvasRenderingContext2D,
  count: number,
  orbitRadius: number,
): void {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI / 2 + toRadians((index - (count - 1) / 2) * STAGE_DOT_STEP_DEG);
    fillDot(
      context,
      CENTER + Math.cos(angle) * orbitRadius,
      CENTER + Math.sin(angle) * orbitRadius,
      STAGE_DOT_RADIUS,
    );
  }
}

function paintSymbol(context: CanvasRenderingContext2D, achievement: AchievementDefinition): void {
  const { id, rule } = achievement;
  switch (rule.kind) {
    case 'songs':
      paintMark(context, 'clear', 50, 44, 15);
      return;
    case 'plays':
      paintPlayTrail(context, id);
      return;
    case 'charts':
      paintChartsSymbol(context, rule.mark, rule.difficulty === 'expert');
      return;
    case 'masteries':
      withLineWidth(context, 1.8, () => {
        traceDiamond(context, 50, 45, 15, 15);
        context.stroke();
      });
      for (const [x, y] of [
        [50, 30],
        [65, 45],
        [50, 60],
        [35, 45],
      ] as const) {
        fillDot(context, x, y, 3);
      }
      if (rule.mark !== 'clear') {
        paintMark(context, rule.mark, 50, 45, rule.mark === 'fc' ? 4 : 5);
      }
      return;
    case 'zodiacVisits':
      context.lineWidth = TRAVEL_LINE_WIDTH;
      requireDefined(TRAVEL_SYMBOLS[id], 'Missing travel symbol', id)(context);
      return;
    case 'zodiacComplete':
      paintZodiac(context, rule);
      return;
    case 'zodiacCompletions':
      paintZodiacStage(
        context,
        requireDefined(ZODIAC_STAGES[id], 'Missing zodiac stage shape', id),
      );
      return;
  }
}

function paintPlayTrail(context: CanvasRenderingContext2D, id: AchievementId): void {
  const stageIndex = PLAY_TRAILS.findIndex((trail) => trail.id === id);
  const { turns } = requireDefined(PLAY_TRAILS[stageIndex], 'Missing play trail', id);
  const angleAt = (turn: number): number => PLAY_ORBIT_START_ANGLE - turn * 2 * Math.PI;
  const pointAt = (turn: number): readonly [number, number] => {
    const angle = angleAt(turn);
    const x = (PLAY_ORBIT_RADIUS_X + PLAY_ORBIT_GROWTH_X_PER_TURN * turn) * Math.cos(angle);
    const y = (PLAY_ORBIT_RADIUS_Y + PLAY_ORBIT_GROWTH_Y_PER_TURN * turn) * Math.sin(angle);
    return [
      CENTER + x * Math.cos(PLAY_ORBIT_TILT) - y * Math.sin(PLAY_ORBIT_TILT),
      CENTER + x * Math.sin(PLAY_ORBIT_TILT) + y * Math.cos(PLAY_ORBIT_TILT),
    ];
  };
  const segmentCount = Math.ceil(turns * PLAY_TRAIL_SEGMENTS_PER_TURN);
  // 지난 바퀴까지 밝으면 나선이 겹쳐 뭉치므로 마지막 한 바퀴만 머리 쪽으로 밝아진다.
  const fadeTurns = Math.min(turns, 1);
  for (let index = 0; index < segmentCount; index += 1) {
    const fromTurn = (turns * index) / segmentCount;
    const toTurn = (turns * (index + 1)) / segmentCount;
    const middleTurn = (fromTurn + toTurn) / 2;
    const brightness = Math.max(0, 1 - (turns - middleTurn) / fadeTurns) ** 0.8;
    const isBehindStar = Math.sin(angleAt(middleTurn)) < 0;
    // 머리 가까이는 별 뒤에 있어도 밝게 둬서 궤적 끝이 묻히지 않게 한다.
    const depth = isBehindStar ? lerp(PLAY_ORBIT_BACK_ALPHA, 1, brightness ** 4) : 1;
    context.save();
    context.globalAlpha = lerp(0.5, 1, brightness) * depth;
    context.lineWidth =
      lerp(PLAY_TRAIL_TAIL_LINE_WIDTH, PLAY_TRAIL_HEAD_LINE_WIDTH, brightness) *
      (isBehindStar ? lerp(PLAY_ORBIT_BACK_LINE_SCALE, 1, brightness ** 4) : 1);
    context.beginPath();
    context.moveTo(...pointAt(fromTurn));
    context.lineTo(...pointAt(toTurn));
    context.stroke();
    context.restore();
  }
  if (turns > 0) {
    const [headX, headY] = pointAt(turns);
    fillGlow(context, headX, headY, PLAY_TRAIL_HEAD_RADIUS * 2.2, 0.55);
    fillDot(context, headX, headY, PLAY_TRAIL_HEAD_RADIUS);
  }
  const starRadius = PLAY_STAR_RADIUS + (stageIndex + 1) * PLAY_STAR_GROWTH_PER_STAGE;
  fillGlow(context, CENTER, CENTER, starRadius * 0.5, 0.45);
  fillFourPointStar(context, CENTER, CENTER, starRadius, NEEDLE_STAR_WAIST);
}

function paintZodiacStage(context: CanvasRenderingContext2D, shape: ZodiacStageShape): void {
  switch (shape.kind) {
    case 'ring':
      withLineWidth(context, ZODIAC_STAGE_ARC_LINE_WIDTH, () =>
        strokeRing(context, CENTER, CENTER, ZODIAC_STAGE_ARC_RADIUS),
      );
      break;
    case 'arcs':
      for (const { centerDeg, spanDeg } of shape.arcs) {
        const startAngle = toRadians(centerDeg - spanDeg / 2);
        const spanAngle = toRadians(spanDeg);
        for (let index = 0; index < ZODIAC_STAGE_ARC_SEGMENTS; index += 1) {
          const middle = (index + 0.5) / ZODIAC_STAGE_ARC_SEGMENTS;
          const taper = Math.min(1, Math.min(middle, 1 - middle) / ZODIAC_STAGE_ARC_TAPER) ** 0.7;
          context.save();
          context.globalAlpha = lerp(0.35, 1, taper);
          context.lineWidth = ZODIAC_STAGE_ARC_LINE_WIDTH * Math.max(0.2, taper);
          context.beginPath();
          context.arc(
            CENTER,
            CENTER,
            ZODIAC_STAGE_ARC_RADIUS,
            startAngle + (spanAngle * index) / ZODIAC_STAGE_ARC_SEGMENTS,
            startAngle + (spanAngle * (index + 1)) / ZODIAC_STAGE_ARC_SEGMENTS,
          );
          context.stroke();
          context.restore();
        }
      }
      break;
  }
  // 원이 닫히는 마지막 단계는 별 갈래가 원에 닿아 구조가 닫힌다.
  const starRadius = shape.kind === 'ring' ? ZODIAC_STAGE_ARC_RADIUS : ZODIAC_STAGE_STAR_RADIUS;
  fillGlow(context, CENTER, CENTER, starRadius * 0.3, 0.5);
  fillFourPointStar(context, CENTER, CENTER, starRadius, ZODIAC_STAGE_STAR_WAIST);
}

// 별자리 여행 기호(STAR TRAVELER 시안 v2)는 업적마다 모양이 달라 업적 ID 로 직접 고른다.
const TRAVEL_SYMBOLS: Partial<Record<AchievementId, (context: CanvasRenderingContext2D) => void>> =
  {
    ZODIAC_VISIT_3: (context) => {
      fillGlow(context, 50, 50, 6, TRAVEL_GLOW_ALPHA);
      fillFourPointStar(context, 50, 50, 18, TRAVEL_STAR_WAIST);
    },
    ZODIAC_VISIT_6: (context) => {
      fillCrescent(context, 48, 51, 16, [56, 45], 13);
      fillDot(context, 64, 37, 1.8);
    },
    ZODIAC_VISIT_9: (context) => {
      fillGlow(context, 50, 50, 6, TRAVEL_GLOW_ALPHA);
      fillRayStar(context, 50, 50, [24, 9, 16, 9, 24, 9, 16, 9], 3.2);
    },
    ZODIAC_VISIT_12: (context) => {
      const tilt = -0.45;
      const pointAt = (angle: number): Point => [
        50 + 22 * Math.cos(angle) * Math.cos(tilt) - 9 * Math.sin(angle) * Math.sin(tilt),
        50 + 22 * Math.cos(angle) * Math.sin(tilt) + 9 * Math.sin(angle) * Math.cos(tilt),
      ];
      context.beginPath();
      context.ellipse(50, 50, 22, 9, tilt, 0, 2 * Math.PI);
      context.stroke();
      fillDot(context, ...pointAt(0.45), 3.4);
      fillDot(context, ...pointAt(Math.PI + 0.55), 1.8);
    },
    ZODIAC_S_VISIT_3: (context) => {
      fillFourPointStar(context, 47, 39, 8.5, TRAVEL_STAR_WAIST);
      fillFourPointStar(context, 38, 55, 7, TRAVEL_STAR_WAIST);
      fillFourPointStar(context, 61, 59, 8, TRAVEL_STAR_WAIST);
    },
    ZODIAC_S_VISIT_6: (context) => {
      fillCrescent(context, 52, 50, 17, [43, 47], 15.5);
    },
    ZODIAC_S_VISIT_12: (context) => {
      // 고리 뒤쪽 절반을 별보다 먼저 그려 고리가 별을 감싸 도는 깊이를 만든다.
      withLineWidth(context, TRAVEL_THIN_LINE_WIDTH, () => {
        context.beginPath();
        context.ellipse(50, 52, 20, 5, 0, Math.PI, 2 * Math.PI);
        context.stroke();
      });
      fillGlow(context, 50, 52, 5, TRAVEL_GLOW_ALPHA);
      fillRayStar(context, 50, 52, [20, 11, 20, 11], 3.2);
      context.beginPath();
      context.ellipse(50, 52, 20, 5, 0, 0, Math.PI);
      context.stroke();
      fillFourPointStar(context, 50, 24, 3.5, TRAVEL_STAR_WAIST);
    },
    ZODIAC_FC_VISIT_3: (context) => {
      fillPetal(context, [50, 62], [33, 35], 8);
      fillPetal(context, [50, 62], [37, 70], 3.5);
      fillPetal(context, [53, 57], [61, 34], 4);
      fillFourPointStar(context, 64, 61, 6, TRAVEL_STAR_WAIST);
    },
    ZODIAC_FC_VISIT_6: (context) => {
      fillGlow(context, 58, 38, 4, TRAVEL_GLOW_ALPHA);
      fillFourPointStar(context, 58, 38, 10, TRAVEL_STAR_WAIST);
      context.beginPath();
      context.moveTo(29, 60);
      context.bezierCurveTo(41, 50, 55, 70, 71, 55);
      context.stroke();
      withLineWidth(context, TRAVEL_THIN_LINE_WIDTH, () => {
        context.beginPath();
        context.moveTo(33, 66);
        context.bezierCurveTo(44, 57, 56, 75, 68, 62);
        context.stroke();
      });
    },
    ZODIAC_FC_VISIT_12: (context) => {
      withLineWidth(context, TRAVEL_THIN_LINE_WIDTH, () => strokeRing(context, 50, 50, 11));
      fillGlow(context, 50, 50, 6, TRAVEL_GLOW_ALPHA);
      fillFourPointStar(context, 50, 50, 22, TRAVEL_NEEDLE_WAIST);
    },
    ZODIAC_AP_VISIT_3: (context) => {
      traceDiamond(context, 50, 50, 11, 22);
      context.stroke();
      traceDiamond(context, 50, 50, 5, 11);
      context.fill();
    },
    ZODIAC_AP_VISIT_6: (context) => {
      fillGlow(context, 50, 52, 6, TRAVEL_GLOW_ALPHA);
      fillRayStar(context, 50, 52, [20, 10, 18, 10, 20, 10, 18, 10], 3.2);
      traceDiamond(context, 50, 25, 2, 3.2);
      context.fill();
    },
  };

function paintChartsSymbol(
  context: CanvasRenderingContext2D,
  mark: AchievementMark,
  isExpert: boolean,
): void {
  switch (mark) {
    case 'clear':
      if (!isExpert) {
        paintMark(context, 'clear', 50, 44, 15);
        return;
      }
      withLineWidth(context, 3.2, () => {
        context.beginPath();
        context.moveTo(36, 56);
        context.lineTo(50, 40);
        context.lineTo(64, 56);
        context.stroke();
      });
      fillFourPointStar(context, 50, 28, 7);
      return;
    case 's':
      fillFourPointStar(context, 50, 45, 19, 0.26);
      return;
    case 'fc':
      withLineWidth(context, 3.2, () => strokeRing(context, 50, 45, 15));
      fillDot(context, 50, 30, 3.2);
      return;
    case 'ap':
      fillFivePointStar(context, 50, 46, 18);
      return;
  }
}

function paintZodiac(
  context: CanvasRenderingContext2D,
  rule: Extract<AchievementRule, { kind: 'zodiacComplete' }>,
): void {
  const figure = ZODIAC_FIGURES[rule.zodiac];
  const points = fitZodiacFigure(figure, CENTER, ZODIAC_FIGURE_CENTER_Y, ZODIAC_FIGURE_SPAN);
  const pointAt = (index: number): readonly [number, number] =>
    requireDefined(points[index], 'Zodiac edge points outside the figure', index);
  withLineWidth(context, ZODIAC_FIGURE_LINE_WIDTH, () => {
    for (const [from, to] of figure.edges) {
      context.beginPath();
      context.moveTo(...pointAt(from));
      context.lineTo(...pointAt(to));
      context.stroke();
    }
  });
  points.forEach(([x, y], index) => {
    if (figure.accentNodeIndices.includes(index)) {
      fillFourPointStar(context, x, y, ZODIAC_ACCENT_RADIUS);
    } else {
      fillDot(context, x, y, ZODIAC_NODE_RADIUS);
    }
  });
  if (rule.mark !== 'clear') {
    paintMark(context, rule.mark, 50, 4, rule.mark === 'fc' ? 5 : 5.2);
  }
}

// sizeUnit 은 기호마다 시안이 정한 크기 단위라 기호별 비율을 곱해 쓴다.
function paintMark(
  context: CanvasRenderingContext2D,
  mark: AchievementMark,
  x: number,
  y: number,
  sizeUnit: number,
): void {
  switch (mark) {
    case 'clear':
      traceDiamond(context, x, y, sizeUnit * 0.62, sizeUnit);
      context.fill();
      return;
    case 's':
      fillFourPointStar(context, x, y, sizeUnit * 1.15);
      return;
    case 'fc':
      withLineWidth(context, sizeUnit * 0.34, () => strokeRing(context, x, y, sizeUnit * 0.82));
      return;
    case 'ap':
      fillFivePointStar(context, x, y, sizeUnit * 1.1);
      return;
  }
}

function withLineWidth(
  context: CanvasRenderingContext2D,
  lineWidth: number,
  paint: () => void,
): void {
  context.save();
  context.lineWidth = lineWidth;
  paint();
  context.restore();
}

function fillFivePointStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  fillStar(context, x, y, 5, radius, radius * 0.45);
}

/** 꼭짓점마다 길이가 다른 별. rays 는 꼭대기부터 시계 방향 꼭짓점 길이다. */
function fillRayStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  rays: readonly number[],
  innerRadius: number,
): void {
  context.beginPath();
  rays.forEach((rayRadius, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / rays.length;
    const valleyAngle = angle + Math.PI / rays.length;
    context.lineTo(x + Math.cos(angle) * rayRadius, y + Math.sin(angle) * rayRadius);
    context.lineTo(
      x + Math.cos(valleyAngle) * innerRadius,
      y + Math.sin(valleyAngle) * innerRadius,
    );
  });
  context.closePath();
  context.fill();
}

/** 원에서 cut 원과 겹치는 부분을 덜어 낸 달. */
function fillCrescent(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  [cutX, cutY]: Point,
  cutRadius: number,
): void {
  context.save();
  context.beginPath();
  context.rect(x - radius, y - radius, 2 * radius, 2 * radius);
  context.arc(cutX, cutY, cutRadius, 0, 2 * Math.PI);
  context.clip('evenodd');
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fill();
  context.restore();
}

/** root 에서 tip 까지 양옆으로 halfWidth 만큼 부푼 잎 모양. */
function fillPetal(
  context: CanvasRenderingContext2D,
  [rootX, rootY]: Point,
  [tipX, tipY]: Point,
  halfWidth: number,
): void {
  const length = Math.hypot(tipX - rootX, tipY - rootY);
  const normalX = (-(tipY - rootY) / length) * halfWidth * 2;
  const normalY = ((tipX - rootX) / length) * halfWidth * 2;
  const middleX = (rootX + tipX) / 2;
  const middleY = (rootY + tipY) / 2;
  context.beginPath();
  context.moveTo(rootX, rootY);
  context.quadraticCurveTo(middleX + normalX, middleY + normalY, tipX, tipY);
  context.quadraticCurveTo(middleX - normalX, middleY - normalY, rootX, rootY);
  context.fill();
}

function traceDiamond(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
): void {
  context.beginPath();
  context.moveTo(x, y - halfHeight);
  context.lineTo(x + halfWidth, y);
  context.lineTo(x, y + halfHeight);
  context.lineTo(x - halfWidth, y);
  context.closePath();
}

function fillDot(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fill();
}

function strokeRing(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.stroke();
}

/** 중심에서 바깥으로 사라지는 은은한 빛. 별과 궤적 끝을 또렷한 점이 아니라 빛나는 점으로 보이게 한다. */
function fillGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, EMBLEM_COLOR);
  glow.addColorStop(1, `${EMBLEM_COLOR}00`);
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fill();
  context.restore();
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
