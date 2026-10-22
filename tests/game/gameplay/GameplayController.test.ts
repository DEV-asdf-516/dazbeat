import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubePlayerHandlers } from '../../../src/audio/YouTubePlayer.js';
import type { PreparedChart, VerifiedPlay } from '../../../src/data/playSession.js';
import type { PlaySubmission } from '../../../src/data/playSubmission.js';
import type { ChartRef, Song } from '../../../src/data/songs.js';
import { GameplayController } from '../../../src/game/gameplay/GameplayController.js';
import type { GameplayLoadError } from '../../../src/game/gameplay/GameplayController.js';
import type { GameplaySceneData, PlayMode } from '../../../src/game/sceneRoutes.js';
import { requireDefined } from '../../../src/invariant.js';
import type { Chart, Difficulty, GameplayResult } from '../../../src/rhythm/types.js';
import { DEFAULT_SETTINGS } from '../../../src/storage/settings.js';
import type { Settings } from '../../../src/storage/settings.js';
import { msToSec, secToMs } from '../../../src/time.js';

const song: Song = {
  id: 'test-song',
  title: 'Test Song',
  category: 'original',
  youtubeVideoId: 'aaaaaaaaaaa',
  jacketUrl: 'http://pb.test/api/files/songs/s1/jacket.png',
  accentColor: 0xffffff,
  constellation: 'gemini',
  gameStartMs: 3000,
  gameEndMs: 10000,
  chartIds: { normal: 'chart_normal' },
};

const chart: Chart = {
  songId: song.id,
  difficulty: 'normal',
  offsetMs: 0,
  notes: [
    {
      type: 'tap',
      timeMs: 4000,
      lane: 0,
    },
  ],
};

const HOLD_CHART: Chart = {
  ...chart,
  notes: [
    {
      type: 'hold',
      timeMs: 4000,
      endTimeMs: 5000,
      lane: 1,
    },
  ],
};

// miss 하나에 HP 10 이 줄어 열 개를 모두 놓치면 HP 가 0 이 된다.
const FAIL_CHART: Chart = {
  ...chart,
  notes: Array.from({ length: 10 }, (_, index) => ({
    type: 'tap' as const,
    timeMs: 4000 + index * 10,
    lane: 0 as const,
  })),
};

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  masterVolume: 0.5,
  musicVolume: 0.5,
  mvMode: 'dim',
};

// gameStartMs 3000 의 재생 시작 위치 S(초).
const START_SEC = 1;
const APPROACH_MS = 1000;
// 첫 노트(4000ms)가 판정선까지 1000ms 걸리므로 프리롤은 최소 길이(S − 3초)다.
const PRE_ROLL_START_MS = -2000;
const REPORT_INTERVAL_MS = 265;
const SEEK_DELAY_MS = 250;

interface Pending<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

type Call = readonly [string, ...unknown[]];

interface Harness {
  readonly controller: GameplayController;
  readonly route: GameplaySceneData;
  readonly screenCalls: Call[];
  readonly callOrder: string[];
  readonly playerCalls: string[];
  readonly preparedCharts: (Pending<PreparedChart> & { readonly ref: ChartRef })[];
  readonly practiceCharts: (Pending<Chart> & { readonly ref: ChartRef })[];
  readonly apiLoads: Pending<void>[];
  readonly createdPlayers: { readonly videoId: string; readonly handlers: YouTubePlayerHandlers }[];
  readonly savedSettings: Settings[];
  readonly savedResults: (readonly [string, Difficulty, GameplayResult])[];
  readonly submissions: (Pending<VerifiedPlay> & {
    readonly sessionId: string;
    readonly submission: PlaySubmission;
  })[];
  readonly effectDones: (() => void)[];
  readonly chart: Chart;
  // 프레임마다 그린 곡 시간.
  readonly songTimes: number[];
  rankedSessionId: string | null;
  isCreateThrowing: boolean;
  isSaveSettingsThrowing: boolean;
  isSaveResultThrowing: boolean;
  nowMs: number;
  bufferedEndSec: number;
  approachMs: number;
  // 게임 시계가 0초인 벽시계 시각. 프리롤이 시작될 때 정한다.
  clockOriginMs: number;
}

