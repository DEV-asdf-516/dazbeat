import { isRecord } from '../../../typeGuards.js';
import { readMenuAction } from '../../ui/state/menuAction.js';

export type BrowserKind = 'chrome' | 'edge' | 'whale' | 'opera' | 'firefox' | 'other';

export type AccelerationNotice =
  { readonly kind: 'closed' } | { readonly kind: 'open'; readonly browser: BrowserKind };

export interface BrowserIdentity {
  readonly userAgentData: unknown;
  readonly userAgent: string;
}

export function createAccelerationNotice(input: {
  readonly isSoftwareRendering: boolean;
  readonly isDismissed: boolean;
  readonly browser: BrowserIdentity;
}): AccelerationNotice {
  if (!input.isSoftwareRendering || input.isDismissed) {
    return { kind: 'closed' };
  }
  return {
    kind: 'open',
    browser: readBrowserKind(input.browser),
  };
}

// Chromium 계열 userAgent 는 Chrome/ 을 함께 실으므로 Chrome 을 맨 뒤에 둔다.
const BROWSER_MARKERS = [
  {
    kind: 'edge',
    brands: ['Microsoft Edge'],
    userAgent: 'Edg/',
  },
  {
    kind: 'whale',
    brands: ['Whale'],
    userAgent: 'Whale/',
  },
  {
    kind: 'opera',
    brands: ['Opera', 'Opera GX'],
    userAgent: 'OPR/',
  },
  {
    kind: 'firefox',
    brands: [],
    userAgent: 'Firefox/',
  },
  {
    kind: 'chrome',
    brands: ['Google Chrome'],
    userAgent: 'Chrome/',
  },
] as const satisfies readonly {
  readonly kind: Exclude<BrowserKind, 'other'>;
  readonly brands: readonly string[];
  readonly userAgent: string;
}[];

// brands 는 Chromium 계열만 보안 출처에서 주고, 다른 Chromium 브라우저도 Chromium 표식을 함께 싣는다.
// 그래서 brands 가 있으면 그것만 믿고, 읽을 수 없을 때만 userAgent 문자열로 정한다.
function readBrowserKind({ userAgentData, userAgent }: BrowserIdentity): BrowserKind {
  const brands = isRecord(userAgentData) ? userAgentData.brands : undefined;
  if (Array.isArray(brands)) {
    const names = brands.map((entry: unknown) => (isRecord(entry) ? entry.brand : undefined));
    const marker = BROWSER_MARKERS.find(({ brands: markerBrands }) =>
      markerBrands.some((brand) => names.includes(brand)),
    );
    return marker?.kind ?? 'other';
  }
  return BROWSER_MARKERS.find((marker) => userAgent.includes(marker.userAgent))?.kind ?? 'other';
}

// 영구 저장은 버튼으로만 하므로 Esc 도 확인처럼 닫기만 한다.
export function readAccelerationNoticeKey(
  notice: AccelerationNotice,
  event: Pick<KeyboardEvent, 'code' | 'repeat'>,
): 'close' | 'block' | 'pass' {
  if (notice.kind === 'closed') {
    return 'pass';
  }
  switch (readMenuAction(event)) {
    case 'confirm':
    case 'back':
      return 'close';
    default:
      return 'block';
  }
}
