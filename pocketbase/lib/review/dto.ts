import { HTTP_STATUS } from '../../../src/httpStatus.js';
import { isShallowEqual } from '../../../src/shallowEqual.js';
import { isOneOf } from '../../../src/typeGuards.js';

export const REVIEW_STATUSES = ['approved', 'pending', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const REVIEW_DECISIONS = ['approved', 'rejected'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
const isReviewDecision = isOneOf(REVIEW_DECISIONS);

type ModerationRejectionCode = 'invalid_review_status' | 'invalid_review_note' | 'already_reviewed';

export const MODERATION_REJECTIONS: Record<
  ModerationRejectionCode,
  { status: number; field: 'reviewStatus' | 'reviewNote'; message: string }
> = {
  invalid_review_status: {
    status: HTTP_STATUS.badRequest,
    field: 'reviewStatus',
    message: 'reviewStatus can only change from pending to approved or rejected.',
  },
  invalid_review_note: {
    status: HTTP_STATUS.badRequest,
    field: 'reviewNote',
    message: 'reviewNote is required to reject and must be up to 500 characters.',
  },
  already_reviewed: {
    status: HTTP_STATUS.conflict,
    field: 'reviewStatus',
    message: 'The play has already been reviewed.',
  },
};

export class InvalidModerationRequestError extends Error {
  override readonly name = 'InvalidModerationRequestError';

  constructor(readonly code: ModerationRejectionCode) {
    super(MODERATION_REJECTIONS[code].message);
  }
}

export const REVIEW_NOTE_MAX_LENGTH = 500;

interface ReviewFields {
  readonly reviewStatus: string;
  readonly reviewNote: string;
}

/** 검토 필드를 건드리지 않은 수정은 undefined 로 그대로 저장한다. */
export function parseReviewUpdate(
  before: ReviewFields,
  after: ReviewFields,
): { readonly decision: ReviewDecision; readonly note: string } | undefined {
  if (isShallowEqual(before, after)) {
    return undefined;
  }
  const { reviewStatus, reviewNote } = after;
  if (!isReviewDecision(reviewStatus)) {
    throw new InvalidModerationRequestError('invalid_review_status');
  }
  const note = reviewNote.trim();
  if (note.length > REVIEW_NOTE_MAX_LENGTH || (reviewStatus === 'rejected' && note === '')) {
    throw new InvalidModerationRequestError('invalid_review_note');
  }
  return {
    decision: reviewStatus,
    note,
  };
}