function createHarness(
  mode: PlayMode = 'standard',
  playedChart: Chart = chart,
  settings: Settings = SETTINGS,
): Harness {
  const route: GameplaySceneData = {
    song,
    difficulty: 'normal',
    chartId: 'chart_normal',
    mode,
  };
  const harness: Omit<Harness, 'controller'> = {
    route,
    screenCalls: [],
    callOrder: [],
    playerCalls: [],
    preparedCharts: [],
    practiceCharts: [],
    apiLoads: [],
    createdPlayers: [],
    savedSettings: [],
    savedResults: [],
    submissions: [],
    effectDones: [],
    chart: playedChart,
    songTimes: [],
    rankedSessionId: 'session-1',
    isCreateThrowing: false,
    isSaveSettingsThrowing: false,
    isSaveResultThrowing: false,
    nowMs: 1000,
    bufferedEndSec: 0,
    approachMs: APPROACH_MS,
    clockOriginMs: Number.NaN,
  };
  const record = (...call: Call): void => {
    harness.screenCalls.push(call);
  };
  const controller = new GameplayController(
    {
      save: {
        saveSettings: (settings) => {
          if (harness.isSaveSettingsThrowing) {
            throw new Error('storage full');
          }
          harness.savedSettings.push(settings);
        },
        saveResult: (songId, difficulty, result) => {
          if (harness.isSaveResultThrowing) {
            throw new Error('storage full');
          }
          harness.callOrder.push('saveResult');
          harness.savedResults.push([songId, difficulty, result]);
        },
      },
      prepareChart: (ref) =>
        new Promise((resolve, reject) =>
          harness.preparedCharts.push({
            ref,
            resolve,
            reject,
          }),
        ),
      loadPracticeChart: (ref) =>
        new Promise((resolve, reject) =>
          harness.practiceCharts.push({
            ref,
            resolve,
            reject,
          }),
        ),
      rankedPlay: {
        submit: (sessionId, submission) =>
          new Promise((resolve, reject) => {
            harness.callOrder.push('submit');
            harness.submissions.push({
              sessionId,
              submission,
              resolve,
              reject,
            });
          }),
      },
      players: {
        loadApi: () =>
          new Promise((resolve, reject) =>
            harness.apiLoads.push({
              resolve,
              reject,
            }),
          ),
        create: (videoId, handlers) => {
          if (harness.isCreateThrowing) {
            throw new Error('iframe failed');
          }
          harness.createdPlayers.push({
            videoId,
            handlers,
          });
          return {
            requestPlay: (fromSec) => harness.playerCalls.push(`requestPlay(${fromSec})`),
            pause: () => harness.playerCalls.push('pause'),
            resume: () => harness.playerCalls.push('resume'),
            setVolume: (volume) => harness.playerCalls.push(`setVolume(${volume})`),
            getBufferedEndSec: () => harness.bufferedEndSec,
            destroy: () => harness.playerCalls.push('destroy'),
          };
        },
      },
      now: () => harness.nowMs,
    },
    {
      showStatus: (status) => record('showStatus', status),
      showMvMode: (next) => record('showMvMode', next),
      setMvVisible: (isVisible) => record('setMvVisible', isVisible),
      showLoadError: (error) => record('showLoadError', error),
      openQuitConfirm: (reason) => record('openQuitConfirm', reason),
      closeQuitConfirm: () => record('closeQuitConfirm'),
      beginPlay: (played) => {
        record('beginPlay', played);
        return {
          approachMs: harness.approachMs,
          drawFrame: (frame) => {
            record('drawFrame');
            harness.songTimes.push(frame.songTimeMs);
          },
          pressLane: (lane) => record('pressLane', lane),
          showJudgments: (events) => record('showJudgments', events),
          hideIntro: () => record('hideIntro'),
          playFullCombo: (onDone) => {
            record('playFullCombo');
            harness.effectDones.push(onDone);
          },
          playFailure: (onDone) => {
            record('playFailure');
            harness.effectDones.push(onDone);
          },
        };
      },
      showResult: (data) => {
        harness.callOrder.push('showResult');
        record('showResult', data);
      },
      backToSongSelect: () => record('backToSongSelect'),
    },
    route,
    settings,
  );
  return Object.assign(harness, { controller });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getHandlers(harness: Harness): YouTubePlayerHandlers {
  return requireDefined(harness.createdPlayers[0], 'player was not created').handlers;
}

function resolveChart(harness: Harness): void {
  if (harness.route.mode === 'standard') {
    requireDefined(harness.preparedCharts[0], 'prepared chart was not requested').resolve({
      chart: harness.chart,
      rankedSessionId: harness.rankedSessionId,
    });
  } else {
    requireDefined(harness.practiceCharts[0], 'practice chart was not requested').resolve(
      harness.chart,
    );
  }
}

async function startLoaded(harness: Harness): Promise<void> {
  void harness.controller.start();
  resolveChart(harness);
  await flush();
  requireDefined(harness.apiLoads[0], 'API load was not requested').resolve();
  await flush();
}

async function startReady(harness: Harness): Promise<void> {
  await startLoaded(harness);
  getHandlers(harness).onReady();
}

// ready 에서 시작 키를 눌러 예열을 지나 선버퍼링 중인 상태.
async function startPreloading(harness: Harness): Promise<void> {
  await startReady(harness);
  harness.controller.keyDown('Enter', false);
  getHandlers(harness).onStateChange('playing');
  getHandlers(harness).onStateChange('paused');
}

// 선버퍼링이 끝나 재생 객체가 예열을 시작한 상태.
async function startWarming(harness: Harness): Promise<void> {
  await startPreloading(harness);
  harness.bufferedEndSec = 10;
  harness.controller.tick();
}

function report(harness: Harness, positionSec: number): void {
  const handlers = getHandlers(harness);
  if (handlers.onPositionReport === undefined) {
    throw new Error('position reports are not handled');
  }
  handlers.onPositionReport(positionSec);
}

// 영상이 positionSec 에서 1배속으로 흐르는 보고 두 개.
function reportSteadyFrom(harness: Harness, positionSec: number): void {
  report(harness, positionSec);
  harness.nowMs += REPORT_INTERVAL_MS;
  report(harness, positionSec + msToSec(REPORT_INTERVAL_MS));
}

// 예열이 흐르고 보정 seek 가 250ms 뒤 S 에서 흐른다고 보고해 프리롤 카운트다운이 시작된 상태.
async function startCountdown(
  harness: Harness,
  preRollStartMs: number = PRE_ROLL_START_MS,
): Promise<void> {
  await startWarming(harness);
  reportSteadyFrom(harness, START_SEC);
  harness.nowMs += SEEK_DELAY_MS;
  reportSteadyFrom(harness, START_SEC);
  harness.clockOriginMs = harness.nowMs - preRollStartMs;
}

function moveClock(harness: Harness, clockSec: number): void {
  harness.nowMs = harness.clockOriginMs + secToMs(clockSec);
}

// 게임 시계가 S − 250ms 에 곡 시작 seek 를 보내고, 그 seek 가 250ms 뒤 S 에서 흘러 검증을 통과한 상태.
async function startVideo(harness: Harness): Promise<void> {
  await startCountdown(harness);
  moveClock(harness, START_SEC - msToSec(SEEK_DELAY_MS));
  harness.controller.tick();
  harness.nowMs += SEEK_DELAY_MS;
  reportSteadyFrom(harness, START_SEC);
  harness.controller.tick();
}

function runEffectDone(harness: Harness): void {
  requireDefined(harness.effectDones[0], 'no effect was played')();
}

function resetCalls(harness: Harness): void {
  harness.screenCalls.length = 0;
  harness.playerCalls.length = 0;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GameplayController start', () => {
  it('prepares the standard chart, loads the API, creates the player and waits for start on ready', async () => {
    const harness = createHarness('standard');
    void harness.controller.start();

    expect(harness.screenCalls).toEqual([['showStatus', { kind: 'loading' }]]);
    expect(harness.preparedCharts.map(({ ref }) => ref)).toEqual([harness.route]);
    expect(harness.practiceCharts).toEqual([]);
    expect(harness.apiLoads).toHaveLength(0);

    resolveChart(harness);
    await flush();
    expect(harness.apiLoads).toHaveLength(1);
    expect(harness.createdPlayers).toHaveLength(0);

    requireDefined(harness.apiLoads[0], 'API load was not requested').resolve();
    await flush();
    expect(harness.createdPlayers.map(({ videoId }) => videoId)).toEqual([song.youtubeVideoId]);

    getHandlers(harness).onReady();
    expect(harness.playerCalls).toEqual(['setVolume(0.25)']);
    expect(harness.screenCalls.at(-1)).toEqual(['showStatus', { kind: 'awaitingStart' }]);
  });

  it('loads the practice chart for practice mode', async () => {
    const harness = createHarness('practice');
    void harness.controller.start();

    expect(harness.practiceCharts.map(({ ref }) => ref)).toEqual([harness.route]);
    expect(harness.preparedCharts).toEqual([]);

    requireDefined(harness.practiceCharts[0], 'practice chart was not requested').resolve(chart);
    await flush();
    requireDefined(harness.apiLoads[0], 'API load was not requested').resolve();
    await flush();
    expect(harness.createdPlayers).toHaveLength(1);
  });
});

