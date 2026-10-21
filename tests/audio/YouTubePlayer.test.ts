import { afterEach, describe, expect, it, vi } from 'vitest';
import { YouTubePlayer } from '../../src/audio/YouTubePlayer.js';
import type { YouTubePlayerHandlers } from '../../src/audio/YouTubePlayer.js';

type PlayerOptions = ConstructorParameters<NonNullable<NonNullable<Window['YT']>['Player']>>[1];

interface Harness {
  readonly options: PlayerOptions;
  readonly player: YouTubePlayer;
  readonly iframeWindow: object;
  dispatchMessage(source: unknown, data: unknown): void;
}

function createPlayer(handlers: YouTubePlayerHandlers): Harness {
  const captured: PlayerOptions[] = [];
  const listeners = new Set<(event: { source: unknown; data: unknown }) => void>();
  const iframeWindow = {};
  vi.stubGlobal('window', {
    YT: {
      Player: function (_element: unknown, options: PlayerOptions) {
        captured.push(options);
        return {
          getIframe: () => ({ contentWindow: iframeWindow }),
          destroy: vi.fn(),
        };
      },
    },
    addEventListener: (
      type: string,
      listener: (event: { source: unknown; data: unknown }) => void,
    ) => {
      if (type === 'message') {
        listeners.add(listener);
      }
    },
    removeEventListener: (
      type: string,
      listener: (event: { source: unknown; data: unknown }) => void,
    ) => {
      if (type === 'message') {
        listeners.delete(listener);
      }
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
  const player = new YouTubePlayer(container as unknown as HTMLElement, 'aaaaaaaaaaa', handlers);
  const options = captured[0];
  if (options === undefined) {
    throw new Error('YT.Player was not constructed');
  }
  return {
    options,
    player,
    iframeWindow,
    dispatchMessage: (source, data) => {
      for (const listener of listeners) {
        listener({
          source,
          data,
        });
      }
    },
  };
}

function createHandlers(onPositionReport: (positionSec: number) => void): YouTubePlayerHandlers {
  return {
    onReady: vi.fn(),
    onStateChange: vi.fn(),
    onError: vi.fn(),
    onPositionReport,
  };
}

function infoDelivery(info: unknown): string {
  return JSON.stringify({
    event: 'infoDelivery',
    info,
  });
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
    const { options } = createPlayer({
      onReady: vi.fn(),
      onStateChange: vi.fn(),
      onError,
    });

    options.events.onError({ data: code });

    expect(onError).toHaveBeenCalledWith(kind, code);
  });

  it('reports the position from its own iframe infoDelivery messages, even before ready', () => {
    const onPositionReport = vi.fn();
    const harness = createPlayer(createHandlers(onPositionReport));

    harness.dispatchMessage(harness.iframeWindow, infoDelivery({ currentTime: 0.27 }));
    harness.dispatchMessage(
      harness.iframeWindow,
      infoDelivery({
        currentTime: 0,
        playerState: 1,
      }),
    );

    expect(onPositionReport.mock.calls).toEqual([[0.27], [0]]);
  });

  it.each([
    ['another window', {}, infoDelivery({ currentTime: 1 })],
    [
      'non-string data',
      'iframe',
      {
        event: 'infoDelivery',
        info: { currentTime: 1 },
      },
    ],
    ['broken JSON', 'iframe', '{"event":'],
    ['a non-object message', 'iframe', '1'],
    [
      'another event',
      'iframe',
      JSON.stringify({
        event: 'onStateChange',
        info: { currentTime: 1 },
      }),
    ],
    ['missing info', 'iframe', JSON.stringify({ event: 'infoDelivery' })],
    ['no position', 'iframe', infoDelivery({ playerState: 1 })],
    ['a non-numeric position', 'iframe', infoDelivery({ currentTime: 'Infinity' })],
    [
      'a non-finite numeric position',
      'iframe',
      '{"event":"infoDelivery","info":{"currentTime":1e999}}',
    ],
  ])('ignores a message from %s', (_label, source, data) => {
    const onPositionReport = vi.fn();
    const harness = createPlayer(createHandlers(onPositionReport));

    harness.dispatchMessage(source === 'iframe' ? harness.iframeWindow : source, data);

    expect(onPositionReport).not.toHaveBeenCalled();
  });

  it('stops reporting positions after destroy', () => {
    const onPositionReport = vi.fn();
    const harness = createPlayer(createHandlers(onPositionReport));

    harness.player.destroy();
    harness.dispatchMessage(harness.iframeWindow, infoDelivery({ currentTime: 1 }));

    expect(onPositionReport).not.toHaveBeenCalled();
  });

  it('accepts position messages without a position handler', () => {
    const harness = createPlayer({
      onReady: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn(),
    });

    expect(() => {
      harness.dispatchMessage(harness.iframeWindow, infoDelivery({ currentTime: 1 }));
    }).not.toThrow();
  });
});
