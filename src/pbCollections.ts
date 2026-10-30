import { collectionSpec } from './pbQuery.js';

export const SONGS = collectionSpec('songs', [
  'id',
  'collectionId',
  'collectionName',
  'key',
  'title',
  'category',
  'releasedOn',
  'youtubeVideoId',
  'jacket',
  'accentColor',
  'constellation',
  'album',
  'gameStartMs',
  'gameEndMs',
  'previewStartMs',
  'credit',
  'isPublished',
]);
// 곡 목록이 받는 곡 필드. collectionId 는 재킷 파일 URL 을, releasedOn 은 다음 배치 커서를 만드는 데 쓴다.
export const SONG_LIST_FIELDS = [
  'id',
  'collectionId',
  'collectionName',
  'key',
  'title',
  'category',
  'releasedOn',
  'youtubeVideoId',
  'jacket',
  'accentColor',
  'constellation',
  'gameStartMs',
  'gameEndMs',
  'previewStartMs',
  'credit',
] as const satisfies readonly (typeof SONGS.fields)[number][];
export const CHARTS = collectionSpec('charts', [
  'id',
  'song',
  'difficulty',
  'laneCount',
  'data',
  'revision',
]);
export const SCORES = collectionSpec('scores', ['user', 'chart', 'chartRevision']);
export const PLAY_SESSIONS = collectionSpec('play_sessions', [
  'id',
  'user',
  'chart',
  'chartRevision',
  'chartData',
  'issuedAt',
  'expiresAt',
]);
export const PLAY_SESSION_QUOTAS = collectionSpec('play_session_quotas', ['user']);
export const USERS = collectionSpec('users', ['id', 'email', 'nickname']);
export const PLAY_RESULTS = collectionSpec('play_results', ['user', 'session']);
export const EARNED_CHART_MARKS = collectionSpec('earned_chart_marks', [
  'user',
  'kind',
  'song',
  'difficulty',
  'chart',
  'chartRevision',
  'constellation',
  'source',
]);
export const EARNED_SONG_MARKS = collectionSpec('earned_song_marks', ['user', 'song', 'kind']);
export const EARNED_ACHIEVEMENTS = collectionSpec('earned_achievements', [
  'user',
  'achievement',
  'earnedAt',
]);
export const ALBUMS = collectionSpec('albums', ['id', 'key', 'name', 'sortOrder']);
export const ACHIEVEMENTS = collectionSpec('achievements', [
  'id',
  'key',
  'achievementSet',
  'category',
  'sortOrder',
  'kind',
  'target',
  'mark',
  'difficulty',
  'zodiac',
  'album',
  'retired',
  'nameKo',
  'nameJa',
  'nameEn',
]);
