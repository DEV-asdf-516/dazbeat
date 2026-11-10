import { MOTION } from '../../ui/state/motion.js';
import type { LoadingScreen } from '../LoadingController.js';
import type { LoadingState } from '../state/loadingProgress.js';

const THREAD_LENGTH_PX = 729;

function findPart(shell: HTMLElement, selector: string): HTMLElement | SVGElement {
  const part = shell.querySelector<HTMLElement | SVGElement>(selector);
  if (part === null) {
    throw new Error(`Missing ${selector} element`);
  }
  return part;
}

export class LoadingShell implements LoadingScreen {
  private readonly stage: HTMLElement | SVGElement;
  private readonly fill: HTMLElement | SVGElement;
  private readonly front: HTMLElement | SVGElement;
  private readonly fadingParts: readonly (HTMLElement | SVGElement)[];

  constructor(private readonly shell: HTMLElement) {
    this.stage = findPart(shell, '#loading-stage');
    this.fill = findPart(shell, '#loading-fill');
    this.front = findPart(shell, '#loading-front');
    this.fadingParts = [findPart(shell, '#loading-backdrop'), findPart(shell, '#loading-progress')];
  }

  render(previous: LoadingState | null, next: LoadingState): void {
    switch (next.kind) {
      case 'loading':
        if (previous === null) {
          this.freezeCrawl();
        }
        this.fill.style.transform = `scaleX(${next.fraction})`;
        this.front.style.transform = `translateX(${next.fraction * THREAD_LENGTH_PX}px)`;
        this.stage.setAttribute('aria-valuenow', String(Math.round(next.fraction * 100)));
        return;
      case 'leaving':
        this.fadingParts.forEach((part) => {
          part.style.transition = `opacity ${MOTION.mediumMs}ms`;
          part.style.opacity = '0';
        });
        return;
      case 'removed':
        this.shell.remove();
        return;
    }
  }

  private freezeCrawl(): void {
    [this.fill, this.front].forEach((part) => {
      part.style.transform = getComputedStyle(part).transform;
      part.style.animation = 'none';
      // 굳힌 값을 스타일에 반영해 두어야 다음 진행 값의 전환이 CSS 애니메이션이 간 자리에서 시작한다.
      void getComputedStyle(part).transform;
    });
  }
}