describe('GameplayController load errors', () => {
  it('shows chartLoadFailed without loading the API when the chart fails', async () => {
    const harness = createHarness();
    void harness.controller.start();
    requireDefined(harness.preparedCharts[0], 'prepared chart was not requested').reject(
      new Error('network'),
    );
    await flush();

    expect(harness.screenCalls.at(-1)).toEqual(['showLoadError', { kind: 'chartLoadFailed' }]);
    expect(harness.apiLoads).toHaveLength(0);
  });

  it('shows playerLoadFailed without creating the player when the API fails', async () => {
    const harness = createHarness();
    void harness.controller.start();
    resolveChart(harness);
    await flush();
    requireDefined(harness.apiLoads[0], 'API load was not requested').reject(
      new Error('script blocked'),
    );
    await flush();

    expect(harness.screenCalls.at(-1)).toEqual(['showLoadError', { kind: 'playerLoadFailed' }]);
    expect(harness.createdPlayers).toHaveLength(0);
  });

  it('shows playerLoadFailed when creating the player throws', async () => {
    const harness = createHarness();
    harness.isCreateThrowing = true;
    await startLoaded(harness);

    expect(harness.screenCalls.at(-1)).toEqual(['showLoadError', { kind: 'playerLoadFailed' }]);
  });
});

