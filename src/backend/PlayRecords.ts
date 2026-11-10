import type PocketBase from 'pocketbase';
import type { AchievementCatalog } from '../data/achievements.js';
import type { RankingSubmission } from '../data/playSession.js';
import type { PlaySubmission } from '../data/playSubmission.js';
import type { MyChartRecord } from '../data/ranking.js';
import { submitPlay } from './playSessions.js';
import { loadMyRecords } from './rankings.js';

export class PlayRecords {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly pb: PocketBase,
    private readonly catalog: AchievementCatalog,
  ) {}

  submit(sessionId: string, submission: PlaySubmission): Promise<RankingSubmission> {
    const request = submitPlay(this.pb, this.catalog, sessionId, submission);
    // 끝난 제출의 결과가 다음 제출의 결과에 묶여 계속 남지 않도록 값을 버린다.
    this.pending = Promise.allSettled([this.pending, request]).then(() => undefined);
    return request;
  }

  async loadMine(): Promise<readonly MyChartRecord[]> {
    await this.pending;
    return loadMyRecords(this.pb);
  }
}
