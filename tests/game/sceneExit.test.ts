import { describe, expect, it } from 'vitest';
import { STAYING, requestSceneExit } from '../../src/game/sceneExit.js';
import type { SceneExit } from '../../src/game/sceneExit.js';

describe('STAYING', () => {
  it('is the staying state', () => {
    expect(STAYING.kind).toBe('staying');
  });
});

describe('requestSceneExit', () => {
  it('moves staying to leaving with the requested target', () => {
    expect(requestSceneExit<string>(STAYING, 'main')).toEqual({ kind: 'leaving', target: 'main' });
  });

  it('returns the same leaving state for a second request', () => {
    const leaving: SceneExit<string> = requestSceneExit<string>(STAYING, 'main');
    const next = requestSceneExit(leaving, 'songSelect');
    expect(next).toBe(leaving);
    expect(next).toEqual({ kind: 'leaving', target: 'main' });
  });
});