describe('GameplayController player errors', () => {
  it('destroys the player and shows the video error', async () => {
    const harness = createHarness();
    await startReady(harness);
    resetCalls(harness);

    getHandlers(harness).onError('embeddingNotAllowed', 150);

    expect(harness.playerCalls).toEqual(['destroy']);
    const error: GameplayLoadError = {
      kind: 'videoError',
      errorKind: 'embeddingNotAllowed',
      code: 150,
    };
    expect(harness.screenCalls).toEqual([['showLoadError', error]]);
  });

  it('ignores player errors in the error phase', async () => {
    const harness = createHarness();
    await startReady(harness);
    getHandlers(harness).onError('videoNotFound', 100);
    resetCalls(harness);

    getHandlers(harness).onError('unknown', -1);

    expect(harness.playerCalls).toEqual([]);
    expect(harness.screenCalls).toEqual([]);
  });

  it.each(['Enter', 'Escape'])(
    'goes back to song select on %s in the error screen',
    async (code) => {
      const harness = createHarness();
      await startReady(harness);
      getHandlers(harness).onError('videoNotFound', 100);
      resetCalls(harness);

      harness.controller.keyDown(code, false);

      expect(harness.screenCalls).toEqual([['backToSongSelect']]);
    },
  );
});

describe('GameplayController late results', () => {
  it('drops a chart that resolves after close', async () => {
    const harness = createHarness();
    void harness.controller.start();
    harness.controller.close();
    resetCalls(harness);

    resolveChart(harness);
    await flush();

    expect(harness.apiLoads).toHaveLength(0);
    expect(harness.screenCalls).toEqual([]);
  });

  it('drops an API load that resolves after close', async () => {
    const harness = createHarness();
    void harness.controller.start();
    resolveChart(harness);
    await flush();
    harness.controller.close();
    resetCalls(harness);

    requireDefined(harness.apiLoads[0], 'API load was not requested').resolve();
    await flush();

    expect(harness.createdPlayers).toHaveLength(0);
    expect(harness.screenCalls).toEqual([]);
  });

  it('drops a chart failure that arrives after close', async () => {
    const harness = createHarness();
    void harness.controller.start();
    harness.controller.close();
    resetCalls(harness);

    requireDefined(harness.preparedCharts[0], 'prepared chart was not requested').reject(
      new Error('network'),
    );
    await flush();

    expect(harness.screenCalls).toEqual([]);
  });

  it('does not create the player for a chart that resolves after leaving', async () => {
    const harness = createHarness();
    void harness.controller.start();
    harness.controller.keyDown('Escape', false);
    resetCalls(harness);

    resolveChart(harness);
    await flush();

    expect(harness.apiLoads).toHaveLength(0);
    expect(harness.createdPlayers).toHaveLength(0);
    expect(harness.screenCalls).toEqual([]);
  });

  it('does not create the player for an API load that resolves after leaving', async () => {
    const harness = createHarness();
    void harness.controller.start();
    resolveChart(harness);
    await flush();
    harness.controller.keyDown('Escape', false);
    resetCalls(harness);

    requireDefined(harness.apiLoads[0], 'API load was not requested').resolve();
    await flush();

    expect(harness.createdPlayers).toHaveLength(0);
    expect(harness.screenCalls).toEqual([]);
  });

  it('destroys the player on close and ignores later player events', async () => {
    const harness = createHarness();
    await startLoaded(harness);
    resetCalls(harness);

    harness.controller.close();
    expect(harness.playerCalls).toEqual(['destroy']);

    const handlers = getHandlers(harness);
    handlers.onReady();
    handlers.onStateChange('playing');
    handlers.onError('videoNotFound', 100);
    expect(harness.screenCalls).toEqual([]);
    expect(harness.playerCalls).toEqual(['destroy']);
  });
});

describe('GameplayController start request', () => {
  it('requests a muted warm-up from the lead-in start, shows loading and hides the MV on Enter in ready', async () => {
    const harness = createHarness();
    await startReady(harness);
    resetCalls(harness);

    harness.controller.keyDown('Enter', false);

    expect(harness.playerCalls).toEqual(['setVolume(0)', 'requestPlay(1)']);
    expect(harness.screenCalls).toEqual([
      ['showStatus', { kind: 'loading' }],
      ['setMvVisible', false],
    ]);
  });

  it('ignores a repeated Enter in ready', async () => {
    const harness = createHarness();
    await startReady(harness);
    resetCalls(harness);

    harness.controller.keyDown('Enter', true);

    expect(harness.playerCalls).toEqual([]);
    expect(harness.screenCalls).toEqual([]);
  });

  it('ignores Enter while loading', async () => {
    const harness = createHarness();
    await startLoaded(harness);
    resetCalls(harness);

    harness.controller.keyDown('Enter', false);

    expect(harness.playerCalls).toEqual([]);
    expect(harness.screenCalls).toEqual([]);
  });

  it('ignores Enter while starting', async () => {
    const harness = createHarness();
    await startReady(harness);
    harness.controller.keyDown('Enter', false);
    resetCalls(harness);

    harness.controller.keyDown('Enter', false);

    expect(harness.playerCalls).toEqual([]);
    expect(harness.screenCalls).toEqual([]);
  });

  it('begins play with the warm-up on the tick that ends preloading', async () => {
    const harness = createHarness();
    await startPreloading(harness);
    resetCalls(harness);

    harness.bufferedEndSec = 9.999;
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([]);

    harness.bufferedEndSec = 10;
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([
      ['beginPlay', chart],
      ['showStatus', { kind: 'loading' }],
    ]);
    expect(harness.playerCalls).toEqual(['setVolume(0.01)', 'resume']);
  });
});

