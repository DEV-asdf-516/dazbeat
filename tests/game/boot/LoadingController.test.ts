import { describe, expect, it } from 'vitest';
import { LoadingController } from '../../../src/game/boot/LoadingController.js';
import type { LoadingState } from '../../../src/game/boot/state/loadingProgress.js';

function createHarness() {
  const renders: { previous: LoadingState | null; next: LoadingState }[] = [];
  const waits: { delayMs: number; finish: () => void }[] = [];
  const controller = new LoadingController(
    {
      wait: (delayMs) =>
        new Promise((resolve) => {
          waits.push({
            delayMs,
            finish: resolve,
          });
        }),
    },
    {
      render: (previous, next) =>
        renders.push({
          previous,
          next,
        }),
    },
  );
  return {
    controller,
    renders,
    waits,
    lastState: (): LoadingState | undefined => renders.at(-1)?.next,
  };
}

async function finishWait(waits: readonly { finish: () => void }[]): Promise<void> {
  waits.forEach(({ finish }) => {
    finish();
  });
  await Promise.resolve();
  await Promise.resolve();
}

describe('LoadingController', () => {
  it('draws the crawl end value first', () => {
    const { renders } = createHarness();

    expect(renders).toEqual([
      {
        previous: null,
        next: {
          kind: 'loading',
          fraction: 0.12,
        },
      },
    ]);
  });

  it('follows the boot stages and the loader up to 1', () => {
    const { controller, renders, lastState } = createHarness();

    controller.completeStage('uiFonts');
    expect(lastState()).toEqual({
      kind: 'loading',
      fraction: 0.34,
    });
    controller.completeStage('catalogs');
    expect(lastState()).toEqual({
      kind: 'loading',
      fraction: 0.44,
    });
    controller.completeStage('mainFonts');
    expect(lastState()).toEqual({
      kind: 'loading',
      fraction: 0.52,
    });
    controller.sceneLoadProgress(0.5);
    expect(lastState()).toEqual({
      kind: 'loading',
      fraction: 0.76,
    });
    controller.sceneLoadProgress(1);
    expect(lastState()).toEqual({
      kind: 'loading',
      fraction: 1,
    });
    expect(renders[1]?.previous).toEqual({
      kind: 'loading',
      fraction: 0.12,
    });
  });

  it('does not render a late stage or a smaller loader value', () => {
    const { controller, renders } = createHarness();
    controller.completeStage('mainFonts');
    controller.sceneLoadProgress(0.5);
    const renderCount = renders.length;

    controller.completeStage('catalogs');
    controller.sceneLoadProgress(0.25);
    controller.sceneLoadProgress(0.5);

    expect(renders).toHaveLength(renderCount);
  });

  it('leaves on the first draw and is removed after the fade', async () => {
    const { controller, waits, lastState } = createHarness();

    controller.firstDraw();

    expect(lastState()).toEqual({ kind: 'leaving' });
    expect(waits.map(({ delayMs }) => delayMs)).toEqual([420]);

    await finishWait(waits);

    expect(lastState()).toEqual({ kind: 'removed' });
  });

  it('does not render progress while leaving or after being removed', async () => {
    const { controller, renders, waits } = createHarness();
    controller.firstDraw();
    const leavingRenderCount = renders.length;

    controller.completeStage('mainFonts');
    controller.sceneLoadProgress(1);
    expect(renders).toHaveLength(leavingRenderCount);

    await finishWait(waits);
    const removedRenderCount = renders.length;

    controller.completeStage('mainFonts');
    controller.sceneLoadProgress(1);
    expect(renders).toHaveLength(removedRenderCount);
  });

  it('removes right away from loading', () => {
    const { controller, lastState } = createHarness();

    controller.remove();

    expect(lastState()).toEqual({ kind: 'removed' });
  });

  it('removes right away while leaving and ignores the late wait', async () => {
    const { controller, renders, waits, lastState } = createHarness();
    controller.firstDraw();

    controller.remove();

    expect(lastState()).toEqual({ kind: 'removed' });
    const renderCount = renders.length;

    await finishWait(waits);

    expect(renders).toHaveLength(renderCount);
  });
});
