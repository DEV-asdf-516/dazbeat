import Phaser from 'phaser';
import PocketBase from 'pocketbase';
import {
  cancelSignInWithGoogle,
  deleteAccount,
  getCurrentUser,
  refreshCurrentUser,
  signInWithGoogle,
  signOut,
} from './backend/auth.js';
import { loadAchievementCatalog } from './backend/achievements.js';
import { ChartCache } from './backend/ChartCache.js';
import { loadChart, saveChart } from './backend/charts.js';
import { PlayRecords } from './backend/PlayRecords.js';
import { preparePlay } from './backend/playSessions.js';
import {
  changeNickname,
  isNicknameAvailable,
  loadProfile,
  setFeaturedAchievement,
} from './backend/profile.js';
import { loadLeaderboard, loadMyRankings, loadMyTopRanks } from './backend/rankings.js';
import { loadSongBatch } from './backend/songLoader.js';
import type { AchievementCatalog } from './data/achievements.js';
import type { PreparedChart } from './data/playSession.js';
import type { ChartRef, SongScope } from './data/songs.js';
import { getAccountIdentity } from './game/ui/state/accountIdentity.js';
import type { AccountSource } from './game/ui/state/accountIdentity.js';
import type { AccountAuth } from './game/app/accountState.js';
import { loadCelestialCatalog } from './game/celestial/state/celestialCatalog.js';
import { createGameConfig } from './game/app/config.js';
import { BootErrorScene } from './game/boot/BootErrorScene.js';
import { LoadingController } from './game/boot/LoadingController.js';
import { LoadingShell } from './game/boot/view/LoadingShell.js';
import { ChartEditorScene } from './game/editor/ChartEditorScene.js';
import { ChartEditorSelectScene } from './game/editor/ChartEditorSelectScene.js';
import type { ChartCatalog } from './game/editor/ChartEditorController.js';
import { CreditsScene } from './game/credits/CreditsScene.js';
import { GameplayScene } from './game/gameplay/GameplayScene.js';
import type { RankedPlay } from './game/gameplay/GameplayController.js';
import { MainScene } from './game/main/MainScene.js';
import type { ProfilePorts } from './game/profile/ProfileController.js';
import { ProfileScene } from './game/profile/ProfileScene.js';
import type { RankingPorts } from './game/ranking/RankingController.js';
import { RankingScene } from './game/ranking/RankingScene.js';
import { ResultScene } from './game/result/ResultScene.js';
import { SettingsScene } from './game/settings/SettingsScene.js';
import { SharedSongFeeds } from './game/app/SongFeed.js';
import type { SongBatchLoader } from './game/app/SongFeed.js';
import { SongSelectScene } from './game/songSelect/SongSelectScene.js';
import { DEFAULT_CURSOR } from './game/ui/view/input/cursor.js';
import { MenuMusic } from './game/ui/view/MenuMusic.js';
import { NebulaTrail } from './game/ui/view/input/NebulaTrail.js';
import { bindPressedCursor } from './game/ui/view/input/pressedCursor.js';
import { preloadCjkFonts, preloadUiFonts, redrawTextsWhenFontsLoad } from './game/ui/view/fonts.js';
import { isReducedMotionPreferred } from './game/ui/view/theme.js';
import { requireDefined } from './invariant.js';
import { en } from './i18n/messages/en.js';
import { ja } from './i18n/messages/ja.js';
import { ko } from './i18n/messages/ko.js';
import { createI18n } from './i18n/createI18n.js';
import { detectLanguage } from './i18n/language.js';
import type { Chart } from './rhythm/types.js';
import { LocalSave } from './storage/LocalSave.js';

