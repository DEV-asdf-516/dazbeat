import Phaser from 'phaser';
import PocketBase from 'pocketbase';
import {
  cancelSignInWithGoogle,
  getCurrentUser,
  refreshCurrentUser,
  signInWithGoogle,
  signOut,
} from './backend/auth.js';
import { ChartCache } from './backend/ChartCache.js';
import { loadChart, saveChart } from './backend/charts.js';
import { preparePlay, submitPlay } from './backend/playSessions.js';
import {
  changeNickname,
  isNicknameAvailable,
  loadProfile,
  setFeaturedAchievement,
} from './backend/profile.js';
import { loadSongBatch } from './backend/songLoader.js';
import type { PreparedChart } from './data/playSession.js';
import { ALL_SONGS_QUERY } from './data/songs.js';
import type { ChartRef, SongBatch } from './data/songs.js';
import type { AccountAuth } from './game/accountState.js';
import { loadCelestialCatalog } from './game/celestial/celestialCatalog.js';
import { createGameConfig } from './game/config.js';
import { ChartEditorScene } from './game/editor/ChartEditorScene.js';
import { ChartEditorSelectScene } from './game/editor/ChartEditorSelectScene.js';
import type { ChartCatalog } from './game/editor/ChartEditorController.js';
import { CreditsScene } from './game/credits/CreditsScene.js';
import { GameplayScene } from './game/gameplay/GameplayScene.js';
import type { RankedPlay } from './game/gameplay/GameplayController.js';
import { MainScene } from './game/main/MainScene.js';
import type { ProfileDeps } from './game/profile/ProfileController.js';
import { ProfileScene } from './game/profile/ProfileScene.js';
import { ResultScene } from './game/result/ResultScene.js';
import { SettingsScene } from './game/settings/SettingsScene.js';
import { SharedSongFeeds } from './game/SongFeed.js';
import type { SongBatchLoader } from './game/SongFeed.js';
import { SongSelectScene } from './game/songSelect/SongSelectScene.js';
import { DEFAULT_CURSOR } from './game/ui/cursor.js';
import { NebulaTrail } from './game/ui/NebulaTrail.js';
import { bindPressedCursor } from './game/ui/pressedCursor.js';
import { preloadCjkFonts, preloadUiFonts, redrawTextsWhenFontsLoad } from './game/ui/fonts.js';
import { en } from './i18n/messages/en.js';
import { ja } from './i18n/messages/ja.js';
import { ko } from './i18n/messages/ko.js';
import { createI18n } from './i18n/createI18n.js';
import { detectLanguage } from './i18n/language.js';
import type { Chart } from './rhythm/types.js';
import { LocalSave } from './storage/LocalSave.js';

