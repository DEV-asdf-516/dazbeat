import { HTTP_STATUS } from '../../src/httpStatus.js';

type OriginRejectionCode = 'origin_not_allowed';

export const ORIGIN_REJECTIONS: Record<OriginRejectionCode, { status: number; message: string }> = {
  origin_not_allowed: {
    status: HTTP_STATUS.forbidden,
    message: 'Requests from this origin are not allowed.',
  },
};

export type OriginDecision = { kind: 'allowed' } | { kind: 'rejected'; code: OriginRejectionCode };

export function decideOrigin(
  origin: string,
  host: string,
  allowedOriginsText: string,
): OriginDecision {
  if (origin === '') {
    return { kind: 'allowed' };
  }
  const allowedOrigins = allowedOriginsText
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const allowed =
    allowedOrigins.includes(origin) || origin === `http://${host}` || origin === `https://${host}`;
  return allowed
    ? { kind: 'allowed' }
    : {
        kind: 'rejected',
        code: 'origin_not_allowed',
      };
}
