import { afterEach, describe, expect, it, vi } from 'vitest';
import { YouTubePlayer } from '../../src/audio/YouTubePlayer.js';
import type { YouTubePlayerHandlers } from '../../src/audio/YouTubePlayer.js';

type PlayerOptions = ConstructorParameters<NonNullable<NonNullable<Window['YT']>['Player']>>[1];

function createPlayer(handlers: YouTubePlayerHandlers): PlayerOptions {
  const captured: PlayerOptions[] = [];
  vi.stubGlobal('window', {
    YT: {
      Player: function (_element: unknown, options: PlayerOptions) {
        captured.push(options);
      },
    },
  });
  vi.stubGlobal('document', {
    createElement: () => ({
      remove: vi.fn(),
    }),
  });
  const container = {
    append: vi.fn(),
  };
  // 실제 DOM 이 없는 node 환경이라 생성자가 쓰는 append 만 가진 대역으로 대신한다.
  new YouTubePlayer(container as unknown as HTMLElement, 'aaaaaaaaaaa', handlers);
  const options = captured[0];
  if (options === undefined) {
    throw new Error('YT.Player was not constructed');
  }
  return options;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YouTubePlayer', () => {
  it.each([
    [2, 'invalidParameter'],
    [5, 'html5PlayerError'],
    [100, 'videoNotFound'],
    [101, 'embeddingNotAllowed'],
    [150, 'embeddingNotAllowed'],
    [9999, 'unknown'],
  ])('reports error code %i as %s', (code, kind) => {
    const onError = vi.fn();
    const options = createPlayer({
      onReady: vi.fn(),
      onStateChange: vi.fn(),
      onError,
    });

    options.events.onError({ data: code });

    expect(onError).toHaveBeenCalledWith(kind, code);
  });
});