async function loadSongCatalog(): Promise<{
  pb: PocketBase;
  loadBatch: SongBatchLoader;
  firstBatch: SongBatch;
}> {
  const url = import.meta.env.VITE_POCKETBASE_URL;
  if (url === undefined || url === '') {
    throw new Error('VITE_POCKETBASE_URL is not set');
  }
  const pb = new PocketBase(url);
  // 곡명 글자를 배치마다 받아야 늦게 받은 곡명도 굳은 글자 없이 그려진다.
  const loadBatch: SongBatchLoader = async (query, after) => {
    const batch = await loadSongBatch(pb, query, after);
    await preloadCjkFonts(batch.songs.map((song) => song.title).join(''));
    return batch;
  };
  return {
    pb,
    loadBatch,
    // 첫 배치 실패는 부트 오류로 보여야 하므로 실패를 삼키는 feed 요청이 아니라 로더를 직접 부른다.
    firstBatch: await loadBatch(ALL_SONGS_QUERY, null),
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

const mvLayer = document.getElementById('mv-layer');
if (mvLayer === null) {
  throw new Error('Missing #mv-layer element');
}
const gameElement = document.getElementById('game');
if (gameElement === null) {
  throw new Error('Missing #game element');
}
gameElement.style.cursor = DEFAULT_CURSOR;
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
await Promise.all([loadSongCatalog(), loadCelestialCatalog(fetchJson)]).then(
  async ([{ pb, loadBatch, firstBatch }, celestial]) => {
    // 언어를 바꿔도 굳은 글자가 남지 않도록 모든 언어의 화면 문구를 함께 받는다.
    await preloadCjkFonts(JSON.stringify([ko, ja, en]));
    const feeds = new SharedSongFeeds(loadBatch, firstBatch);
    const { catalog } = feeds;
    // 첫 화면은 첫 배치로 띄우고, 곡 선택의 랜덤과 목록 끝 이동이 기다리지 않도록 나머지 곡은 뒤에서 받는다.
    void catalog.requestRemaining();
    const charts = new ChartCache(pb);
    const auth: AccountAuth = {
      getCurrentUser: () => getCurrentUser(pb),
      signIn: () => signInWithGoogle(pb, window),
      cancelSignIn: () => cancelSignInWithGoogle(pb),
      signOut: () => signOut(pb),
      refresh: () => refreshCurrentUser(pb),
    };
    const prepareChart = (ref: ChartRef): Promise<PreparedChart> => preparePlay(pb, charts, ref);
    const loadPracticeChart = async (ref: ChartRef): Promise<Chart> =>
      (await charts.load(ref)).chart;
    const rankedPlay: RankedPlay = {
      submit: (sessionId, submission) => submitPlay(pb, sessionId, submission),
    };
    const profileDeps: ProfileDeps = {
      isSignedIn: () => getCurrentUser(pb) !== null,
      loadProfile: () => loadProfile(pb),
      changeNickname: (nickname) => changeNickname(pb, nickname),
      isNicknameAvailable: (nickname) => isNicknameAvailable(pb, nickname),
      wait: (delayMs) =>
        new Promise((resolve) => {
          setTimeout(resolve, delayMs);
        }),
      setFeaturedAchievement: (id) => setFeaturedAchievement(pb, id),
    };
    const editorCharts: ChartCatalog = {
      loadChart: async (ref) => (await loadChart(pb, ref)).chart,
      saveChart: async (song, chart) => {
        const { chartId, loaded } = await saveChart(pb, song, chart);
        // 서버 저장은 이미 끝났으므로 아래 곡 목록 갱신과 무관하게 캐시는 서버 상태를 따른다.
        charts.put(chartId, loaded);
        // 받아 둔 목록에 아직 없는 곡의 저장은 정상이므로 반영할 곡이 없어도 넘어간다.
        feeds.applySavedChart(song.id, chart.laneCount, chart.difficulty, chartId);
        return chartId;
      },
    };
    const game = new Phaser.Game(
      createGameConfig([
        new MainScene(save, i18n, auth, celestial),
        new CreditsScene(save, catalog, i18n, celestial),
        new SongSelectScene(save, mvLayer, feeds, i18n, celestial),
        new SettingsScene(save, i18n, initialLanguage, celestial),
        new ProfileScene(save, i18n, celestial, profileDeps),
        new GameplayScene(
          save,
          mvLayer,
          prepareChart,
          loadPracticeChart,
          i18n,
          celestial,
          rankedPlay,
        ),
        new ResultScene(save, i18n, celestial),
        new ChartEditorSelectScene(feeds, auth, i18n, celestial),
        new ChartEditorScene(save, mvLayer, editorCharts, auth, i18n, celestial),
      ]),
    );
    game.events.once(Phaser.Core.Events.READY, () => bindPressedCursor(game.canvas));
    redrawTextsWhenFontsLoad(game);
  },
  (error: unknown) => {
    console.error('Failed to start game', error);
    gameElement.textContent = i18n.t('boot.loadFailed');
    gameElement.classList.add('boot-error');
  },
);
