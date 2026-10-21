import type PocketBase from 'pocketbase';
import type { ChartRef } from '../data/songs.js';
import { loadChart, type LoadedChart } from './charts.js';

// 보관한 값을 호출자가 바꿔 캐시가 조용히 오염되지 않도록, 넘겨받은 객체는 그대로 두고 동결한 사본을 만든다.
function freezeCopy(loaded: LoadedChart): LoadedChart {
  const { chart } = loaded;
  return Object.freeze({
    revision: loaded.revision,
    chart: Object.freeze({
      ...chart,
      notes: Object.freeze(chart.notes.map((note) => Object.freeze({ ...note }))),
    }),
  });
}

export class ChartCache {
  private readonly entries = new Map<string, LoadedChart>();
  // 늦게 끝난 받기가 그 뒤에 시작한 받기나 저장 결과를 덮지 않도록, 차트마다 마지막으로 시작한 받기만 남긴다.
  private readonly inFlight = new Map<string, Promise<LoadedChart>>();

  constructor(private readonly pb: PocketBase) {}

  async load(ref: ChartRef): Promise<LoadedChart> {
    return this.entries.get(ref.chartId) ?? this.inFlight.get(ref.chartId) ?? this.fetch(ref);
  }

  async reload(ref: ChartRef): Promise<LoadedChart> {
    // 받기가 실패해도 낡은 것으로 판명된 항목이 남지 않도록 받기 전에 버린다.
    this.entries.delete(ref.chartId);
    return this.fetch(ref);
  }

  put(chartId: string, loaded: LoadedChart): void {
    this.inFlight.delete(chartId);
    this.entries.set(chartId, freezeCopy(loaded));
  }

  private async fetch(ref: ChartRef): Promise<LoadedChart> {
    const request = loadChart(this.pb, ref).then(freezeCopy);
    this.inFlight.set(ref.chartId, request);
    try {
      const loaded = await request;
      if (this.inFlight.get(ref.chartId) === request) {
        this.entries.set(ref.chartId, loaded);
      }
      return loaded;
    } finally {
      if (this.inFlight.get(ref.chartId) === request) {
        this.inFlight.delete(ref.chartId);
      }
    }
  }
}
