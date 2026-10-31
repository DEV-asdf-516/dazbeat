export type ScrollBarScroll =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'track' }
  | {
      readonly kind: 'thumb';
      readonly firstIndex: number;
      readonly visibleCount: number;
      readonly totalCount: number;
    };
