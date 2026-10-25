import Phaser from 'phaser';

/** style.css 가 가져온 굵기와 같다. */
const NOTO_SANS_JP_WEIGHTS = [400, 500, 600, 700, 800] as const;

/**
 * Noto Sans JP 는 글자 범위별 조각 파일로 나뉘어 있고, 브라우저는 쓰인 글자의 조각만 받는다.
 * 캔버스 글자는 처음 그릴 때의 글꼴로 굳으므로, 화면 문구·곡명에 쓰이는 글자의 조각을 씬을 만들기 전에 받아 둔다.
 */
export async function preloadCjkFonts(text: string): Promise<void> {
  await Promise.all(
    NOTO_SANS_JP_WEIGHTS.map((weight) =>
      document.fonts.load(`${weight} 16px "Noto Sans JP"`, text),
    ),
  ).catch((error: unknown) => {
    console.warn('Failed to preload CJK fonts', error);
  });
}

/** 캔버스 글자는 처음 그릴 때의 글꼴로 굳으므로 씬을 만들기 전에 받아 둔다. */
export async function preloadUiFonts(): Promise<void> {
  await document.fonts.load('600 16px "Pretendard Variable"').catch((error: unknown) => {
    console.warn('Failed to load fonts', error);
  });
}

export function redrawTextsWhenFontsLoad(game: Phaser.Game): void {
  document.fonts.addEventListener('loadingdone', () => {
    game.scene.getScenes(true).forEach((scene) => redrawTexts(scene.children.list));
  });
}

function redrawTexts(objects: readonly Phaser.GameObjects.GameObject[]): void {
  objects.forEach((object) => {
    if (object instanceof Phaser.GameObjects.Text) {
      object.updateText();
    } else if (object instanceof Phaser.GameObjects.Container) {
      redrawTexts(object.list);
    }
  });
}
