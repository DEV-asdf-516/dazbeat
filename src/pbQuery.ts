// Where 의 필드 이름이 무엇이든(예: kind) 혼동되지 않도록 노드 종류는 모듈 밖에서 만들 수 없는 심볼 값으로 표시한다.
const COMPARISON = Symbol('comparison');

export type FilterValue = string | number | boolean;

export interface CollectionSpec<F extends string, N extends string = string> {
  readonly name: N;
  readonly fields: readonly F[];
}

export function collectionSpec<const N extends string, const F extends string>(
  name: N,
  fields: readonly F[],
): CollectionSpec<F, N> {
  return {
    name,
    fields,
  };
}

type Operator = '!=' | '~';

export interface Comparison {
  readonly kind: typeof COMPARISON;
  readonly operator: Operator;
  readonly value: FilterValue;
}

function comparison(operator: Operator, value: FilterValue): Comparison {
  return {
    kind: COMPARISON,
    operator,
    value,
  };
}

export function ne(value: FilterValue): Comparison {
  return comparison('!=', value);
}

export function like(value: FilterValue): Comparison {
  return comparison('~', value);
}

export type Where<F extends string> = { readonly [K in F]?: FilterValue | Comparison };

// 변수로 넘긴 Where 는 초과 속성 검사를 받지 못하므로 spec 밖 키를 never 로 막는다.
type CheckedCondition<F extends string, T> = T extends null
  ? T
  : T extends Where<F>
    ? T & { readonly [K in Exclude<keyof T, F>]: never }
    : never;

export interface CompiledFilter {
  readonly expression: string;
  readonly params: Readonly<Record<string, FilterValue>>;
}

export function where<F extends string, const C extends readonly [object, ...object[]]>(
  spec: CollectionSpec<F>,
  conditions: { [I in keyof C]: CheckedCondition<F, C[I]> },
): CompiledFilter;
export function where<F extends string, const C extends readonly (object | null)[]>(
  spec: CollectionSpec<F>,
  conditions: { [I in keyof C]: CheckedCondition<F, C[I]> },
): CompiledFilter | null;
export function where<F extends string>(
  _spec: CollectionSpec<F>,
  conditions: readonly (Where<F> | null)[],
): CompiledFilter | null {
  const params: Record<string, FilterValue> = {};
  let nextParam = 0;
  const bind = (value: FilterValue): string => {
    const name = `p${nextParam}`;
    nextParam += 1;
    params[name] = value;
    return `{:${name}}`;
  };
  const compileWhere = (group: Where<F>): string[] => {
    // exactOptionalPropertyTypes 라 값이 undefined 일 수 없지만 제네릭 키 순회는 undefined 를 섞어 준다.
    const parts = Object.entries<FilterValue | Comparison | undefined>(group).flatMap(
      ([field, value]) => {
        if (value === undefined) {
          return [];
        }
        return typeof value === 'object'
          ? [`${field} ${value.operator} ${bind(value.value)}`]
          : [`${field} = ${bind(value)}`];
      },
    );
    if (parts.length === 0) {
      throw new Error('Filter condition has no fields');
    }
    return parts;
  };
  const parts = conditions.flatMap((condition) =>
    condition === null ? [] : [compileWhere(condition).join(' && ')],
  );
  return parts.length === 0
    ? null
    : {
        expression: parts.join(' && '),
        params,
      };
}

export interface SortKey<F extends string> {
  readonly field: F;
  readonly direction: 'asc' | 'desc';
}

export function asc<const F extends string>(field: F): SortKey<F> {
  return {
    field,
    direction: 'asc',
  };
}

export function desc<const F extends string>(field: F): SortKey<F> {
  return {
    field,
    direction: 'desc',
  };
}

export interface Expansion<N extends string = string> {
  readonly name: N;
  readonly fields: readonly string[];
}

// PocketBase 는 역방향 관계를 `<컬렉션>_via_<관계 필드>` 로 expand 하므로 이름을 spec 에서 만들어 응답 파싱 키와 맞춘다.
export function backRelation<F extends string, N extends string, const R extends F>(
  spec: CollectionSpec<F, N>,
  field: R,
  fields: readonly NoInfer<F>[],
): Expansion<`${N}_via_${R}`> {
  return {
    name: `${spec.name}_via_${field}`,
    fields,
  };
}

export function relation<F extends string, const R extends F, T extends string>(
  _spec: CollectionSpec<F>,
  field: R,
  _target: CollectionSpec<T>,
  fields: readonly NoInfer<T>[],
): Expansion<R> {
  return {
    name: field,
    fields,
  };
}

export interface Selection {
  readonly fields: string;
  readonly expand?: string;
}

export function select<F extends string>(
  _spec: CollectionSpec<F>,
  fields: '*' | readonly NoInfer<F>[],
  expansions: readonly Expansion[] = [],
): Selection {
  if (fields.length === 0 || expansions.some((expansion) => expansion.fields.length === 0)) {
    throw new Error('Select has no fields');
  }
  const selected = [
    ...(fields === '*' ? [fields] : fields),
    ...expansions.flatMap(({ name, fields: expanded }) =>
      expanded.map((field) => `expand.${name}.${field}`),
    ),
  ].join(',');
  return expansions.length === 0
    ? { fields: selected }
    : {
        fields: selected,
        expand: expansions.map(({ name }) => name).join(','),
      };
}
