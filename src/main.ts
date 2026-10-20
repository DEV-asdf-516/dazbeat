import Phaser from 'phaser';
import PocketBase from 'pocketbase';
import {
  cancelSignInWithGoogle,
  getCurrentUser,
  signInWithGoogle,
  signOut,
} from './backend/auth.js';
import { ChartCache } from './backend/ChartCache.js';
import { loadChart, saveChart } from './backend/charts.js';
import { preparePlay, submitPlay } from './backend/playSessions.js';
import { loadSongs } from './backend/songLoader.js';
import type { PreparedChart } from './data/playSession.js';
import { withSavedChart } from './data/songs.js';
import type { ChartRef, Song } from './data/songs.js';
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
import { ResultScene } from './game/result/ResultScene.js';
import { SettingsScene } from './game/settings/SettingsScene.js';
import { SongSelectScene } from './game/songSelect/SongSelectScene.js';
import { DEFAULT_CURSOR } from './game/ui/cursor.js';
import { NebulaTrail } from './game/ui/NebulaTrail.js';
import { bindPressedCursor } from './game/ui/pressedCursor.js';
import { preloadCjkSerif, preloadUiFonts, redrawTextsWhenFontsLoad } from './game/ui/fonts.js';
import { en } from './i18n/messages/en.js';
import { ja } from './i18n/messages/ja.js';
import { ko } from './i18n/messages/ko.js';
import { createI18n } from './i18n/createI18n.js';
import { detectLanguage } from './i18n/language.js';
import type { Chart } from './rhythm/types.js';
import { LocalSave } from './storage/LocalSave.js';

async function loadSongCatalog(): Promise<{ pb: PocketBase; songs: Song[] }> {
  const url = import.meta.env.VITE_POCKETBASE_URL;
  if (url === undefined || url === '') {
    throw new Error('VITE_POCKETBASE_URL is not set');
  }
  const pb = new PocketBase(url);
  return {
    pb,
    songs: await loadSongs(pb),
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
  async ([{ pb, songs: initialSongs }, celestial]) => {
    // 언어를 바꿔도 굳은 글자가 남지 않도록 모든 언어의 화면 문구와 곡명 글자를 함께 받는다.
    await preloadCjkSerif(
      [JSON.stringify([ko, ja, en]), ...initialSongs.map((song) => song.title)].join(''),
    );
    let songs: readonly Song[] = initialSongs;
    const getSongs = (): readonly Song[] => songs;
    const charts = new ChartCache(pb);
    const auth: AccountAuth = {
      getCurrentUser: () => getCurrentUser(pb),
      signIn: () => signInWithGoogle(pb, window),
      cancelSignIn: () => cancelSignInWithGoogle(pb),
      signOut: () => signOut(pb),
    };
    const prepareChart = (ref: ChartRef): Promise<PreparedChart> => preparePlay(pb, charts, ref);
    const loadPracticeChart = async (ref: ChartRef): Promise<Chart> =>
      (await charts.load(ref)).chart;
    const rankedPlay: RankedPlay = {
      submit: (sessionId, submission) => submitPlay(pb, sessionId, submission),
    };
    const catalog: ChartCatalog = {
      getSongs,
      loadChart: async (ref) => (await loadChart(pb, ref)).chart,
      saveChart: async (song, chart) => {
        const { chartId, loaded } = await saveChart(pb, song, chart);
        // 서버 저장은 이미 끝났으므로 아래 곡 목록 갱신이 실패해도 캐시는 서버 상태를 따른다.
        charts.put(chartId, loaded);
        // 저장이 겹칠 수 있으므로 요청 때의 스냅샷이 아니라 지금의 목록 곡에 chart id 를 더한다.
        const updated = withSavedChart(songs, song.id, chart.difficulty, chartId);
        songs = updated.songs;
        return updated.saved;
      },
    };
    const game = new Phaser.Game(
      createGameConfig([
        new MainScene(i18n, auth, celestial),
        new CreditsScene(initialSongs, i18n, celestial),
        new SongSelectScene(save, getSongs, i18n, celestial),
        new SettingsScene(save, i18n, initialLanguage, celestial),
        new GameplayScene(
          save,
          mvLayer,
          prepareChart,
          loadPracticeChart,
          i18n,
          celestial,
          rankedPlay,
        ),
        new ResultScene(initialSongs, i18n, celestial),
        new ChartEditorSelectScene(getSongs, auth, i18n),
        new ChartEditorScene(save, mvLayer, catalog, auth, i18n, celestial),
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
