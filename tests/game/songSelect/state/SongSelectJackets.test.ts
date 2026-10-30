import { describe, expect, it } from 'vitest';
import type { Song } from '../../../../src/data/songs.js';
import { SongSelectJackets } from '../../../../src/game/songSelect/state/SongSelectJackets.js';
import type { JacketTextures } from '../../../../src/game/songSelect/state/SongSelectJackets.js';
import type { JacketRange } from '../../../../src/game/songSelect/state/songSelectState.js';
import { requireDefined } from '../../../../src/invariant.js';

function makeSong(index: number): Song {
  return {
    id: `song-${index}`,
    title: `Title ${index}`,
    category: 'original',
    youtubeVideoId: 'aaaaaaaaaaa',
    jacketUrl: `https://example.test/${index}.jpg`,
    accentColor: 0x48d6e8,
    constellation: 'gemini',
    gameStartMs: 0,
    gameEndMs: 30000,
    chartIds: {},
  };
}

const SONGS = Array.from({ length: 12 }, (_, index) => makeSong(index));

function songsAt(...indexes: number[]): Song[] {
  return indexes.map((index) => SONGS[index] ?? makeSong(index));
}

function rangeOf(visible: readonly number[], adjacent: readonly number[]): JacketRange {
  return {
    visible: songsAt(...visible),
    adjacent: songsAt(...adjacent),
  };
}

interface QueueCall {
  readonly songIds: readonly string[];
  readonly onError: (song: Song) => void;
}

/** 로더 완료는 테스트가 loaded 에 곡을 넣거나 실패 콜백을 부른 뒤 complete 로 흉내 낸다. */
function createTextures(loadedSongIds: readonly string[] = []) {
  const loaded = new Set(loadedSongIds);
  const queued: QueueCall[] = [];
  const removed: string[][] = [];
  let startCount = 0;
  const textures: JacketTextures = {
    loadedSongIds: () => [...loaded],
    queue: (songs, onError) => {
      queued.push({
        songIds: songs.map((song) => song.id),
        onError,
      });
    },
    start: () => {
      startCount += 1;
    },
    remove: (songIds) => {
      removed.push([...songIds]);
      songIds.forEach((songId) => loaded.delete(songId));
    },
  };
  const lastQueue = (): QueueCall => {
    return requireDefined(queued.at(-1), 'No queue call');
  };
  return {
    textures,
    loaded,
    queued,
    removed,
    starts: () => startCount,
    loadLast: () => lastQueue().songIds.forEach((songId) => loaded.add(songId)),
    failLast: () => lastQueue().songIds.forEach((songId) => lastQueue().onError(songFor(songId))),
  };
}

function songFor(songId: string): Song {
  return requireDefined(
    SONGS.find((candidate) => candidate.id === songId),
    'Unknown song',
    songId,
  );
}

function idsOf(...indexes: number[]): string[] {
  return songsAt(...indexes).map((song) => song.id);
}

