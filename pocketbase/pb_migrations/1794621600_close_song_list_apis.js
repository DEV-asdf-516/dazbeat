/// <reference path="../pb_data/types.d.ts" />
// 곡 목록은 검색 라우트로만 연다. 기본 API 는 아무 필터·정렬·expand 를 받아 인덱스 없는 조회나 채보 data 전체 읽기를
// 누구나 시킬 수 있다. 에디터는 새 채보를 저장할 때 곡 키로 곡 레코드를 찾으려고 곡 목록을 쓰고, 게임은 채보 단건을 받는다.
const EDITOR_RULE = '@request.auth.id != "" && @request.auth.isEditor = true';
const RULES = [
  {
    collection: 'songs',
    field: 'listRule',
    before: `isPublished = true || (${EDITOR_RULE})`,
    after: EDITOR_RULE,
  },
  {
    collection: 'songs',
    field: 'viewRule',
    before: `isPublished = true || (${EDITOR_RULE})`,
    after: null,
  },
  {
    collection: 'charts',
    field: 'listRule',
    before: `song.isPublished = true || (${EDITOR_RULE})`,
    after: null,
  },
];

// JSVM 은 null 이 아닌 규칙을 JS 문자열이 아니라 문자열 래퍼 객체로 넘긴다.
function readRule(rule) {
  return rule === null ? null : String(rule);
}

// 규칙을 추측해 고치면 관리자 전용 규칙이 열리거나 공개 규칙이 될 수 있어, 모두 예상한 규칙일 때만 바꾼다.
function replaceRules(app, from, to) {
  const collections = new Map();
  RULES.forEach((rule) => {
    const collection =
      collections.get(rule.collection) ?? app.findCollectionByNameOrId(rule.collection);
    const current = readRule(collection[rule.field]);
    if (current !== rule[from]) {
      throw new Error(`Cannot replace the ${rule.collection} ${rule.field}: ${current}`);
    }
    collection[rule.field] = rule[to];
    collections.set(rule.collection, collection);
  });
  collections.forEach((collection) => app.save(collection));
}

migrate(
  (app) => {
    replaceRules(app, 'before', 'after');
  },
  (app) => {
    replaceRules(app, 'after', 'before');
  },
);
