import Phaser from 'phaser';
import type { LocalSave } from '../../../storage/LocalSave.js';
import { getAudibleVolume } from '../../../storage/settings.js';
import type { Settings } from '../../../storage/settings.js';
import { msToSec } from '../../../time.js';
import { MENU_MUSIC_SCENE_KEYS } from '../../app/sceneRoutes.js';
import { warnOnLoadError } from './textures/loadWarning.js';

const MENU_MUSIC_KEY = 'bgm-main-menu';
const MENU_MUSIC_URLS = ['/assets/audio/bgm/main-menu.ogg', '/assets/audio/bgm/main-menu.mp3'];
const MENU_MUSIC_LOOP_MARKER = 'loop';
// 음원의 32마디 길이다. Chrome 은 Vorbis 끝의 인코더 패딩을 남긴 채 디코딩하므로,
// 버퍼 길이대로 반복하면 이음새마다 그 패딩이 끼어든다.
const MENU_MUSIC_LOOP_MS = 80_846;
// 음원을 배경용으로 작게 마스터링해 두어 다른 화면 음악과 비슷하게 들리도록 키운다.
const MENU_MUSIC_GAIN = 1.2;

type Music = ReturnType<Phaser.Scene['sound']['add']>;

export class MenuMusic {
  // 메뉴 화면 사이를 오갈 때 처음부터 다시 틀지 않도록 씬이 아니라 이 객체가 소리를 소유한다.
  private music: Music | null = null;

  constructor(private readonly save: Pick<LocalSave, 'loadSettings'>) {}

  // 씬의 events 는 게임이 READY 에서 씬을 부팅할 때 생기므로 그 뒤에 구독한다.
  follow(game: Phaser.Game): void {
    game.events.once(Phaser.Core.Events.READY, () => {
      for (const scene of game.scene.getScenes(false)) {
        const { events, settings } = scene.sys;
        if (MENU_MUSIC_SCENE_KEYS.has(settings.key)) {
          events.on(Phaser.Scenes.Events.CREATE, () => this.play(scene));
        } else {
          // 다음 화면이 자원을 불러오는 동안 메뉴 음악이 남지 않도록 preload 전에 멈춘다.
          events.on(Phaser.Scenes.Events.START, () => this.stop());
        }
      }
    });
  }

  setVolume(settings: Pick<Settings, 'backgroundVolume' | 'mutedVolumes'>): void {
    this.music?.setVolume(getMenuMusicVolume(settings));
  }

  // 잠긴 오디오 컨텍스트에서 시작한 소리는 첫 사용자 입력으로 풀릴 때 들리기 시작하고,
  // 그 전에 메뉴 밖으로 나가면 stop 으로 사라져 뒤늦게 울리지 않는다.
  private play(scene: Phaser.Scene): void {
    if (this.music !== null) {
      return;
    }
    if (!scene.cache.audio.exists(MENU_MUSIC_KEY)) {
      scene.load.audio(MENU_MUSIC_KEY, MENU_MUSIC_URLS);
      warnOnLoadError(scene, [MENU_MUSIC_KEY], 'menu music');
      // 씬이 끝나면 로더 리스너가 함께 사라지므로 메뉴 음악이 없는 화면에서는 재생되지 않는다.
      scene.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}audio-${MENU_MUSIC_KEY}`, () =>
        this.play(scene),
      );
      scene.load.start();
      return;
    }
    const music = scene.sound.add(MENU_MUSIC_KEY);
    music.addMarker({
      name: MENU_MUSIC_LOOP_MARKER,
      start: 0,
      duration: msToSec(MENU_MUSIC_LOOP_MS),
      config: {
        loop: true,
        volume: getMenuMusicVolume(this.save.loadSettings()),
      },
    });
    music.play(MENU_MUSIC_LOOP_MARKER);
    this.music = music;
  }

  private stop(): void {
    this.music?.destroy();
    this.music = null;
  }
}

function getMenuMusicVolume(settings: Pick<Settings, 'backgroundVolume' | 'mutedVolumes'>): number {
  return getAudibleVolume(settings, 'backgroundVolume') * MENU_MUSIC_GAIN;
}
