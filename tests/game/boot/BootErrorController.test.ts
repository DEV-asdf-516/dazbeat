import { describe, expect, it } from 'vitest';
import { BootErrorController } from '../../../src/game/boot/BootErrorController.js';
import { getChangedRegions } from '../../../src/game/boot/state/bootErrorState.js';
import type { BootErrorRegion } from '../../../src/game/boot/state/bootErrorState.js';

function createHarness(): {
  controller: BootErrorController;
  retryCount: () => number;
  regions: BootErrorRegion[][];
} {
  let retryCount = 0;
  const regions: BootErrorRegion[][] = [];
  const controller = new BootErrorController(
    {
      retry: () => {
        retryCount += 1;
      },
    },
    { render: (previous, next) => regions.push([...getChangedRegions(previous, next)]) },
  );
  return {
    controller,
    retryCount: () => retryCount,
    regions,
  };
}

describe('BootErrorController', () => {
  it('draws the retry button first', () => {
    const { regions } = createHarness();
    expect(regions).toEqual([['retryButton']]);
  });

  it('retries when the retry button is released after being pressed', () => {
    const { controller, retryCount, regions } = createHarness();
    controller.pointerOver('retry');
    controller.pointerDown('retry');
    controller.pointerUp('retry');
    expect(retryCount()).toBe(1);
    expect(regions).toHaveLength(4);
  });

  it('does not retry on a release that was not pressed on the button', () => {
    const { controller, retryCount } = createHarness();
    controller.pointerOver('retry');
    controller.pointerUp('retry');
    expect(retryCount()).toBe(0);
  });

  it('retries from the keyboard', () => {
    const { controller, retryCount } = createHarness();
    controller.retry();
    expect(retryCount()).toBe(1);
  });

  it('ignores input after closing', () => {
    const { controller, retryCount, regions } = createHarness();
    controller.close();
    controller.pointerOver('retry');
    controller.pointerDown('retry');
    controller.pointerUp('retry');
    controller.retry();
    expect(retryCount()).toBe(0);
    expect(regions).toHaveLength(1);
  });
});
