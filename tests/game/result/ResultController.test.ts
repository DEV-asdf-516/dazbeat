import { describe, expect, it } from 'vitest';
import type { AchievementId } from '../../../src/data/achievements.js';
import { ResultController } from '../../../src/game/result/ResultController.js';

interface Harness {
  readonly controller: ResultController;
  readonly shown: (readonly AchievementId[])[];
  resolve(ids: readonly AchievementId[]): void;
}

function createHarness(): Harness {
  const shown: (readonly AchievementId[])[] = [];
  let resolve: (ids: readonly AchievementId[]) => void = () => {};
  const newAchievements = new Promise<readonly AchievementId[]>((resolveIds) => {
    resolve = resolveIds;
  });
  const controller = new ResultController(
    { showAchievements: (ids) => shown.push(ids) },
    newAchievements,
  );
  return {
    controller,
    shown,
    resolve: (ids) => resolve(ids),
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ResultController', () => {
  it('shows the new achievements once when the submission response arrives', async () => {
    const harness = createHarness();
    await flush();
    expect(harness.shown).toEqual([]);

    harness.resolve(['FIRST_FINISH', 'FIRST_CLEAR']);
    await flush();

    expect(harness.shown).toEqual([['FIRST_FINISH', 'FIRST_CLEAR']]);
  });

  it('shows nothing for an empty list', async () => {
    const harness = createHarness();

    harness.resolve([]);
    await flush();

    expect(harness.shown).toEqual([]);
  });

  it('ignores achievements that arrive after close', async () => {
    const harness = createHarness();
    harness.controller.close();

    harness.resolve(['FIRST_FINISH']);
    await flush();

    expect(harness.shown).toEqual([]);
  });
});