describe('SongSelectJackets', () => {
  it('preloads only visible songs without textures and does not start the loader', () => {
    const fake = createTextures(idsOf(1));
    const jackets = new SongSelectJackets(fake.textures);

    jackets.preload(rangeOf([0, 1, 2], [3, 4]));

    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 2)]);
    expect(fake.starts()).toBe(0);
  });

  it('requests adjacent songs in one batch on the first show after visible songs are ready', () => {
    const fake = createTextures();
    const jackets = new SongSelectJackets(fake.textures);
    const range = rangeOf([0, 1, 2], [3, 4]);
    jackets.preload(range);
    fake.loadLast();

    jackets.show(range, []);

    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 1, 2), idsOf(3, 4)]);
    expect(fake.starts()).toBe(1);
  });

  it('requests unready visible songs first and adjacent songs after that batch completes', () => {
    const fake = createTextures();
    const jackets = new SongSelectJackets(fake.textures);

    jackets.show(rangeOf([0, 1], [2, 3]), []);
    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 1)]);
    expect(fake.starts()).toBe(1);

    fake.loadLast();
    jackets.complete([]);

    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 1), idsOf(2, 3)]);
    expect(fake.starts()).toBe(2);
  });

  it('does not request songs whose textures already exist', () => {
    const fake = createTextures(idsOf(0, 1, 2, 3));
    const jackets = new SongSelectJackets(fake.textures);

    jackets.preload(rangeOf([0, 1], [2, 3]));
    jackets.show(rangeOf([0, 1], [2, 3]), []);

    expect(fake.queued).toEqual([]);
    expect(fake.starts()).toBe(0);
  });

  it('does not request songs again after they failed in preload or in a batch', () => {
    const fake = createTextures();
    const jackets = new SongSelectJackets(fake.textures);
    jackets.preload(rangeOf([0, 1], [2, 3]));
    fake.failLast();

    jackets.show(rangeOf([0, 1], [2, 3]), []);
    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 1), idsOf(2, 3)]);

    fake.failLast();
    jackets.complete([]);
    jackets.show(rangeOf([2, 3], [0, 1]), []);
    jackets.complete([]);

    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 1), idsOf(2, 3)]);
    expect(fake.starts()).toBe(1);
  });

  it('removes loaded jackets outside the range while keeping the range and in-use songs', () => {
    const fake = createTextures(idsOf(0, 1, 2, 3, 4, 5));
    const jackets = new SongSelectJackets(fake.textures);
    jackets.show(rangeOf([0, 1], [2, 3]), idsOf(4, 5));

    jackets.show(rangeOf([2, 3], [0, 1, 4]), idsOf(5));

    expect(fake.removed).toEqual([]);

    jackets.show(rangeOf([4, 5], [2, 3]), idsOf(1));

    expect(fake.removed).toEqual([idsOf(0)]);
    expect([...fake.loaded].sort()).toEqual(idsOf(1, 2, 3, 4, 5).sort());
  });

  it('waits for the running batch when the range changes and removes jackets it loaded outside the range', () => {
    const fake = createTextures();
    const jackets = new SongSelectJackets(fake.textures);
    jackets.show(rangeOf([0, 1], [2, 3]), []);

    jackets.show(rangeOf([6, 7], [4, 5]), []);

    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 1)]);
    expect(fake.starts()).toBe(1);

    fake.loadLast();
    jackets.complete([]);

    expect(fake.removed).toEqual([idsOf(0, 1)]);
    expect(fake.queued.map((call) => call.songIds)).toEqual([idsOf(0, 1), idsOf(6, 7)]);
    expect(fake.starts()).toBe(2);
  });

  it('does nothing when shown with the same range again', () => {
    const fake = createTextures(idsOf(0, 1, 9));
    const jackets = new SongSelectJackets(fake.textures);
    jackets.show(rangeOf([0, 1], [2]), []);
    const queueCount = fake.queued.length;
    const removeCount = fake.removed.length;
    const startCount = fake.starts();
    fake.loaded.add('song-10');

    jackets.show(rangeOf([0, 1], [2]), []);

    expect(fake.queued).toHaveLength(queueCount);
    expect(fake.removed).toHaveLength(removeCount);
    expect(fake.starts()).toBe(startCount);
  });

  it('does nothing when shown with the same range again after the batch completed', () => {
    const fake = createTextures(idsOf(9));
    const jackets = new SongSelectJackets(fake.textures);
    jackets.show(rangeOf([0, 1], [2]), []);
    fake.loadLast();
    jackets.complete([]);
    fake.loadLast();
    jackets.complete([]);
    const queueCount = fake.queued.length;
    const removeCount = fake.removed.length;
    const startCount = fake.starts();
    fake.loaded.add('song-10');

    jackets.show(rangeOf([0, 1], [2]), []);

    expect(fake.queued).toHaveLength(queueCount);
    expect(fake.removed).toHaveLength(removeCount);
    expect(fake.starts()).toBe(startCount);
  });

  it('ignores show, complete and failure callbacks after close', () => {
    const fake = createTextures(idsOf(8));
    const jackets = new SongSelectJackets(fake.textures);
    jackets.show(rangeOf([0, 1], [2, 3]), idsOf(8));

    jackets.close();
    fake.failLast();
    jackets.complete([]);
    jackets.show(rangeOf([4, 5], [6]), []);

    expect(fake.queued).toHaveLength(1);
    expect(fake.starts()).toBe(1);
    expect(fake.removed).toEqual([]);
  });
});
