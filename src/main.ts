import Phaser from 'phaser';
import PocketBase from 'pocketbase';
import {
  cancelSignInWithGoogle,
  getCurrentUser,
  signInWithGoogle,
  signOut,
} from './backend/auth.js';
import { loadChart, saveChart } from './backend/chartLoader.js';
import { loadSongs } from './backend/songLoader.js';
import { withChartId } from './data/songs.js';
import type { Song } from './data/songs.js';
import type { AccountAuth } from './game/accountState.js';
import { loadCelestialCatalog } from './game/celestial/celestialCatalog.js';
import { createGameConfig } from './game/config.js';
import { ChartEditorScene } from './game/editor/ChartEditorScene.js';
import { ChartEditorSelectScene } from './game/editor/ChartEditorSelectScene.js';
import type { ChartCatalog } from './game/editor/ChartEditorScene.js';
import { CreditsScene } from './game/credits/CreditsScene.js';
import { GameplayScene } from './game/gameplay/GameplayScene.js';
import { MainScene } from './game/main/MainScene.js';
import { ResultScene } from './game/result/ResultScene.js';
import { SettingsScene } from './game/settings/SettingsScene.js';
import { SongSelectScene } from './game/songSelect/SongSelectScene.js';
import { DEFAULT_CURSOR } from './game/ui/cursor.js';
import { NebulaTrail } from './game/ui/NebulaTrail.js';
import { bindPressedCursor } from './game/ui/pressedCursor.js';
import { preloadCjkSerif, redrawTextsWhenFontsLoad } from './game/ui/fonts.js';
import { en } from './i18n/messages/en.js';
import { ja } from './i18n/messages/ja.js';
import { ko } from './i18n/messages/ko.js';
import { createI18n } from './i18n/createI18n.js';
import { detectLanguage } from './i18n/language.js';
import type { Chart, Difficulty } from './rhythm/types.js';
import { LocalSave } from './storage/LocalSave.js';

async function loadSongCatalog(): Promise<{ pb: PocketBase; songs: Song[] }> {
  const url = import.meta.env.VITE_POCKETBASE_URL;
  if (url === undefined || url === '') {
    throw new Error('VITE_POCKETBASE_URL is not set');
  }
  const pb = new PocketBase(url);
  return { pb, songs: await loadSongs(pb) };
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
const i18n = createI18n(save.loadSettings().language ?? detectLanguage(navigator.languages));
document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});
// 캔버스 글자는 처음 그릴 때의 글꼴로 굳으므로 씬을 만들기 전에 받아 둔다.
try {
  await Promise.all([
    document.fonts.load('600 16px "Pretendard Variable"'),
    ...[400, 500, 600, 700].flatMap((weight) => [
      document.fonts.load(`${weight} 16px "Cormorant Garamond"`),
      document.fonts.load(`${weight} 16px "Dazbeat Numerals"`, '0123456789'),
    ]),
  ]);
} catch (error) {
  console.warn('Failed to load fonts', error);
}
await Promise.all([loadSongCatalog(), loadCelestialCatalog(fetchJson)]).then(
  async ([{ pb, songs: initialSongs }, celestial]) => {
    // 언어를 바꿔도 굳은 글자가 남지 않도록 모든 언어의 화면 문구와 곡명 글자를 함께 받는다.
    await preloadCjkSerif(
      [JSON.stringify([ko, ja, en]), ...initialSongs.map((song) => song.title)].join(''),
    );
    // 곡 목록의 유일한 현재 값. chart 를 새로 만든 저장만 이 값을 새 배열로 바꾼다.
    let songs: readonly Song[] = initialSongs;
    const getSongs = (): readonly Song[] => songs;
    const auth: AccountAuth = {
      getCurrentUser: () => getCurrentUser(pb),
      signIn: () => signInWithGoogle(pb, window),
      cancelSignIn: () => cancelSignInWithGoogle(pb),
      signOut: () => signOut(pb),
    };
    const loadSongChart = (song: Song, difficulty: Difficulty): Promise<Chart> =>
      loadChart(pb, song, difficulty);
    const catalog: ChartCatalog = {
      getSongs,
      loadChart: loadSongChart,
      saveChart: async (song, chart) => {
        const chartId = await saveChart(pb, song, chart);
        // 저장이 겹칠 수 있으므로 요청 때의 스냅샷이 아니라 지금의 목록 곡에 chart id 를 더한다.
        const current = songs.find((listed) => listed.id === song.id);
        if (current === undefined) {
          throw new Error(`Saved chart for song ${song.id} that is not in the current song list`);
        }
        const saved = withChartId(current, chart.difficulty, chartId);
        if (saved !== current) {
          songs = songs.map((listed) => (listed.id === saved.id ? saved : listed));
        }
        return saved;
      },
    };
    const game = new Phaser.Game(
      createGameConfig([
        new MainScene(i18n, auth, celestial),
        new CreditsScene(initialSongs, i18n, celestial),
        new SongSelectScene(save, getSongs, i18n, celestial),
        new SettingsScene(save, i18n, celestial),
        new GameplayScene(save, mvLayer, loadSongChart, i18n, celestial),
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
