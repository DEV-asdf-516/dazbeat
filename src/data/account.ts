import type { AchievementId } from './achievements.js';
import type { Nickname } from './nickname.js';

export interface AuthUser {
  id: string;
  email: string;
  nickname: Nickname;
  isEditor: boolean;
  featuredAchievement: AchievementId | null;
}
