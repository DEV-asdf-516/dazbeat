import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadYouTubeIframeApi, YouTubePlayer } from '../../src/audio/YouTubePlayer.js';
import type { YouTubePlayerHandlers } from '../../src/audio/YouTubePlayer.js';
import { requireDefined } from '../../src/invariant.js';

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
  const options = requireDefined(captured[0], 'YT.Player was not constructed');
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

interface FakeScript {
  src: string;
  isRemoved: boolean;
}

// 실제 DOM 이 없는 node 환경이라 loadYouTubeIframeApi 가 쓰는 script 붙이기만 대역으로 기록한다.
function stubIframeApiPage() {
  const page: { scripts: FakeScript[]; window: { onYouTubeIframeAPIReady?: () => void } } = {
    scripts: [],
    window: {},
  };
  vi.stubGlobal('window', page.window);
  vi.stubGlobal('document', {
    createElement: () => {
      const script: FakeScript = {
        src: '',
        isRemoved: false,
      };
      return Object.assign(script, {
        addEventListener: vi.fn(),
        remove: () => {
          script.isRemoved = true;
        },
      });
    },
    head: { append: (script: FakeScript) => page.scripts.push(script) },
  });
  return page;
}

afterEach(() => {
  vi.useRealTimers();
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

  it('passes autoplay blocking to its handler', () => {
    const onAutoplayBlocked = vi.fn();
    const { options } = createPlayer({
      onReady: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn(),
      onAutoplayBlocked,
    });

    options.events.onAutoplayBlocked();

    expect(onAutoplayBlocked).toHaveBeenCalledTimes(1);
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

// 진행 중 로드는 모듈 상태라 테스트 순서대로 이어진다. 준비된 로드는 이후 호출에도 그대로 남으므로 마지막에 둔다.
describe('loadYouTubeIframeApi', () => {
  it('rejects and removes the script after 10000ms without a response, and retries on the next call', async () => {
    vi.useFakeTimers();
    const page = stubIframeApiPage();

    const first = loadYouTubeIframeApi();
    const firstResult = first.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(9999);
    expect(page.scripts).toEqual([
      expect.objectContaining({
        src: 'https://www.youtube.com/iframe_api',
        isRemoved: false,
      }),
    ]);
    await vi.advanceTimersByTimeAsync(1);

    expect(await firstResult).toEqual(new Error('Timed out loading YouTube IFrame API'));
    expect(page.scripts[0]?.isRemoved).toBe(true);
    const second = loadYouTubeIframeApi().catch((error: unknown) => error);
    expect(page.scripts).toHaveLength(2);
    expect(page.scripts[1]?.isRemoved).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    await second;
  });

  it('resolves when the API is ready before the deadline and does not reject after it', async () => {
    vi.useFakeTimers();
    const page = stubIframeApiPage();
    const settled: string[] = [];

    void loadYouTubeIframeApi().then(
      () => settled.push('resolved'),
      () => settled.push('rejected'),
    );
    await vi.advanceTimersByTimeAsync(5000);
    requireDefined(page.window.onYouTubeIframeAPIReady, 'ready callback was not set')();
    await vi.advanceTimersByTimeAsync(10000);

    expect(settled).toEqual(['resolved']);
    expect(page.scripts[0]?.isRemoved).toBe(false);
  });
});
