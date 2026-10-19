import Phaser from 'phaser';

const CJK_SERIF_FAMILIES = ['Noto Serif JP', 'Noto Serif KR'] as const;
/** style.css 가 가져온 굵기와 같다. */
const FONT_WEIGHTS = [400, 500, 600, 700] as const;

/**
 * Noto Serif KR·JP 는 글자 범위별 조각 파일로 나뉘어 있고, 브라우저는 쓰인 글자의 조각만 받는다.
 * 캔버스 글자는 처음 그릴 때의 글꼴로 굳으므로, 화면 문구·곡명에 쓰이는 글자의 조각을 씬을 만들기 전에 받아 둔다.
 */
export async function preloadCjkSerif(text: string): Promise<void> {
  await Promise.all(
    CJK_SERIF_FAMILIES.flatMap((family) =>
      FONT_WEIGHTS.map((weight) => document.fonts.load(`${weight} 16px "${family}"`, text)),
    ),
  ).catch((error: unknown) => {
    console.warn('Failed to preload CJK serif fonts', error);
  });
}

/** 캔버스 글자는 처음 그릴 때의 글꼴로 굳으므로 씬을 만들기 전에 받아 둔다. */
export async function preloadUiFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load('600 16px "Pretendard Variable"'),
    ...FONT_WEIGHTS.flatMap((weight) => [
      document.fonts.load(`${weight} 16px "Cormorant Garamond"`),
      document.fonts.load(`${weight} 16px "Dazbeat Numerals"`, '0123456789'),
    ]),
  ]).catch((error: unknown) => {
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
