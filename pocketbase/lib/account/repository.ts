import { DELETED_ACCOUNT_IDENTITIES, EXTERNAL_AUTHS, USERS } from '../../../src/pbCollections.js';
import { where } from '../../../src/pbQuery.js';
import { column } from '../../../src/pbSql.js';
import { selectRow, selectRows } from '../jsvm.js';
import type { DbApp, JsvmApp, JsvmRecord, JsvmRuntime } from '../jsvm.js';

type QueryRuntime = Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>;

export function hasUnknownKeyRows(
  runtime: QueryRuntime,
  app: DbApp,
  keyIds: readonly string[],
): boolean {
  const keyId = column(DELETED_ACCOUNT_IDENTITIES, 'keyId');
  // NOT IN 이나 OR 로 묶은 구간은 통계가 낡으면 인덱스 전체를 훑는다. PocketBase 의 PRAGMA optimize 는
  // 그 연결에서 조회한 테이블만 다시 분석해 이 테이블 통계가 갱신된다고 볼 수 없으므로, 빈 구간마다 인덱스 범위로 찾는다.
  // 키 id 는 hex 라 JS 정렬과 SQLite BINARY 정렬이 같다.
  const sorted = [...keyIds].sort();
  const params = Object.fromEntries(sorted.map((id, index) => [`key${index}`, id]));
  const gaps = [
    `${keyId} < {:key0}`,
    ...sorted
      .slice(1)
      .map((_, index) => `${keyId} > {:key${index}} AND ${keyId} < {:key${index + 1}}`),
    `${keyId} > {:key${sorted.length - 1}}`,
  ];
  // dbx builder 는 UNION 앞에 LIMIT 을 붙여, 구간 전체에 거는 LIMIT 은 문장으로 쓴다.
  const sql = `${gaps
    .map((gap) => `SELECT ${keyId} FROM ${DELETED_ACCOUNT_IDENTITIES.name} WHERE ${gap}`)
    .join(' UNION ALL ')} LIMIT 1`;
  const rows = selectRows(runtime, { keyId: 'text' }, app.db().newQuery(sql).bind(params));
  return rows.length > 0;
}

export function isIdentityBlocked(
  runtime: QueryRuntime,
  app: DbApp,
  provider: string,
  digests: readonly string[],
): boolean {
  const { dbx } = runtime;
  const { total } = selectRow(
    runtime,
    { total: 'int' },
    app
      .db()
      .select('COUNT(*) AS total')
      .from(DELETED_ACCOUNT_IDENTITIES.name)
      .where(dbx.hashExp({ [column(DELETED_ACCOUNT_IDENTITIES, 'provider')]: provider }))
      .andWhere(dbx.in(column(DELETED_ACCOUNT_IDENTITIES, 'identityDigest'), ...digests)),
  );
  return total > 0;
}

export function readGoogleProviderId(
  runtime: QueryRuntime,
  app: JsvmApp,
  userId: string,
): string | undefined {
  const [link] = selectRows(
    runtime,
    { providerId: 'text' },
    app
      .db()
      .select(column(EXTERNAL_AUTHS, 'providerId'))
      .from(EXTERNAL_AUTHS.name)
      .where(
        runtime.dbx.hashExp({
          [column(EXTERNAL_AUTHS, 'collectionRef')]: app.findCachedCollectionByNameOrId(USERS.name)
            .id,
          [column(EXTERNAL_AUTHS, 'recordRef')]: userId,
          [column(EXTERNAL_AUTHS, 'provider')]: 'google',
        }),
      )
      .limit(1),
  );
  return link?.providerId;
}

export function findUserRecord(app: JsvmApp, userId: string): JsvmRecord | undefined {
  const userFilter = where(USERS, [{ id: userId }]);
  return app.findRecordsByFilter(USERS.name, userFilter.expression, '', 1, 0, userFilter.params)[0];
}

export function saveDeletedIdentity(
  runtime: Pick<JsvmRuntime, 'Record'>,
  app: JsvmApp,
  identity: { readonly provider: string; readonly identityDigest: string; readonly keyId: string },
): void {
  const record = new runtime.Record(
    app.findCachedCollectionByNameOrId(DELETED_ACCOUNT_IDENTITIES.name),
  );
  record.set('provider', identity.provider);
  record.set('identityDigest', identity.identityDigest);
  record.set('keyId', identity.keyId);
  app.save(record);
}

export function deleteUser(app: JsvmApp, user: JsvmRecord): void {
  app.delete(user);
}
