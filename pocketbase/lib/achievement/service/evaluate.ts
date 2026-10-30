import { ACHIEVEMENT_MARK_KINDS } from '../../../../src/data/achievements.js';
import type { AchievementMark, AchievementRule } from '../../../../src/data/achievements.js';
import type { Zodiac } from '../../../../src/data/songs.js';
import { clamp } from '../../../../src/range.js';
import { getRank } from '../../../../src/rhythm/rank.js';
import { isAllPerfect, isFullCombo } from '../../../../src/rhythm/score.js';
import type { Difficulty, FinishedGameplayResult } from '../../../../src/rhythm/types.js';
import type { AchievementEvaluation, AchievementSnapshot } from '../dto.js';

interface MarkTally {
  readonly songs: Set<string>;
  readonly charts: Set<string>;
  readonly expertCharts: Set<string>;
  readonly zodiacs: Set<Zodiac>;
  /** 현재 revision 기준으로 곡마다 달성한 난이도. */
  readonly currentDifficulties: Map<string, Set<Difficulty>>;
}

interface Measurement {
  readonly current: number;
  readonly target: number;
  readonly isMet: boolean;
}

export function getPlayMarks(result: FinishedGameplayResult): readonly AchievementMark[] {
  if (!result.cleared) {
    return [];
  }
  const marks: AchievementMark[] = ['clear'];
  if (getRank(result.accuracy) === 'S') {
    marks.push('s');
  }
  if (isFullCombo(result.counts)) {
    marks.push('fc');
  }
  if (isAllPerfect(result.counts)) {
    marks.push('ap');
  }
  return marks;
}

export function evaluateAchievements(snapshot: AchievementSnapshot): AchievementEvaluation {
  const songMarkDifficulties = new Map<string, readonly Difficulty[]>();
  const zodiacSongs = new Map<Zodiac, string[]>();
  const albumSongs = new Map<string, string[]>();
  for (const song of snapshot.publishedSongs) {
    songMarkDifficulties.set(song.id, song.difficulties);
    const songs = zodiacSongs.get(song.constellation) ?? [];
    songs.push(song.id);
    zodiacSongs.set(song.constellation, songs);
    if (song.album !== null) {
      const albumSongIds = albumSongs.get(song.album) ?? [];
      albumSongIds.push(song.id);
      albumSongs.set(song.album, albumSongIds);
    }
  }

  const tallies: Record<AchievementMark, MarkTally> = {
    clear: createTally(),
    s: createTally(),
    fc: createTally(),
    ap: createTally(),
  };
  for (const mark of snapshot.marks) {
    const tally = tallies[mark.kind];
    const key = getChartKey(mark.song, mark.difficulty);
    tally.songs.add(mark.song);
    tally.charts.add(key);
    if (mark.difficulty === 'expert') {
      tally.expertCharts.add(key);
    }
    if (mark.constellation !== null) {
      tally.zodiacs.add(mark.constellation);
    }
    // revision 이 바뀌었거나 지워진 채보의 증거는 과거 이력에만 세고 현재 완성도와 곡 마스터에는 세지 않는다.
    if (mark.isCurrent) {
      const difficulties = tally.currentDifficulties.get(mark.song) ?? new Set<Difficulty>();
      difficulties.add(mark.difficulty);
      tally.currentDifficulties.set(mark.song, difficulties);
    }
  }

  const songMarkedSongs: Record<AchievementMark, Set<string>> = {
    clear: new Set(),
    s: new Set(),
    fc: new Set(),
    ap: new Set(),
  };
  for (const songMark of snapshot.songMarks) {
    songMarkedSongs[songMark.kind].add(songMark.song);
  }
  const newSongMarks: { song: string; kind: AchievementMark }[] = [];

  for (const mark of ACHIEVEMENT_MARK_KINDS) {
    for (const [song, achieved] of tallies[mark].currentDifficulties) {
      const required = songMarkDifficulties.get(song);
      if (
        required === undefined ||
        songMarkedSongs[mark].has(song) ||
        !required.every((difficulty) => achieved.has(difficulty))
      ) {
        continue;
      }
      songMarkedSongs[mark].add(song);
      newSongMarks.push({
        song,
        kind: mark,
      });
    }
  }

  const measure = (rule: Exclude<AchievementRule, { kind: 'zodiacCompletions' }>): Measurement => {
    switch (rule.kind) {
      case 'plays':
        return measureFixed(snapshot.playCount, rule.target);
      case 'songs':
        return measureFixed(tallies[rule.mark].songs.size, rule.target);
      case 'charts': {
        const tally = tallies[rule.mark];
        const charts = rule.difficulty === null ? tally.charts : tally.expertCharts;
        return measureFixed(charts.size, rule.target);
      }
      case 'songMarks':
        return measureFixed(songMarkedSongs[rule.mark].size, rule.target);
      case 'zodiacVisits':
        return measureFixed(tallies[rule.mark].zodiacs.size, rule.target);
      case 'zodiacComplete':
        return measureSongs(tallies[rule.mark], zodiacSongs.get(rule.zodiac) ?? []);
      case 'album':
        return measureSongs(tallies[rule.mark], albumSongs.get(rule.album) ?? []);
    }
  };

  const activeDefinitions = snapshot.definitions.filter(({ isRetired }) => !isRetired);
  const completedZodiacCount = activeDefinitions.filter(
    ({ id, rule }) =>
      rule.kind === 'zodiacComplete' &&
      rule.mark === 'clear' &&
      (snapshot.earned.has(id) || measure(rule).isMet),
  ).length;
  const measured = activeDefinitions.map(({ id, rule }) => ({
    id,
    ...(rule.kind === 'zodiacCompletions'
      ? measureFixed(completedZodiacCount, rule.target)
      : measure(rule)),
  }));

  return {
    newSongMarks,
    newAchievements: measured
      .filter(({ id, isMet }) => isMet && !snapshot.earned.has(id))
      .map(({ id }) => id),
    progress: measured.map(({ id, current, target }) => ({
      id,
      current,
      target,
    })),
    stats: {
      playCount: snapshot.playCount,
      clearedSongCount: tallies.clear.songs.size,
      sChartCount: tallies.s.charts.size,
      fullComboChartCount: tallies.fc.charts.size,
      allPerfectChartCount: tallies.ap.charts.size,
    },
  };
}

function createTally(): MarkTally {
  return {
    songs: new Set(),
    charts: new Set(),
    expertCharts: new Set(),
    zodiacs: new Set(),
    currentDifficulties: new Map(),
  };
}

/** 서로 다른 채보는 곡+난이도다(키 수, revision 무관). */
function getChartKey(song: string, difficulty: Difficulty): string {
  return `${song}:${difficulty}`;
}

/** 표시 분자는 목표를 넘지 않고, 분모는 목표로 고정한다. */
function measureFixed(count: number, target: number): Measurement {
  return {
    current: clamp(count, 0, target),
    target,
    isMet: count >= target,
  };
}

function measureSongs(tally: MarkTally, targetSongs: readonly string[]): Measurement {
  const current = targetSongs.filter((song) => tally.currentDifficulties.has(song)).length;
  return {
    current,
    target: targetSongs.length,
    isMet: targetSongs.length > 0 && current === targetSongs.length,
  };
}