describe('GameplayController start sequence', () => {
  it('calibrates from position reports and starts the countdown', async () => {
    const harness = createHarness();
    await startWarming(harness);
    resetCalls(harness);

    reportSteadyFrom(harness, START_SEC);
    expect(harness.playerCalls).toEqual(['requestPlay(1)']);
    expect(harness.screenCalls).toEqual([]);

    harness.nowMs += SEEK_DELAY_MS;
    reportSteadyFrom(harness, START_SEC);
    expect(harness.screenCalls).toEqual([
      [
        'showStatus',
        {
          kind: 'countdown',
          digit: 3,
        },
      ],
    ]);
  });

  it('starts the pre-roll where the first note enters the top of the screen', async () => {
    const harness = createHarness(
      'standard',
      {
        ...chart,
        offsetMs: 100,
      },
      {
        ...SETTINGS,
        inputOffsetMs: 50,
      },
    );
    harness.approachMs = 6500;
    await startCountdown(harness, 4000 - 6500 - 50 - 100);
    resetCalls(harness);

    harness.controller.tick();

    expect(harness.songTimes).toEqual([4000 - 6500]);
  });

  it('shows the MV once when the clock reaches S and not on countdown digit changes', async () => {
    const harness = createHarness();
    await startCountdown(harness);
    resetCalls(harness);

    moveClock(harness, -0.5);
    harness.controller.tick();
    moveClock(harness, START_SEC - msToSec(SEEK_DELAY_MS));
    harness.controller.tick();
    expect(harness.screenCalls.filter(([name]) => name === 'setMvVisible')).toEqual([]);

    moveClock(harness, START_SEC);
    harness.controller.tick();
    moveClock(harness, START_SEC + 0.5);
    harness.controller.tick();
    expect(harness.screenCalls.filter(([name]) => name !== 'drawFrame')).toEqual([
      [
        'showStatus',
        {
          kind: 'countdown',
          digit: 2,
        },
      ],
      [
        'showStatus',
        {
          kind: 'countdown',
          digit: 1,
        },
      ],
      ['showStatus', { kind: 'none' }],
      ['setMvVisible', true],
    ]);
  });

  it('ignores position reports outside the playing phase', async () => {
    const harness = createHarness();
    await startReady(harness);
    report(harness, START_SEC);
    harness.controller.keyDown('Enter', false);
    resetCalls(harness);

    reportSteadyFrom(harness, START_SEC);

    expect(harness.screenCalls).toEqual([]);
    expect(harness.playerCalls).toEqual([]);
  });
});

describe('GameplayController playback failures', () => {
  it('destroys the player and shows playbackStartFailed without drawing that tick', async () => {
    const harness = createHarness();
    await startWarming(harness);
    resetCalls(harness);

    harness.nowMs += 10001;
    harness.controller.tick();

    expect(harness.playerCalls).toEqual(['destroy']);
    expect(harness.screenCalls).toEqual([['showLoadError', { kind: 'playbackStartFailed' }]]);
  });

  it('recovers from a sustained drift without the error screen or destroying the player', async () => {
    const harness = createHarness();
    await startVideo(harness);
    resetCalls(harness);

    for (const clockSec of [START_SEC + 0.5, START_SEC + 1.499]) {
      moveClock(harness, clockSec);
      report(harness, clockSec + 1);
    }
    expect(harness.playerCalls).toEqual([]);

    moveClock(harness, START_SEC + 1.5);
    report(harness, START_SEC + 2.5);

    expect(harness.playerCalls).toEqual(['setVolume(0.01)']);
    expect(harness.screenCalls).toEqual([
      ['showStatus', { kind: 'resuming' }],
      ['setMvVisible', false],
    ]);
  });
});

describe('GameplayController MV mode', () => {
  it('saves and shows the next MV mode on Tab', () => {
    const harness = createHarness();
    void harness.controller.start();
    resetCalls(harness);

    harness.controller.keyDown('Tab', false);
    harness.controller.keyDown('Tab', false);

    expect(harness.savedSettings.map(({ mvMode }) => mvMode)).toEqual(['blur', 'off']);
    expect(harness.savedSettings[0]).toEqual({
      ...SETTINGS,
      mvMode: 'blur',
    });
    expect(SETTINGS.mvMode).toBe('dim');
    expect(harness.screenCalls).toEqual([
      ['showMvMode', 'blur'],
      ['showMvMode', 'off'],
    ]);
  });

  it('shows the next MV mode even when saving settings throws', async () => {
    const harness = createHarness();
    await startReady(harness);
    harness.isSaveSettingsThrowing = true;
    resetCalls(harness);

    harness.controller.keyDown('Tab', false);

    expect(harness.screenCalls).toEqual([['showMvMode', 'blur']]);
  });

  it('ignores a repeated Tab while loading', () => {
    const harness = createHarness();
    void harness.controller.start();
    resetCalls(harness);

    harness.controller.keyDown('Tab', true);

    expect(harness.savedSettings).toEqual([]);
    expect(harness.screenCalls).toEqual([]);
  });
});

