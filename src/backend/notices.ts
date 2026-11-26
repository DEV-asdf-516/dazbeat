import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import type { Notice } from '../data/notices.js';
import { NOTICES } from '../pbCollections.js';
import { desc, select, sortBy } from '../pbQuery.js';
import { isString } from '../typeGuards.js';
import { readRecordField } from './recordField.js';

const NOTICE_LIMIT = 10;

export async function loadNotices(pb: PocketBase): Promise<readonly Notice[]> {
  const { items: records } = await pb.collection(NOTICES.name).getList(1, NOTICE_LIMIT, {
    ...select(NOTICES, [
      'id',
      'created',
      'titleKo',
      'titleEn',
      'titleJa',
      'bodyKo',
      'bodyEn',
      'bodyJa',
    ]),
    sort: sortBy(NOTICES, [desc('created')]),
    skipTotal: true,
  });
  const notices: Notice[] = [];
  for (const record of records) {
    try {
      notices.push(parseNoticeRecord(record));
    } catch (error) {
      console.warn('Skipping invalid notice', record.id, error);
    }
  }
  return notices;
}

function parseNoticeRecord(record: RecordModel): Notice {
  const field = (name: string): string => readRecordField(record, NOTICES.name, name, isString);
  // PocketBase 는 날짜와 시각 사이를 공백으로 보내는데, 이 형식의 Date 해석은 브라우저마다 다르다.
  const createdAtMs = Date.parse(field('created').replace(' ', 'T'));
  if (Number.isNaN(createdAtMs)) {
    throw new Error(`Invalid ${NOTICES.name} record ${record.id}: created`);
  }
  return {
    id: field('id'),
    createdAtMs,
    title: {
      ko: field('titleKo'),
      ja: field('titleJa'),
      en: field('titleEn'),
    },
    body: {
      ko: field('bodyKo'),
      ja: field('bodyJa'),
      en: field('bodyEn'),
    },
  };
}