async function loadSongCatalog(): Promise<{
  pb: PocketBase;
  loadPublishedBatch: SongBatchLoader;
  loadAllBatch: SongBatchLoader;
  achievements: AchievementCatalog;
}> {
  const url = import.meta.env.VITE_POCKETBASE_URL;
  if (url === undefined || url === '') {
    throw new Error('VITE_POCKETBASE_URL is not set');
  }
  const pb = new PocketBase(url);
  // 곡명 글자를 배치마다 받아야 늦게 받은 곡명도 굳은 글자 없이 그려진다.
  const createLoader =
    (scope: SongScope): SongBatchLoader =>
    async (query, after) => {
      const batch = await loadSongBatch(pb, scope, query, after);
      await preloadCjkFonts(batch.songs.map((song) => song.title).join(''));
      return batch;
    };
  return {
    pb,
    loadPublishedBatch: createLoader('published'),
    loadAllBatch: createLoader('all'),
    achievements: await loadAchievementCatalog(pb),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const body: unknown = await response.json();
  return body;
}

function startGame(scenes: Phaser.Scene[], onFirstRender?: () => void): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(scenes));
  game.events.once(Phaser.Core.Events.READY, () => {
    bindPressedCursor(game.canvas);
    const firstScene = requireDefined(scenes[0], 'Missing first scene');
    firstScene.load.on(Phaser.Loader.Events.PROGRESS, (loaderFraction: number) =>
      loading.sceneLoadProgress(loaderFraction),
    );
    // 씬의 events 는 게임이 READY 에서 씬을 부팅할 때 생기므로 그 뒤에 구독한다.
    firstScene.sys.events.once(Phaser.Scenes.Events.CREATE, () =>
      game.events.once(Phaser.Core.Events.POST_RENDER, () => {
        loading.firstDraw();
        onFirstRender?.();
      }),
    );
  });
  redrawTextsWhenFontsLoad(game);
  return game;
}

