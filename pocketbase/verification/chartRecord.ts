import { parseJson } from '../../src/json.js';
import { isRecord } from '../../src/typeGuards.js';

export class InvalidChartRecordError extends Error {
  override readonly name = 'InvalidChartRecordError';
}

// data 와 레코드 laneCount 가 다르면 클라이언트와 결과 검증이 서로 다른 레인 수로 채보를 읽는다.
export function checkChartLaneCount(data: string, laneCount: number): void {
  const chart = parseJson(data);
  if (!isRecord(chart) || chart.laneCount !== laneCount) {
    throw new InvalidChartRecordError('Chart data laneCount does not match the record laneCount.');
  }
}