describe('GameplayController leaving', () => {
  it('goes back to song select once on Escape and ignores later keys', () => {
    const harness = createHarness();
    void harness.controller.start();
    resetCalls(harness);

    harness.controller.keyDown('Escape', false);
    harness.controller.keyDown('Escape', false);
    harness.controller.keyDown('Tab', false);
    harness.controller.leave();

    expect(harness.screenCalls).toEqual([['backToSongSelect']]);
    expect(harness.savedSettings).toEqual([]);
  });

  it('goes back to song select once on leave and ignores the start key', async () => {
    const harness = createHarness();
    await startReady(harness);
    resetCalls(harness);

    harness.controller.leave();
    harness.controller.leave();
    harness.controller.keyDown('Enter', false);

    expect(harness.screenCalls).toEqual([['backToSongSelect']]);
    expect(harness.playerCalls).toEqual([]);
  });
});

describe('GameplayController countdown', () => {
  it('shows the countdown digit only on the tick it changes', async () => {
    const harness = createHarness();
    await startCountdown(harness);
    resetCalls(harness);

    harness.nowMs += 999;
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([['drawFrame']]);

    harness.nowMs += 1;
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([
      ['drawFrame'],
      [
        'showStatus',
        {
          kind: 'countdown',
          digit: 2,
        },
      ],
      ['drawFrame'],
    ]);
  });

  it('ignores lane keys and their keyup during the countdown', async () => {
    const harness = createHarness();
    await startCountdown(harness);
    resetCalls(harness);

    harness.controller.keyDown('KeyD', false);
    harness.controller.keyUp('KeyD');

    expect(harness.screenCalls).toEqual([]);
    expect(harness.playerCalls).toEqual([]);
  });
});

describe('GameplayController playing', () => {
  it('presses the lane and shows the judgment on a lane key', async () => {
    const harness = createHarness();
    await startVideo(harness);
    moveClock(harness, 4);
    harness.controller.tick();
    resetCalls(harness);

    harness.controller.keyDown('KeyD', false);

    expect(harness.screenCalls).toEqual([
      ['pressLane', 0],
      ['showJudgments', [expect.objectContaining({ judgment: 'perfect' })]],
    ]);
  });

  it('draws every playing tick and shows judgments only when there are some', async () => {
    const harness = createHarness();
    await startVideo(harness);
    moveClock(harness, 3);
    harness.controller.tick();
    resetCalls(harness);

    moveClock(harness, 4.13);
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([['drawFrame']]);

    moveClock(harness, 4.131);
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([
      ['drawFrame'],
      ['showJudgments', [expect.objectContaining({ judgment: 'miss' })]],
      ['drawFrame'],
    ]);
  });

  it('judges keyup only for a pressed lane', async () => {
    const harness = createHarness('standard', HOLD_CHART);
    await startVideo(harness);
    moveClock(harness, 4);
    harness.controller.tick();
    harness.controller.keyUp('KeyF');
    harness.controller.keyDown('KeyF', false);
    moveClock(harness, 4.5);
    resetCalls(harness);

    harness.controller.keyUp('KeyJ');
    expect(harness.screenCalls).toEqual([]);

    harness.controller.keyUp('KeyF');
    expect(harness.screenCalls).toEqual([
      ['showJudgments', [expect.objectContaining({ judgment: 'miss' })]],
    ]);
  });

  it('hides the intro once on the tick the playback reaches the game start', async () => {
    const harness = createHarness();
    await startVideo(harness);

    moveClock(harness, 2.999);
    harness.controller.tick();
    moveClock(harness, 3);
    harness.controller.tick();
    moveClock(harness, 3.5);
    harness.controller.tick();

    const hideIntroTicks = harness.screenCalls
      .filter(([name]) => name === 'drawFrame' || name === 'hideIntro')
      .slice(-4)
      .map(([name]) => name);
    expect(hideIntroTicks).toEqual(['drawFrame', 'drawFrame', 'hideIntro', 'drawFrame']);
  });
});