const loadingShellElement = document.getElementById('loading-shell');
if (loadingShellElement === null) {
  throw new Error('Missing #loading-shell element');
}
const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
const loading = new LoadingController({ wait }, new LoadingShell(loadingShellElement));
// 정적 import 는 Vite 가 head 의 link 로 되돌려 첫 표시를 막는다.
await import('./style.css').catch((error: unknown) => {
  console.warn('Failed to load styles', error);
});
const mvLayer = document.getElementById('mv-layer');
if (mvLayer === null) {
  throw new Error('Missing #mv-layer element');
}
const gameElement = document.getElementById('game');
if (gameElement === null) {
  throw new Error('Missing #game element');
}
gameElement.style.cursor = DEFAULT_CURSOR;
if (!isReducedMotionPreferred()) {
  new NebulaTrail(document.body);
}
const save = new LocalSave(window.localStorage);
const initialLanguage = save.loadSettings().language ?? detectLanguage(navigator.languages);
const i18n = createI18n(initialLanguage);
document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});
await preloadUiFonts();
loading.completeStage('uiFonts');
const celestialLoad = loadCelestialCatalog(fetchJson);
await Promise.all([loadSongCatalog(), celestialLoad]).then(
  async ([{ pb, loadPublishedBatch, loadAllBatch, achievements }, celestial]) => {
    loading.completeStage('catalogs');
    await preloadCjkFonts(
      JSON.stringify([
        i18n.t('main', { returnObjects: true }),
        i18n.t('controls', { returnObjects: true }),
        getCurrentUser(pb)?.nickname,
      ]),
    );
    loading.completeStage('mainFonts');
    const feeds = new SharedSongFeeds(loadPublishedBatch);
    const editorFeeds = new SharedSongFeeds(loadAllBatch);
    const { catalog } = feeds;
    const charts = new ChartCache(pb);
    const auth: AccountAuth = {
      getCurrentUser: () => getCurrentUser(pb),
      signIn: () => signInWithGoogle(pb, window),
      cancelSignIn: () => cancelSignInWithGoogle(pb),
      signOut: () => signOut(pb),
      refresh: () => refreshCurrentUser(pb),
    };
    const prepareChart = (ref: ChartRef): Promise<PreparedChart> => preparePlay(pb, charts, ref);
    const loadPlayChart = async (ref: ChartRef, isFresh: boolean): Promise<Chart> =>
      (await (isFresh ? charts.reload(ref) : charts.load(ref))).chart;
    const playRecords = new PlayRecords(pb, achievements);
    const rankedPlay: RankedPlay = {
      submit: (sessionId, submission) => playRecords.submit(sessionId, submission),
    };
    const profilePorts: ProfilePorts = {
      isSignedIn: () => getCurrentUser(pb) !== null,
      loadProfile: () => loadProfile(pb),
      changeNickname: (nickname) => changeNickname(pb, nickname),
      isNicknameAvailable: (nickname) => isNicknameAvailable(pb, nickname),
      wait,
      setFeaturedAchievement: (id) => setFeaturedAchievement(pb, id),
      deleteAccount: () => deleteAccount(pb),
      loadMyRankings: (query) => loadMyRankings(pb, query),
      signOut: () => signOut(pb),
    };
    const rankingPorts: RankingPorts = {
      loadLeaderboard: (chartId) => loadLeaderboard(pb, chartId),
      isSignedIn: () => getCurrentUser(pb) !== null,
      loadRevisionNotices: () => save.loadRevisionNotices(),
      saveRevisionNotice: (chartId, chartRevision) =>
        save.saveRevisionNotice(chartId, chartRevision),
    };
    const editorCharts: ChartCatalog = {
      loadChart: (ref) => loadChart(pb, ref),
      saveChart: async (song, chart, baseRevision) => {
        const result = await saveChart(pb, song, chart, baseRevision);
        if (result.kind === 'conflict') {
          return result;
        }
        const { chartId, loaded } = result;
        charts.put(chartId, loaded);
        feeds.applySavedChart(song.id, chart.laneCount, chart.difficulty, chartId);
        editorFeeds.applySavedChart(song.id, chart.laneCount, chart.difficulty, chartId);
        return {
          kind: 'saved',
          chartId,
          revision: loaded.revision,
        };
      },
    };
    const menuMusic = new MenuMusic(save);
    const account: AccountSource = {
      getIdentity: () => {
        const user = getCurrentUser(pb);
        return user === null ? null : getAccountIdentity(user, achievements);
      },
      catalog: achievements,
    };
    const scenes = [
      new MainScene(save, i18n, auth, celestial, achievements),
      new CreditsScene(save, catalog, i18n, celestial, account),
      new SongSelectScene(
        save,
        mvLayer,
        feeds,
        i18n,
        celestial,
        {
          isSignedIn: () => getCurrentUser(pb) !== null,
          loadMyTopRanks: () => loadMyTopRanks(pb),
          loadMyRecords: () => playRecords.loadMine(),
        },
        account,
      ),
      new SettingsScene(save, i18n, celestial, menuMusic, account),
      new ProfileScene(save, i18n, celestial, profilePorts, account),
      new RankingScene(save, i18n, celestial, achievements, rankingPorts, account),
      new GameplayScene(save, mvLayer, prepareChart, loadPlayChart, i18n, celestial, rankedPlay),
      new ResultScene(save, i18n, celestial, achievements, account),
      new ChartEditorSelectScene(editorFeeds, auth, i18n, celestial),
      new ChartEditorScene(save, mvLayer, editorCharts, auth, i18n, celestial),
    ];
    // HTTP/1.1 에서 메인 preload 와 연결을 다투지 않도록 첫 그림 뒤에 받는다.
    const game = startGame(scenes, () => {
      void catalog.requestRemaining();
      void preloadCjkFonts(
        JSON.stringify([
          ko,
          ja,
          en,
          achievements.definitions.map(({ names }) => names),
          [...achievements.albums.values()].map(({ name }) => name),
        ]),
      );
    });
    menuMusic.follow(game);
  },
  async (error: unknown) => {
    console.error('Failed to start game', error);
    // 실패 화면도 천체 배경을 그리므로, 천체 목록까지 못 받았을 때만 글자로 알린다.
    await celestialLoad.then(
      async (celestial) => {
        await preloadCjkFonts(i18n.t('boot.loadFailed') + i18n.t('boot.checkConnection'));
        startGame([new BootErrorScene(i18n, celestial, { retry: () => window.location.reload() })]);
      },
      () => {
        gameElement.textContent = `${i18n.t('boot.loadFailed')} ${i18n.t('boot.checkConnection')}`;
        gameElement.classList.add('boot-error');
        loading.remove();
      },
    );
  },
);
