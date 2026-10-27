import type { AchievementId } from '../../data/achievements.js';

export interface ResultScreen {
  showAchievements(ids: readonly AchievementId[]): void;
}

export class ResultController {
  private isClosed = false;

  constructor(screen: ResultScreen, newAchievements: Promise<readonly AchievementId[]>) {
    // 제출 실패는 GameplayController 가 빈 목록으로 바꿔 두므로 이 Promise 는 거절되지 않는다.
    void newAchievements.then((ids) => {
      if (this.isClosed || ids.length === 0) {
        return;
      }
      screen.showAchievements(ids);
    });
  }

  close(): void {
    this.isClosed = true;
  }
}
