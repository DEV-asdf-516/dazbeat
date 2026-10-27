import type { AchievementId } from './achievements.js';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  isEditor: boolean;
  featuredAchievement: AchievementId | null;
}
