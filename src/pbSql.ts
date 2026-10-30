import type { CollectionSpec } from './pbQuery.js';

// dbx 쿼리에 넣는 SQL 조각. pbQuery 의 필터 문법(&&, ~)은 SQL 이 아니고 조인하면 열 이름이 겹치므로, 테이블 이름을 붙인 열을 따로 만든다.
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
): string[] {
  return fields.map((field) => column(spec, field));
}
