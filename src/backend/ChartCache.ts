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

  constructor(private readonly pb: PocketBase) {}

  async load(ref: ChartRef): Promise<LoadedChart> {
    return this.entries.get(ref.chartId) ?? this.fetch(ref);
  }

  async reload(ref: ChartRef): Promise<LoadedChart> {
    // 받기가 실패해도 낡은 것으로 판명된 항목이 남지 않도록 받기 전에 버린다.
    this.entries.delete(ref.chartId);
    return this.fetch(ref);
  }

  put(chartId: string, loaded: LoadedChart): void {
    this.entries.set(chartId, freezeCopy(loaded));
  }

  private async fetch(ref: ChartRef): Promise<LoadedChart> {
    const loaded = freezeCopy(await loadChart(this.pb, ref));
    this.entries.set(ref.chartId, loaded);
    return loaded;
  }
}
