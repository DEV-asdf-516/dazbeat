import type { Difficulty, FinishedGameplayResult, LaneCount } from '../rhythm/types.js';
import { mergeBestRecord, parseChartRecord, recordKey } from './chartRecords.js';
import type { ChartRecord, ChartRecords } from './chartRecords.js';
import { DEFAULT_SETTINGS, SETTINGS_PARSERS } from './settings.js';
import type { Settings } from './settings.js';
import { parseJson } from '../json.js';
import { isRecord, isString } from '../typeGuards.js';

const SETTINGS_KEY = 'dazbeat:settings:v1';
const RECORDS_KEY = 'dazbeat:records:v2';
const REVISION_NOTICES_KEY = 'dazbeat:revisionNotices:v1';
const ACCELERATION_NOTICE_KEY = 'dazbeat:accelerationNotice:v1';
const GUEST_NOTICE_KEY = 'dazbeat:guestNotice:v1';
const GUEST_PLAYER_REPORTS_KEY = 'dazbeat:guestPlayerReports:v1';

export class LocalSave {
  constructor(private readonly storage: Storage) {}

  loadSettings(): Settings {
    const saved = this.readObject(SETTINGS_KEY, 'settings', 'using defaults');
    if (saved === undefined) {
      return { ...DEFAULT_SETTINGS };
    }
    let isRecovered = false;
    const read = <K extends keyof Settings>(field: K): Settings[K] => {
      const value = SETTINGS_PARSERS[field](saved[field]);
      if (value !== undefined) {
        return value;
      }
      isRecovered = true;
      return DEFAULT_SETTINGS[field];
    };
    const settings: Settings = {
      backgroundVolume: read('backgroundVolume'),
      musicVolume: read('musicVolume'),
      effectVolume: read('effectVolume'),
      mutedVolumes: read('mutedVolumes'),
      inputOffsetMs: read('inputOffsetMs'),
      scrollSpeedPxPerSecond: read('scrollSpeedPxPerSecond'),
      laneMode: read('laneMode'),
      keyBindings: read('keyBindings'),
      mvMode: read('mvMode'),
      language: read('language'),
    };
    if (isRecovered) {
      console.warn('Saved settings had invalid fields; replaced them with defaults');
    }
    return settings;
  }

  saveSettings(settings: Settings): void {
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  loadRecords(): ChartRecords {
    return new Map(Object.entries(this.readRecords()));
  }

  saveResult(
    songId: string,
    laneCount: LaneCount,
    difficulty: Difficulty,
    result: FinishedGameplayResult,
  ): void {
    const records = this.readRecords();
    const key = recordKey(songId, laneCount, difficulty);
    records[key] = mergeBestRecord(records[key], result);
    this.storage.setItem(RECORDS_KEY, JSON.stringify(records));
  }

  loadRevisionNotices(): ReadonlyMap<string, string> {
    return new Map(Object.entries(this.readRevisionNotices()));
  }

  saveRevisionNotice(chartId: string, chartRevision: string): void {
    const notices = this.readRevisionNotices();
    notices[chartId] = chartRevision;
    this.storage.setItem(REVISION_NOTICES_KEY, JSON.stringify(notices));
  }

  isAccelerationNoticeDismissed(): boolean {
    const saved = this.readObject(
      ACCELERATION_NOTICE_KEY,
      'acceleration notice',
      'showing it again',
    );
    return saved?.isDismissed === true;
  }

  dismissAccelerationNotice(): void {
    this.storage.setItem(ACCELERATION_NOTICE_KEY, JSON.stringify({ isDismissed: true }));
  }

  isGuestNoticeShown(): boolean {
    const saved = this.readObject(GUEST_NOTICE_KEY, 'guest notice', 'showing it again');
    return saved?.isShown === true;
  }

  markGuestNoticeShown(): void {
    this.storage.setItem(GUEST_NOTICE_KEY, JSON.stringify({ isShown: true }));
  }

  /** 순위표 플레이어 수는 revision 마다 다시 세므로, 같은 revision 을 이미 보냈는지만 본다. */
  isGuestPlayerReported(chartId: string, chartRevision: string): boolean {
    return (
      this.readRevisionMap(GUEST_PLAYER_REPORTS_KEY, 'guest player reports')[chartId] ===
      chartRevision
    );
  }

  saveGuestPlayerReport(chartId: string, chartRevision: string): void {
    const reports = this.readRevisionMap(GUEST_PLAYER_REPORTS_KEY, 'guest player reports');
    reports[chartId] = chartRevision;
    this.storage.setItem(GUEST_PLAYER_REPORTS_KEY, JSON.stringify(reports));
  }

  private readRevisionNotices(): Record<string, string> {
    return this.readRevisionMap(REVISION_NOTICES_KEY, 'revision notices');
  }

  private readRevisionMap(key: string, label: string): Record<string, string> {
    const revisions: Record<string, string> = {};
    const saved = this.readObject(key, label, 'ignoring them');
    for (const [chartId, chartRevision] of Object.entries(saved ?? {})) {
      if (isString(chartRevision)) {
        revisions[chartId] = chartRevision;
      }
    }
    return revisions;
  }

  private readRecords(): Record<string, ChartRecord> {
    const records: Record<string, ChartRecord> = {};
    const saved = this.readObject(RECORDS_KEY, 'records', 'ignoring them');
    if (saved === undefined) {
      return records;
    }
    for (const [key, value] of Object.entries(saved)) {
      const record = parseChartRecord(value);
      if (record !== undefined) {
        records[key] = record;
      }
    }
    return records;
  }

  private readObject(
    key: string,
    label: string,
    fallback: string,
  ): Record<string, unknown> | undefined {
    const raw = this.storage.getItem(key);
    if (raw === null) {
      return undefined;
    }
    const parsed = parseJson(raw);
    if (parsed === undefined) {
      console.warn(`Saved ${label} are not valid JSON; ${fallback}`);
      return undefined;
    }
    if (!isRecord(parsed)) {
      console.warn(`Saved ${label} are not an object; ${fallback}`);
      return undefined;
    }
    return parsed;
  }
}