describe('GameplayController quit confirm', () => {
  it('pauses on Escape and resumes on the next Escape, ignoring repeats', async () => {
    const harness = createHarness();
    await startVideo(harness);
    resetCalls(harness);

    harness.controller.keyDown('Escape', false);
    const pausedCalls = [
      ['showStatus', { kind: 'paused' }],
      ['setMvVisible', false],
      ['openQuitConfirm', 'userPaused'],
    ];
    expect(harness.screenCalls).toEqual(pausedCalls);
    expect(harness.playerCalls).toEqual(['pause']);

    harness.controller.keyDown('Escape', true);
    expect(harness.screenCalls).toEqual(pausedCalls);

    harness.controller.keyDown('Escape', false);
    expect(harness.screenCalls).toEqual([
      ...pausedCalls,
      ['closeQuitConfirm'],
      ['showStatus', { kind: 'resuming' }],
    ]);
    expect(harness.playerCalls).toEqual(['pause', 'setVolume(0.01)', 'resume']);
  });

  it('goes back to song select on Enter while the quit confirm is open', async () => {
    const harness = createHarness();
    await startVideo(harness);
    harness.controller.keyDown('Escape', false);
    resetCalls(harness);

    harness.controller.keyDown('Enter', false);

    expect(harness.screenCalls).toEqual([['backToSongSelect']]);
  });

  it('closes the quit confirm from the public call only while it is open', async () => {
    const harness = createHarness();
    await startVideo(harness);
    resetCalls(harness);

    harness.controller.closeQuitConfirm();
    expect(harness.screenCalls).toEqual([]);
    expect(harness.playerCalls).toEqual([]);

    harness.controller.keyDown('Escape', false);
    resetCalls(harness);
    harness.controller.closeQuitConfirm();
    expect(harness.screenCalls).toEqual([
      ['closeQuitConfirm'],
      ['showStatus', { kind: 'resuming' }],
    ]);
    expect(harness.playerCalls).toEqual(['setVolume(0.01)', 'resume']);
  });

  it('does nothing on Enter while paused, resuming or counting down to the resume', async () => {
    const harness = createHarness();
    await startVideo(harness);
    harness.controller.keyDown('Escape', false);
    harness.controller.keyDown('Escape', false);
    resetCalls(harness);

    harness.controller.keyDown('Enter', false);
    expect(harness.screenCalls).toEqual([]);
    expect(harness.playerCalls).toEqual([]);

    harness.nowMs += 300;
    reportSteadyFrom(harness, 5);
    expect(harness.playerCalls).toEqual(['requestPlay(0)']);
    harness.nowMs += SEEK_DELAY_MS;
    reportSteadyFrom(harness, 0);
    expect(harness.screenCalls).toEqual([
      [
        'showStatus',
        {
          kind: 'countdown',
          digit: 3,
        },
      ],
    ]);
    resetCalls(harness);

    harness.controller.keyDown('Enter', false);
    expect(harness.screenCalls).toEqual([]);
    expect(harness.playerCalls).toEqual([]);
  });
});

describe('GameplayController resync failure', () => {
  // 재개 요청 뒤 안정 진행이 10000ms 넘게 오지 않아 재동기화에 실패한 상태.
  async function startResyncFailed(harness: Harness): Promise<void> {
    await startVideo(harness);
    harness.controller.keyDown('Escape', false);
    harness.controller.keyDown('Escape', false);
    resetCalls(harness);
    harness.nowMs += 10001;
    harness.controller.tick();
  }

  it('opens the quit confirm as a resync failure without the error screen', async () => {
    const harness = createHarness();
    await startResyncFailed(harness);

    expect(harness.playerCalls).toEqual(['pause']);
    expect(harness.screenCalls.filter(([name]) => name !== 'drawFrame')).toEqual([
      ['showStatus', { kind: 'paused' }],
      ['openQuitConfirm', 'resyncFailed'],
    ]);
  });

  it('resumes on Escape from the resync failure confirm', async () => {
    const harness = createHarness();
    await startResyncFailed(harness);
    resetCalls(harness);

    harness.controller.keyDown('Escape', false);

    expect(harness.screenCalls).toEqual([
      ['closeQuitConfirm'],
      ['showStatus', { kind: 'resuming' }],
    ]);
    expect(harness.playerCalls).toEqual(['setVolume(0.01)', 'resume']);
  });

  it('goes back to song select on Enter from the resync failure confirm', async () => {
    const harness = createHarness();
    await startResyncFailed(harness);
    resetCalls(harness);

    harness.controller.keyDown('Enter', false);

    expect(harness.screenCalls).toEqual([['backToSongSelect']]);
    expect(harness.playerCalls).toEqual([]);
  });

  it('hides the MV when the playback starts resuming by itself', async () => {
    const harness = createHarness();
    await startVideo(harness);
    resetCalls(harness);

    getHandlers(harness).onStateChange('buffering');

    expect(harness.screenCalls).toEqual([
      ['showStatus', { kind: 'resuming' }],
      ['setMvVisible', false],
    ]);
  });
});

describe('GameplayController failure', () => {
  it('plays the failure once, pauses the video and then ignores keys and ticks', async () => {
    const harness = createHarness('standard', FAIL_CHART);
    await startVideo(harness);
    resetCalls(harness);

    moveClock(harness, 5);
    harness.controller.tick();
    expect(harness.screenCalls.map(([name]) => name)).toEqual(['showJudgments', 'playFailure']);
    expect(harness.playerCalls).toEqual(['pause']);

    resetCalls(harness);
    harness.controller.keyDown('KeyD', false);
    harness.controller.keyUp('KeyD');
    harness.controller.keyDown('Escape', false);
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([]);
    expect(harness.playerCalls).toEqual([]);
  });

  it('shows the failed result after the failure effect without saving or submitting', async () => {
    const harness = createHarness('standard', FAIL_CHART);
    await startVideo(harness);
    moveClock(harness, 5);
    harness.controller.tick();
    resetCalls(harness);

    runEffectDone(harness);

    expect(harness.screenCalls).toMatchObject([
      [
        'showResult',
        {
          song,
          difficulty: 'normal',
          chartId: 'chart_normal',
          mode: 'standard',
          result: { outcome: 'failed' },
        },
      ],
    ]);
    expect(harness.savedResults).toEqual([]);
    expect(harness.submissions).toEqual([]);
  });

  it('does not fail in practice for the same misses', async () => {
    const harness = createHarness('practice', FAIL_CHART);
    await startVideo(harness);
    moveClock(harness, 3);
    harness.controller.tick();
    resetCalls(harness);

    moveClock(harness, 5);
    harness.controller.tick();

    expect(harness.screenCalls.map(([name]) => name)).toEqual(['showJudgments', 'drawFrame']);
    expect(harness.playerCalls).toEqual([]);
  });
});

