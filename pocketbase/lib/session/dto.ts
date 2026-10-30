import { HTTP_STATUS } from '../../../src/httpStatus.js';
import { isRecord, isString } from '../../../src/typeGuards.js';

export interface SessionRequest {
  readonly chartId: string;
  readonly chartRevision: string;
}

export function parseSessionRequest(body: unknown): SessionRequest {
  if (!isRecord(body) || !isString(body.chartId) || !isString(body.chartRevision)) {
    throw new SessionRejectedError('invalid_request');
  }
  return {
    chartId: body.chartId,
    chartRevision: body.chartRevision,
  };
}

type SessionRejectionCode =
  | 'invalid_request'
  | 'chart_not_found'
  | 'chart_changed'
  | 'session_not_found'
  | 'session_rate_limited';

export const SESSION_REJECTIONS: Record<SessionRejectionCode, { status: number; message: string }> =
  {
    invalid_request: {
      status: HTTP_STATUS.badRequest,
      message: 'chartId and chartRevision must be strings.',
    },
    chart_not_found: {
      status: HTTP_STATUS.notFound,
      message: 'The chart does not exist.',
    },
    chart_changed: {
      status: HTTP_STATUS.conflict,
      message: 'The chart has changed since it was loaded.',
    },
    session_not_found: {
      status: HTTP_STATUS.notFound,
      message: 'The play session does not exist.',
    },
    session_rate_limited: {
      status: HTTP_STATUS.tooManyRequests,
      message: 'Too many play sessions were requested. Try again later.',
    },
  };

export class SessionRejectedError extends Error {
  override readonly name = 'SessionRejectedError';

  constructor(readonly code: SessionRejectionCode) {
    super(SESSION_REJECTIONS[code].message);
  }
}

export interface VerificationSong {
  key: string;
  gameStartMs: number;
  gameEndMs: number;
}

export type PlayRejectionCode =
  | 'session_expired'
  | 'chart_changed'
  | 'chart_invalid'
  | 'too_short'
  | 'invalid_events'
  | 'not_finished';

export const PLAY_REJECTION_RESPONSES: Record<
  PlayRejectionCode,
  { status: number; message: string }
> = {
  session_expired: {
    status: HTTP_STATUS.gone,
    message: 'The play session has expired.',
  },
  chart_changed: {
    status: HTTP_STATUS.conflict,
    message: 'The chart has changed since the play session was issued.',
  },
  chart_invalid: {
    status: HTTP_STATUS.internalServerError,
    message: 'The stored chart is invalid.',
  },
  too_short: {
    status: HTTP_STATUS.unprocessableContent,
    message: 'The result was submitted sooner than the play could finish.',
  },
  invalid_events: {
    status: HTTP_STATUS.badRequest,
    message: 'The submitted input events are invalid.',
  },
  not_finished: {
    status: HTTP_STATUS.unprocessableContent,
    message: 'The replayed play did not finish.',
  },
};

export interface SessionQuota {
  windowStartedAtMs: number;
  issuedCount: number;
}
