import { requireDefined } from '../../src/invariant.js';
import type { FilterValue } from '../../src/pbQuery.js';

// PocketBase JSVM(goja)이 훅에 넘기는 Go 객체 중 서버 로직이 쓰는 부분만 적은 타입이다.

export type QueryParams = Readonly<Record<string, FilterValue>>;

export interface JsvmCollection {
  readonly id: string;
  readonly listRule: string | null;
  readonly viewRule: string | null;
}

export interface JsvmRecord {
  readonly id: string;
  getString(field: string): string;
  getInt(field: string): number;
  getFloat(field: string): number;
  getDateTime(field: string): { time(): { unixMilli(): number } };
  set(field: string, value: unknown): void;
}

export interface JsvmRuntime {
  readonly Record: new (collection: JsvmCollection) => JsvmRecord;
  readonly DynamicModel: new <T extends object>(shape: T) => T;
  readonly arrayOf: <T>(model: T) => T[];
  readonly dbx: Dbx;
}

/** `$dbx` 가 만드는 SQL 식. 훅 밖에서는 만들 수 없어 runtime 으로 받는다. */
export interface DbxExpression {
  readonly __dbxExpression: never;
}

export interface Dbx {
  exp(sql: string, params?: QueryParams): DbxExpression;
  hashExp(values: QueryParams): DbxExpression;
  not(expression: DbxExpression): DbxExpression;
  in(column: string, ...values: string[]): DbxExpression;
}

export interface SelectQuery {
  from(...tables: string[]): SelectQuery;
  distinct(isDistinct: boolean): SelectQuery;
  innerJoin(table: string, on: DbxExpression): SelectQuery;
  leftJoin(table: string, on: DbxExpression): SelectQuery;
  where(condition: DbxExpression): SelectQuery;
  andWhere(condition: DbxExpression): SelectQuery;
  orderBy(...columns: string[]): SelectQuery;
  limit(count: number): SelectQuery;
  one(row: object): void;
  all(rows: object[]): void;
}

export interface DbApp {
  db(): {
    select(...columns: string[]): SelectQuery;
    delete(table: string, where: DbxExpression): { execute(): void };
  };
}

export interface JsvmApp extends DbApp {
  findCachedCollectionByNameOrId(nameOrId: string): JsvmCollection;
  findRecordsByFilter(
    collection: string,
    filter: string,
    sort: string,
    limit: number,
    offset: number,
    params: QueryParams,
  ): JsvmRecord[];
  save(record: JsvmRecord): void;
}

export interface QueryBuilderApp extends DbApp {
  recordQuery(collection: JsvmCollection): { select(...columns: string[]): SelectQuery };
  findCachedCollectionByNameOrId(nameOrId: string): JsvmCollection;
}

export interface TransactionalApp extends JsvmApp {
  runInTransaction(run: (tx: JsvmApp) => void): void;
}

// DynamicModel 은 초기값으로 열 타입을 정한다. 실수는 -0 이어야 정수로 잡히지 않는다.
// 날짜는 텍스트로 읽은 뒤 ms 로 바꾼다.
const COLUMN_INITIAL_VALUES = {
  text: '',
  int: 0,
  float: -0,
  bool: false,
  date: '',
} as const;

export type ColumnType = keyof typeof COLUMN_INITIAL_VALUES;
type Columns = Readonly<Record<string, ColumnType>>;
interface ColumnValues {
  text: string;
  int: number;
  float: number;
  bool: boolean;
  date: number;
}
export type RowOf<C extends Columns> = {
  -readonly [K in keyof C]: ColumnValues[C[K]];
};

function shapeOf(columns: Columns): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(columns).map(([name, type]) => [name, COLUMN_INITIAL_VALUES[type]]),
  );
}

function rowOf<C extends Columns>(columns: C, model: Record<string, unknown>): RowOf<C> {
  // Object.fromEntries 는 키별 타입을 잃으므로, 열 타입대로 읽은 결과를 RowOf 로 돌려준다.
  return Object.fromEntries(
    Object.entries(columns).map(([name, type]) => {
      const value = model[name];
      if (type !== 'date') {
        return [name, value];
      }
      // PocketBase 는 날짜를 "YYYY-MM-DD HH:MM:SS.sssZ" 로 저장해, ISO 형식으로 바꿔야 Date.parse 가 읽는다.
      const valueMs = Date.parse(String(value).replace(' ', 'T'));
      if (Number.isNaN(valueMs)) {
        throw new Error(`Invalid date column ${name}: ${String(value)}`);
      }
      return [name, valueMs];
    }),
  ) as RowOf<C>;
}

export function selectRows<const C extends Columns>(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf'>,
  columns: C,
  query: SelectQuery,
): RowOf<C>[] {
  const rows = runtime.arrayOf(new runtime.DynamicModel(shapeOf(columns)));
  query.all(rows);
  return rows.map((row) => rowOf(columns, row));
}

// 행이 없으면 PocketBase 가 throw 하므로 반드시 한 행이 나오는 쿼리에만 쓴다.
export function selectRow<const C extends Columns>(
  runtime: Pick<JsvmRuntime, 'DynamicModel'>,
  columns: C,
  query: SelectQuery,
): RowOf<C> {
  const row = new runtime.DynamicModel(shapeOf(columns));
  query.one(row);
  return rowOf(columns, row);
}

// select 필드 값은 스키마가 보장하므로, 벗어나면 개발 오류다.
export function parseOneOf<T>(values: readonly T[], message: string, value: unknown): T {
  return requireDefined(
    values.find((candidate) => candidate === value),
    message,
    String(value),
  );
}
