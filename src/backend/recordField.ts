import type { RecordModel } from 'pocketbase';

export function readRecordField<T>(
  record: RecordModel,
  collection: string,
  field: string,
  guard: (value: unknown) => value is T,
): T {
  const value: unknown = record[field];
  if (!guard(value)) {
    throw new Error(`Invalid ${collection} record ${record.id}: ${field}`);
  }
  return value;
}
