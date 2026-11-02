import Phaser from 'phaser';
import type { CelestialCatalog } from '../../../celestial/state/celestialCatalog.js';
import { addCelestialSprite, playCelestialOnce } from '../../../celestial/view/celestialSprites.js';
import type { CelestialTextureUse } from '../../../celestial/view/celestialSprites.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../app/config.js';
import { COLORS, SCREEN_LAYOUT, textStyle } from '../theme.js';
import { addConstellationFigure } from './constellationFigure.js';

const TITLE_LOGO_Y_PX = 300;
const TITLE_THREAD_ID = 'R26';
const TITLE_THREAD_POSITION_PX = {
  x: 540,
  y: 505,
} as const;
const LOGO_GLINT_ID = 'R25';
const LOGO_GLINT_POSITION_PX = {
  x: 900,
  y: 478,
} as const;
const CHARACTER_TEXTURE_KEY = 'ui:dazbee-constellation';
export const TITLE_CHARACTER_IMAGE = {
  key: CHARACTER_TEXTURE_KEY,
  url: '/assets/ui/main/dazbee-constellation-lineart.png',
} as const;
const CHARACTER_CENTER_PX = {
  x: 1400,
  y: 560,
} as const;
const CHARACTER_SCALE = 0.64;
/**
 * 캐릭터 아랫단이 화면 끝에서 칼로 자른 듯 끊기지 않도록 배경 아래쪽 밤색으로 서서히 덮는다.
 * 색은 R01 배경 아래 띠의 평균색이다.
 */
const GROUND_FADE_COLOR = 0x050c1a;
const GROUND_FADE_TOP_Y_PX = 820;
const GROUND_FADE_MAX_ALPHA = 0.92;

export function getTitleBackdropTextureUses(
  catalog: CelestialCatalog,
): readonly CelestialTextureUse[] {
  return [catalog.atlasPresentations[TITLE_THREAD_ID], catalog.atlasPresentations[LOGO_GLINT_ID]];
}

/**
 * 배경 분위기 바로 위에 그려, 이후에 만드는 메뉴와 문구가 캐릭터 앞에 오게 한다.
 * 로고 반짝임은 씬이 시작한 카메라 페이드인이 끝날 때 한 번 돈다.
 */
export function addTitleBackdrop(
  scene: Phaser.Scene,
  catalog: CelestialCatalog,
): Phaser.GameObjects.Text {
  if (scene.textures.exists(CHARACTER_TEXTURE_KEY)) {
    addConstellationFigure(
      scene,
      CHARACTER_TEXTURE_KEY,
      CHARACTER_CENTER_PX.x,
      CHARACTER_CENTER_PX.y,
      CHARACTER_SCALE,
    );
  }
  scene.add
    .graphics()
    .fillGradientStyle(
      GROUND_FADE_COLOR,
      GROUND_FADE_COLOR,
      GROUND_FADE_COLOR,
      GROUND_FADE_COLOR,
      0,
      0,
      GROUND_FADE_MAX_ALPHA,
      GROUND_FADE_MAX_ALPHA,
    )
    .fillRect(0, GROUND_FADE_TOP_Y_PX, GAME_WIDTH, GAME_HEIGHT - GROUND_FADE_TOP_Y_PX);
  const logo = scene.add.text(
    SCREEN_LAYOUT.leftXPx,
    TITLE_LOGO_Y_PX,
    'DAZBEAT',
    textStyle('display', COLORS.textPrimary),
  );
  addCelestialSprite(
    scene,
    catalog.atlasPresentations[TITLE_THREAD_ID],
    TITLE_THREAD_POSITION_PX.x,
    TITLE_THREAD_POSITION_PX.y,
  );
  const logoGlint = addCelestialSprite(
    scene,
    catalog.atlasPresentations[LOGO_GLINT_ID],
    LOGO_GLINT_POSITION_PX.x,
    LOGO_GLINT_POSITION_PX.y,
  );
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () =>
    playCelestialOnce(logoGlint),
  );
  return logo;
}
