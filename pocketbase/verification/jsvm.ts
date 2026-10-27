import type { CompiledFilter, FilterValue } from '../../src/pbQuery.js';

// PocketBase JSVM(goja)이 훅에 넘기는 Go 객체 중 서버 로직이 쓰는 부분만 적은 타입이다.

export type QueryParams = Readonly<Record<string, FilterValue>>;

export interface JsvmCollection {
  readonly id: string;
}

export interface JsvmRecord {
  readonly id: string;
  getString(field: string): string;
  getDateTime(field: string): { time(): { unixMilli(): number } };
  set(field: string, value: unknown): void;
}

export interface JsvmRuntime {
  readonly Record: new (collection: JsvmCollection) => JsvmRecord;
  readonly DynamicModel: new <T extends object>(shape: T) => T;
  readonly arrayOf: <T>(model: T) => T[];
}

export interface SqlApp<R> {
  db(): {
    newQuery(sql: string): {
      bind(params: QueryParams): R;
    };
  };
}

export interface JsvmApp extends SqlApp<{ one(row: object): void; all(rows: object[]): void }> {
  findCachedCollectionByNameOrId(nameOrId: string): JsvmCollection;
  save(record: JsvmRecord): void;
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

export function queryRows<const C extends Columns>(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf'>,
  app: SqlApp<{ all(rows: object[]): void }>,
  columns: C,
  sql: string,
  params: QueryParams = {},
): RowOf<C>[] {
  const rows = runtime.arrayOf(new runtime.DynamicModel(shapeOf(columns)));
  app.db().newQuery(sql).bind(params).all(rows);
  return rows.map((row) => rowOf(columns, row));
}

// 행이 없으면 PocketBase 가 throw 하므로 반드시 한 행이 나오는 SQL 에만 쓴다.
export function queryRow<const C extends Columns>(
  runtime: Pick<JsvmRuntime, 'DynamicModel'>,
  app: SqlApp<{ one(row: object): void }>,
  columns: C,
  sql: string,
  params: QueryParams = {},
): RowOf<C> {
  const row = new runtime.DynamicModel(shapeOf(columns));
  app.db().newQuery(sql).bind(params).one(row);
  return rowOf(columns, row);
}

/**
 * 조건에 맞는 행을 SQL 로 지운다. 레코드 훅·relation cascade·realtime 이벤트를 거치지 않으므로
 * 훅이 없고 다른 컬렉션이 relation 으로 가리키지 않는 서버 전용 컬렉션에만 쓴다. 계정 같은 레코드는 `app.delete` 로 지운다.
 */
export function deleteRows(
  app: SqlApp<{ execute(): void }>,
  table: { readonly name: string },
  filter: CompiledFilter,
): void {
  app
    .db()
    .newQuery(`DELETE FROM ${table.name} WHERE ${filter.expression}`)
    .bind(filter.params)
    .execute();
}
