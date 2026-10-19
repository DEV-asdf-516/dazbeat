import { describe, expect, it } from 'vitest';
import {
  decideSessionIssue,
  SESSION_ISSUE_LIMIT,
  SESSION_ISSUE_WINDOW_MS,
  type SessionQuota,
} from '../../pocketbase/verification/sessionQuota.js';

const START_MS = 1_800_000_000_000;

function quotaOf(issuedCount: number): SessionQuota {
  return {
    windowStartedAtMs: START_MS,
    issuedCount,
  };
}

describe('decideSessionIssue', () => {
  it('opens a new window for a user without a quota row', () => {
    expect(decideSessionIssue(null, START_MS)).toEqual({
      kind: 'allowed',
      quota: {
        windowStartedAtMs: START_MS,
        issuedCount: 1,
      },
    });
  });

  it.each([
    [1, 2],
    [19, 20],
  ])('counts issue %i up to %i inside the active window', (issuedCount, nextCount) => {
    expect(decideSessionIssue(quotaOf(issuedCount), START_MS + 30_000)).toEqual({
      kind: 'allowed',
      quota: {
        windowStartedAtMs: START_MS,
        issuedCount: nextCount,
      },
    });
  });

  it('limits the issue after the limit inside the active window', () => {
    expect(decideSessionIssue(quotaOf(SESSION_ISSUE_LIMIT), START_MS + 30_000)).toEqual({
      kind: 'limited',
      retryAfterSeconds: 30,
    });
  });

  it('still limits on the last millisecond of the window', () => {
    expect(
      decideSessionIssue(quotaOf(SESSION_ISSUE_LIMIT), START_MS + SESSION_ISSUE_WINDOW_MS - 1),
    ).toEqual({
      kind: 'limited',
      retryAfterSeconds: 1,
    });
  });

  it.each([
    ['when the window has passed', START_MS + SESSION_ISSUE_WINDOW_MS],
    ['when the window starts in the future', START_MS - 1],
  ])('opens a new window %s', (_case, nowMs) => {
    expect(decideSessionIssue(quotaOf(SESSION_ISSUE_LIMIT), nowMs)).toEqual({
      kind: 'allowed',
      quota: {
        windowStartedAtMs: nowMs,
        issuedCount: 1,
      },
    });
  });

  it.each([
    [1, 1],
    [1_000, 1],
    [1_001, 2],
    [SESSION_ISSUE_WINDOW_MS, 60],
  ])('rounds %i ms left up to %i seconds', (remainingMs, retryAfterSeconds) => {
    const nowMs = START_MS + SESSION_ISSUE_WINDOW_MS - remainingMs;
    expect(decideSessionIssue(quotaOf(SESSION_ISSUE_LIMIT), nowMs)).toEqual({
      kind: 'limited',
      retryAfterSeconds,
    });
  });

  it('does not change the given quota', () => {
    const quota = quotaOf(5);
    decideSessionIssue(quota, START_MS + 1_000);
    decideSessionIssue(quota, START_MS + SESSION_ISSUE_WINDOW_MS);
    expect(quota).toEqual(quotaOf(5));
  });
});
