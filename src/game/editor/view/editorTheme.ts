import type { KeyHintStyle } from '../ui/keyHintView.js';
import { CELESTIAL_COLORS } from '../ui/theme.js';

export type EditorTypeRole = 'title' | 'control' | 'body' | 'meta';

/** 공용 TYPE_SCALE 은 다른 화면이 공유하므로 바꾸지 않는다. */
export const EDITOR_TYPE_SCALE: Record<EditorTypeRole, { sizePx: number; weight: number }> = {
  title: {
    sizePx: 22,
    weight: 600,
  },
  control: {
    sizePx: 15,
    weight: 500,
  },
  body: {
    sizePx: 15,
    weight: 400,
  },
  meta: {
    sizePx: 13,
    weight: 400,
  },
};

export const EDITOR_KEY_HINT_STYLE: KeyHintStyle = {
  keyType: EDITOR_TYPE_SCALE.meta,
  labelType: EDITOR_TYPE_SCALE.meta,
  keyColor: CELESTIAL_COLORS.textPrimary,
  labelColor: CELESTIAL_COLORS.textSecondary,
  capFill: CELESTIAL_COLORS.surface,
  capFillAlpha: 1,
  capBorder: CELESTIAL_COLORS.border,
  capBorderAlpha: 1,
  capHeightPx: 24,
  capPaddingXPx: 8,
  capMinWidthPx: 28,
  capLabelGapPx: 10,
  rowItemGapPx: 28,
  columnRowGapPx: 12,
};