describe('GameplayController run end', () => {
  // 노트를 perfect 로 쳐 풀콤보가 된 상태.
  async function startFullCombo(harness: Harness): Promise<void> {
    await startVideo(harness);
    moveClock(harness, 4);
    harness.controller.tick();
    harness.controller.keyDown('KeyD', false);
  }

  it('pauses the video and plays the full combo on the tick that reaches the game end', async () => {
    const harness = createHarness();
    await startFullCombo(harness);
    resetCalls(harness);

    moveClock(harness, 9.999);
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([['drawFrame']]);
    expect(harness.playerCalls).toEqual([]);

    moveClock(harness, 10);
    harness.controller.tick();
    expect(harness.screenCalls).toEqual([['drawFrame'], ['drawFrame'], ['playFullCombo']]);
    expect(harness.playerCalls).toEqual(['pause']);
  });

  it('saves, submits and shows the result after the full combo effect', async () => {
    const harness = createHarness();
    await startFullCombo(harness);
    moveClock(harness, 10);
    harness.controller.tick();
    resetCalls(harness);

    runEffectDone(harness);

    const result = {
      outcome: 'finished',
      maxCombo: 1,
    };
    expect(harness.savedResults).toMatchObject([[song.id, 'normal', result]]);
    expect(harness.submissions.map(({ sessionId, submission }) => [sessionId, submission])).toEqual(
      [
        [
          'session-1',
          {
            inputOffsetMs: SETTINGS.inputOffsetMs,
            events: [
              {
                lane: 0,
                kind: 'press',
                songTimeMs: 4000,
              },
            ],
          },
        ],
      ],
    );
    expect(harness.screenCalls).toMatchObject([
      [
        'showResult',
        {
          song,
          difficulty: 'normal',
          chartId: 'chart_normal',
          mode: 'standard',
          result,
        },
      ],
    ]);
    expect(harness.callOrder).toEqual(['saveResult', 'submit', 'showResult']);
  });

  it('shows the result right away when the run is not a full combo', async () => {
    const harness = createHarness();
    await startVideo(harness);
    moveClock(harness, 5);
    harness.controller.tick();
    resetCalls(harness);

    moveClock(harness, 10);
    harness.controller.tick();

    expect(harness.screenCalls.map(([name]) => name)).toEqual(['drawFrame', 'showResult']);
    expect(harness.savedResults).toHaveLength(1);
    expect(harness.submissions).toHaveLength(1);
  });

  it('does not submit without a ranked session', async () => {
    const harness = createHarness();
    harness.rankedSessionId = null;
    await startVideo(harness);
    moveClock(harness, 10);
    harness.controller.tick();

    expect(harness.savedResults).toHaveLength(1);
    expect(harness.submissions).toEqual([]);
    expect(harness.callOrder).toEqual(['saveResult', 'showResult']);
  });

  it('shows the result even when saving the result throws or the submission is rejected', async () => {
    const harness = createHarness();
    harness.isSaveResultThrowing = true;
    await startVideo(harness);
    moveClock(harness, 10);
    harness.controller.tick();

    expect(harness.screenCalls.at(-1)?.[0]).toBe('showResult');
    requireDefined(harness.submissions[0], 'submission was not requested').reject(
      new Error('network'),
    );
    await flush();
    expect(console.warn).toHaveBeenCalledWith('Failed to submit ranked play', expect.any(Error));
  });

  it('neither saves nor submits in practice', async () => {
    const harness = createHarness('practice');
    await startVideo(harness);
    moveClock(harness, 10);
    harness.controller.tick();

    expect(harness.savedResults).toEqual([]);
    expect(harness.submissions).toEqual([]);
    expect(harness.screenCalls.at(-1)).toEqual([
      'showResult',
      expect.objectContaining({ mode: 'practice' }),
    ]);
  });

  it('ignores player errors while the full combo effect plays', async () => {
    const harness = createHarness();
    await startFullCombo(harness);
    moveClock(harness, 10);
    harness.controller.tick();
    resetCalls(harness);

    getHandlers(harness).onError('unknown', -1);

    expect(harness.playerCalls).toEqual([]);
    expect(harness.screenCalls).toEqual([]);
  });

  it('does not show the result when the effect finishes after close', async () => {
    const harness = createHarness();
    await startFullCombo(harness);
    moveClock(harness, 10);
    harness.controller.tick();
    harness.controller.close();
    resetCalls(harness);

    runEffectDone(harness);

    expect(harness.screenCalls).toEqual([]);
    expect(harness.savedResults).toEqual([]);
    expect(harness.submissions).toEqual([]);
  });
});
