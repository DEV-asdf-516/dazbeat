import { collectionSpec } from './pbQuery.js';

export const SONGS = collectionSpec('songs', ['id', 'key', 'title', 'category', 'releasedOn']);
export const CHARTS = collectionSpec('charts', [
  'id',
  'song',
  'difficulty',
  'laneCount',
  'data',
  'revision',
]);
export const SCORES = collectionSpec('scores', ['user', 'chart', 'chartRevision']);
export const PLAY_SESSIONS = collectionSpec('play_sessions', ['id', 'user']);
export const PLAY_SESSION_QUOTAS = collectionSpec('play_session_quotas', ['user']);
export const USERS = collectionSpec('users', ['email']);
