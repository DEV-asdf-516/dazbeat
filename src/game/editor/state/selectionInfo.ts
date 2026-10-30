import type { Note } from '../../../rhythm/types.js';
import { msToSec } from '../../../time.js';

export function formatEditorTime(timeMs: number): string {
  const sign = timeMs < 0 ? '-' : '';
  const absMs = Math.abs(timeMs);
  const minutes = Math.floor(absMs / 60_000);
  const seconds = Math.floor(msToSec(absMs % 60_000));
  const millis = absMs % 1000;
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export interface SelectionRow {
  readonly label: 'TYPE' | 'LANE' | 'TIME';
  readonly value: string;
}

const NO_VALUE = '—';

export function describeSelection(
  note: Note | null,
): readonly [SelectionRow, SelectionRow, SelectionRow] {
  if (note === null) {
    return [
      {
        label: 'TYPE',
        value: NO_VALUE,
      },
      {
        label: 'LANE',
        value: NO_VALUE,
      },
      {
        label: 'TIME',
        value: NO_VALUE,
      },
    ];
  }
  const startText = formatEditorTime(note.timeMs);
  return [
    {
      label: 'TYPE',
      value: note.type === 'tap' ? 'TAP' : 'HOLD',
    },
    {
      label: 'LANE',
      value: String(note.lane),
    },
    {
      label: 'TIME',
      value: note.type === 'tap' ? startText : `${startText}–${formatEditorTime(note.endTimeMs)}`,
    },
  ];
}
