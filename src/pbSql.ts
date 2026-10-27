import type { CollectionSpec, CompiledFilter, FilterValue } from './pbQuery.js';

// raw SQL 조각. pbQuery 의 필터 문법(&&, ~)은 SQL 이 아니고 조인하면 열 이름이 겹치므로, 테이블 이름을 붙인 SQL 을 따로 만든다.
export function column<F extends string>(spec: CollectionSpec<F>, field: NoInfer<F>): string {
  return `${spec.name}.${field}`;
}

export function columnAs<F extends string>(
  spec: CollectionSpec<F>,
  field: NoInfer<F>,
  alias: string,
): string {
  return `${column(spec, field)} AS ${alias}`;
}

export function columns<F extends string>(
  spec: CollectionSpec<F>,
  fields: readonly NoInfer<F>[],
): string {
  return fields.map((field) => column(spec, field)).join(', ');
}

export function join<F extends string, G extends string>(
  kind: 'JOIN' | 'LEFT JOIN',
  spec: CollectionSpec<F>,
  field: NoInfer<F>,
  onSpec: CollectionSpec<G>,
  onField: NoInfer<G>,
): string {
  return `${kind} ${spec.name} ON ${column(spec, field)} = ${column(onSpec, onField)}`;
}

// 필드 이름이 무엇이든 값과 혼동되지 않도록 비교는 모듈 밖에서 만들 수 없는 심볼로 표시한다.
const SQL_COMPARISON = Symbol('sqlComparison');

// 같은 필드의 값이 여럿이면 suffix 로 파라미터 이름을 나눈다.
type BindValue = (value: FilterValue, suffix?: string) => string;

export interface SqlComparison {
  readonly kind: typeof SQL_COMPARISON;
  readonly toSql: (column: string, bind: BindValue) => string;
}

function comparison(toSql: SqlComparison['toSql']): SqlComparison {
  return {
    kind: SQL_COMPARISON,
    toSql,
  };
}

export function notEqualTo(value: FilterValue): SqlComparison {
  return comparison((column, bind) => `${column} != ${bind(value)}`);
}

export function lessThan(value: FilterValue): SqlComparison {
  return comparison((column, bind) => `${column} < ${bind(value)}`);
}

export function greaterThan(value: FilterValue): SqlComparison {
  return comparison((column, bind) => `${column} > ${bind(value)}`);
}

/** 패턴의 %·_·\ 이스케이프는 호출부가 하고, 조건에는 ESCAPE '\' 가 붙는다. */
export function likePattern(pattern: string): SqlComparison {
  return comparison((column, bind) => `${column} LIKE ${bind(pattern)} ESCAPE '\\'`);
}

export function oneOf(values: readonly FilterValue[]): SqlComparison {
  if (values.length === 0) {
    throw new Error('SQL IN condition has no values');
  }
  return comparison(
    (column, bind) =>
      `${column} IN (${values.map((value, index) => bind(value, `_${index}`)).join(', ')})`,
  );
}

type SqlValue = FilterValue | SqlComparison;

export function condition<F extends string, const W extends Readonly<Record<string, SqlValue>>>(
  spec: CollectionSpec<F>,
  values: W & { readonly [K in Exclude<keyof W, F>]: never },
): CompiledFilter {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    throw new Error('SQL condition has no fields');
  }
  const params: Record<string, FilterValue> = {};
  const parts = entries.map(([field, value]) => {
    const bind: BindValue = (item, suffix = '') => {
      const name = `${spec.name}_${field}${suffix}`;
      params[name] = item;
      return `{:${name}}`;
    };
    const qualified = `${spec.name}.${field}`;
    return typeof value === 'object'
      ? value.toSql(qualified, bind)
      : `${qualified} = ${bind(value)}`;
  });
  return {
    expression: parts.join(' AND '),
    params,
  };
}
