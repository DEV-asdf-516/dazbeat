import type { Notice } from '../../../data/notices.js';

/** 'none' 은 불러오는 중, 실패, 게시 공지 0개를 함께 뜻한다. 셋 다 아이콘과 창이 없다. */
export type NoticeFeed =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'ready';
      readonly items: readonly Notice[];
      readonly contentHeightPx: number;
    };

/** 'due' 는 자동으로 열 차례인데 가속 안내가 열려 있어 그 안내가 닫히기를 기다리는 중이다. */
export type NoticeBoard =
  | { readonly kind: 'closed' }
  | { readonly kind: 'due' }
  | { readonly kind: 'open'; readonly scrollPx: number };

export const NOTICE_VIEWPORT_HEIGHT_PX = 504;
export const NOTICE_SCROLL_STEP_PX = 96;

export function hasUnseenNotice(
  items: readonly Notice[],
  dismissedIds: ReadonlySet<string>,
): boolean {
  return items.some((notice) => !dismissedIds.has(notice.id));
}
