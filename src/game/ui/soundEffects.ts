import Phaser from 'phaser';
import { requireDefined } from '../../invariant.js';
import type { Settings } from '../../storage/settings.js';
import { warnOnLoadError } from './loadWarning.js';

export type SoundEffect = 'lanePress' | 'judgeGood' | 'judgeBad' | 'judgeMiss' | 'menuFocus';

type SoundEffectGroup = 'lane' | 'judgment' | 'menu';

const SOUND_EFFECTS: Record<SoundEffect, { key: string; url: string; group: SoundEffectGroup }> = {
  lanePress: {
    key: 'sfx-lane-press',
    url: '/assets/audio/sfx/lane-press.wav',
    group: 'lane',
  },
  judgeGood: {
    key: 'sfx-judge-good',
    url: '/assets/audio/sfx/judge-good.wav',
    group: 'judgment',
  },
  judgeBad: {
    key: 'sfx-judge-bad',
    url: '/assets/audio/sfx/judge-bad.wav',
    group: 'judgment',
  },
  judgeMiss: {
    key: 'sfx-judge-miss',
    url: '/assets/audio/sfx/judge-miss.wav',
    group: 'judgment',
  },
  menuFocus: {
    key: 'sfx-menu-focus',
    url: '/assets/audio/sfx/menu-focus.wav',
    group: 'menu',
  },
};

const GROUP_KEYS = new Map<SoundEffectGroup, Set<string>>();
Object.values(SOUND_EFFECTS).forEach(({ key, group }) => {
  GROUP_KEYS.set(group, (GROUP_KEYS.get(group) ?? new Set()).add(key));
});

const MAX_PLAYING_PER_GROUP = 4;
// 음원 자체가 커서 효과음 볼륨 100% 에서도 음악을 덮으므로 전체를 이만큼 낮춰 재생한다.
const SOUND_EFFECT_GAIN = 0.5;

export function queueSoundEffects(scene: Phaser.Scene): void {
  const missing = Object.values(SOUND_EFFECTS).filter(({ key }) => !scene.cache.audio.exists(key));
  if (missing.length === 0) {
    return;
  }
  missing.forEach(({ key, url }) => scene.load.audio(key, url));
  warnOnLoadError(
    scene,
    missing.map(({ key }) => key),
    'sound effect',
  );
}

export class SoundEffects {
  private readonly manager: Phaser.Sound.WebAudioSoundManager | null;
  private readonly loadedKeys: ReadonlySet<string>;
  private readonly volume: number;

  constructor(scene: Phaser.Scene, settings: Pick<Settings, 'masterVolume' | 'effectVolume'>) {
    const { sound } = scene;
    this.manager = sound instanceof Phaser.Sound.WebAudioSoundManager ? sound : null;
    this.loadedKeys = new Set(
      Object.values(SOUND_EFFECTS)
        .map(({ key }) => key)
        .filter((key) => scene.cache.audio.exists(key)),
    );
    this.volume = settings.masterVolume * settings.effectVolume * SOUND_EFFECT_GAIN;
  }

  play(effect: SoundEffect): void {
    const { manager } = this;
    const { key, group } = SOUND_EFFECTS[effect];
    // locked 만 보면 창 비활성으로 suspend 된 동안 요청이 쌓였다가 복귀 때 몰아서 난다.
    if (manager === null || !this.loadedKeys.has(key) || manager.context.state !== 'running') {
      return;
    }
    const groupKeys = requireDefined(GROUP_KEYS.get(group), 'Unknown sound effect group', group);
    const playing = manager
      .getAllPlaying()
      .filter((playingSound) => groupKeys.has(playingSound.key));
    // stop() 만 하면 완료 이벤트가 없어 매니저에서 제거되지 않는다.
    if (playing.length >= MAX_PLAYING_PER_GROUP) {
      requireDefined(playing[0], 'Missing oldest sound effect', group).destroy();
    }
    manager.play(key, { volume: this.volume });
  }
}
