import { isRecord, isString } from '../../src/typeGuards.js';

export class InvalidSessionRequestError extends Error {
  override readonly name = 'InvalidSessionRequestError';
}

export interface SessionRequest {
  readonly chartId: string;
  readonly chartRevision: string;
}

export function parseSessionRequest(body: unknown): SessionRequest {
  if (!isRecord(body) || !isString(body.chartId) || !isString(body.chartRevision)) {
    throw new InvalidSessionRequestError('chartId and chartRevision must be strings.');
  }
  return {
    chartId: body.chartId,
    chartRevision: body.chartRevision,
  };
}
