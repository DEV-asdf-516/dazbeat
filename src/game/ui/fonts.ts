import Phaser from 'phaser';

/** 한글·일본어 명조. style.css 가 가져온 굵기와 같다. */
const CJK_SERIF_FAMILIES = ['Noto Serif JP', 'Noto Serif KR'] as const;
const CJK_SERIF_WEIGHTS = [400, 500, 600, 700] as const;

/**
 * Noto Serif KR·JP 는 글자 범위별 조각 파일로 나뉘어 있고, 브라우저는 쓰인 글자의 조각만 받는다.
 * 캔버스 글자는 처음 그릴 때의 글꼴로 굳으므로, 화면 문구·곡명에 쓰이는 글자의 조각을 씬을 만들기 전에 받아 둔다.
 * 실패해도 기본 서체로 그릴 수 있으므로 경고만 남긴다.
 */
export async function preloadCjkSerif(text: string): Promise<void> {
  try {
    await Promise.all(
      CJK_SERIF_FAMILIES.flatMap((family) =>
        CJK_SERIF_WEIGHTS.map((weight) => document.fonts.load(`${weight} 16px "${family}"`, text)),
      ),
    );
  } catch (error) {
    console.warn('Failed to preload CJK serif fonts', error);
  }
}

/**
 * 미리 받지 못한 글자(언어 변경, 새로 저장된 곡명 등)의 조각이 나중에 도착하면 그 전까지 기본 서체로 굳어 있던
 * 글자를 새 서체로 다시 그린다. 조각이 도착할 때만 돌므로 평소 프레임에는 비용이 없다.
 */
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
