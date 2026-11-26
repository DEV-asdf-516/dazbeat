import type Phaser from 'phaser';
import { createCanvasTexture } from '../../ui/view/textures/canvasTexture.js';
import { ICON_GRAIN, applyGrain } from '../../ui/view/textures/grain.js';
import { rgba, white } from '../../ui/view/textures/lightTextures.js';
import { COLORS, cssColor } from '../../ui/view/theme.js';
import type { VolumeMeterView } from '../state/settingsEditorState.js';
import type { ListDirection } from '../../../range.js';

export const CHEVRON_SIZE_PX = 14;
// 텍스처는 2배로 그려 축소 표시해 선 끝이 매끄럽게 보이게 한다.
const CHEVRON_TEXTURE_SCALE = 2;
// 'secondary' 글자의 '−'·'+' 획 두께에 맞춘다.
const CHEVRON_STROKE_PX = 2.5;
const SPEAKER_ICON_SIZE_PX = 24;
const SPEAKER_STROKE_PX = 2.2;
const SPEAKER_GRID_UNITS = 24;
const SPEAKER_WAVE_CENTER = {
  x: 12.8,
  y: 12,
} as const;
const SPEAKER_WAVE_RADII = [4, 7.4] as const;
const SPEAKER_WAVE_HALF_ANGLE_RAD = 0.78;
const METER_SEGMENT_WIDTH_PX = 10;
const METER_SEGMENT_HEIGHT_PX = 22;
const METER_SEGMENT_GAP_PX = 5;
const METER_SEGMENT_RADIUS_PX = 3;
const METER_STROKE_PX = 1.5;
const METER_MUTED_EMPTY_ALPHA = 0.5;

export function ensureVolumeMeterTexture(
  scene: Phaser.Scene,
  { level, levelCount, isMuted }: VolumeMeterView,
): string {
  const key = `volume-meter:${levelCount}:${level}:${isMuted}`;
  const widthPx = levelCount * METER_SEGMENT_WIDTH_PX + (levelCount - 1) * METER_SEGMENT_GAP_PX;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx,
      heightPx: METER_SEGMENT_HEIGHT_PX,
    },
    (context) => {
      const segments = Array.from({ length: levelCount }, (_, segment) => ({
        xPx: segment * (METER_SEGMENT_WIDTH_PX + METER_SEGMENT_GAP_PX),
        isFilled: segment < level,
      }));
      context.lineWidth = METER_STROKE_PX;
      const insetPx = METER_STROKE_PX / 2;
      for (const { xPx, isFilled } of segments.filter(({ isFilled }) => !isFilled || isMuted)) {
        // 음소거 중에도 채운 칸은 테두리로 남겨 음소거를 풀면 돌아갈 크기를 보여 준다.
        context.strokeStyle = isFilled
          ? cssColor(COLORS.textDisabled)
          : rgba(COLORS.border, isMuted ? METER_MUTED_EMPTY_ALPHA : 1);
        context.beginPath();
        context.roundRect(
          xPx + insetPx,
          insetPx,
          METER_SEGMENT_WIDTH_PX - METER_STROKE_PX,
          METER_SEGMENT_HEIGHT_PX - METER_STROKE_PX,
          METER_SEGMENT_RADIUS_PX,
        );
        context.stroke();
      }
      applyGrain(context, widthPx, METER_SEGMENT_HEIGHT_PX, ICON_GRAIN);
      if (isMuted) {
        return;
      }
      context.fillStyle = cssColor(COLORS.textPrimary);
      for (const { xPx } of segments.filter(({ isFilled }) => isFilled)) {
        context.beginPath();
        context.roundRect(
          xPx,
          0,
          METER_SEGMENT_WIDTH_PX,
          METER_SEGMENT_HEIGHT_PX,
          METER_SEGMENT_RADIUS_PX,
        );
        context.fill();
      }
    },
  );
  return key;
}

/** 흰색으로 그려 상태별 색을 tint 로 입힌다. 조정 버튼과 같은 크기의 칸 가운데에 그려 칸 전체가 눌린다. */
export function ensureSpeakerTexture(
  scene: Phaser.Scene,
  isMuted: boolean,
  cellSizePx: number,
): string {
  const key = isMuted ? 'ui:speaker-muted' : 'ui:speaker';
  const sizePx = cellSizePx * CHEVRON_TEXTURE_SCALE;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: sizePx,
      heightPx: sizePx,
    },
    (context) => {
      const unitPx = (SPEAKER_ICON_SIZE_PX * CHEVRON_TEXTURE_SCALE) / SPEAKER_GRID_UNITS;
      const originPx = (sizePx - SPEAKER_ICON_SIZE_PX * CHEVRON_TEXTURE_SCALE) / 2;
      context.translate(originPx, originPx);
      context.scale(unitPx, unitPx);
      context.strokeStyle = white(1);
      context.lineWidth = SPEAKER_STROKE_PX;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(4, 9.5);
      context.lineTo(7.2, 9.5);
      context.lineTo(12, 5.5);
      context.lineTo(12, 18.5);
      context.lineTo(7.2, 14.5);
      context.lineTo(4, 14.5);
      context.closePath();
      if (isMuted) {
        context.moveTo(16, 9.5);
        context.lineTo(21, 14.5);
        context.moveTo(21, 9.5);
        context.lineTo(16, 14.5);
      } else {
        for (const radius of SPEAKER_WAVE_RADII) {
          context.moveTo(
            SPEAKER_WAVE_CENTER.x + radius * Math.cos(SPEAKER_WAVE_HALF_ANGLE_RAD),
            SPEAKER_WAVE_CENTER.y - radius * Math.sin(SPEAKER_WAVE_HALF_ANGLE_RAD),
          );
          context.arc(
            SPEAKER_WAVE_CENTER.x,
            SPEAKER_WAVE_CENTER.y,
            radius,
            -SPEAKER_WAVE_HALF_ANGLE_RAD,
            SPEAKER_WAVE_HALF_ANGLE_RAD,
          );
        }
      }
      context.stroke();
      applyGrain(context, sizePx, sizePx, ICON_GRAIN);
    },
  );
  return key;
}

/** 흰색으로 그려 Button 이 상태별 색을 tint 로 입힌다. */
export function ensureChevronTexture(scene: Phaser.Scene, direction: ListDirection): string {
  const key = direction === 'next' ? 'ui:chevron-right' : 'ui:chevron-left';
  const sizePx = CHEVRON_SIZE_PX * CHEVRON_TEXTURE_SCALE;
  createCanvasTexture(
    scene,
    {
      key,
      widthPx: sizePx,
      heightPx: sizePx,
    },
    (context) => {
      const strokePx = CHEVRON_STROKE_PX * CHEVRON_TEXTURE_SCALE;
      const insetPx = strokePx / 2;
      // 꼭짓점이 가운데에 오도록 쉐브론의 폭은 높이의 절반으로 둔다.
      const tipXPx = direction === 'next' ? (sizePx * 3) / 4 - insetPx : sizePx / 4 + insetPx;
      const tailXPx = direction === 'next' ? sizePx / 4 + insetPx : (sizePx * 3) / 4 - insetPx;
      context.strokeStyle = white(1);
      context.lineWidth = strokePx;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(tailXPx, insetPx);
      context.lineTo(tipXPx, sizePx / 2);
      context.lineTo(tailXPx, sizePx - insetPx);
      context.stroke();
      applyGrain(context, sizePx, sizePx, ICON_GRAIN);
    },
  );
  return key;
}
