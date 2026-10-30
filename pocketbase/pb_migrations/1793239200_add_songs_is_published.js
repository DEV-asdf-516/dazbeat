/// <reference path="../pb_data/types.d.ts" />
// 새 곡은 비공개로 만들어져 플레이어에게 보이지 않는다. 에디터는 채보를 만들려고 비공개 곡과
// 그 채보를 보지만, 점수는 공개 곡 것만 보인다.
const EDITOR_RULE = '@request.auth.id != "" && @request.auth.isEditor = true';
const READ_RULES = {
  songs: {
    before: '',
    after: `isPublished = true || (${EDITOR_RULE})`,
  },
  charts: {
    before: '',
    after: `song.isPublished = true || (${EDITOR_RULE})`,
  },
  scores: {
    before: 'chartRevision = chart.revision',
    after: 'chartRevision = chart.revision && chart.song.isPublished = true',
  },
};

// JSVM 은 null 이 아닌 규칙을 JS 문자열이 아니라 문자열 래퍼 객체로 넘긴다.
function readRule(rule) {
  return rule === null ? null : String(rule);
}

// 규칙을 추측해 고치면 관리자 전용 규칙이 열리거나 공개 규칙이 될 수 있어, 세 컬렉션이 모두
// 예상한 규칙일 때만 바꾼다.
function findCollectionsWithRules(app, stage) {
  return Object.entries(READ_RULES).map(([name, rules]) => {
    const collection = app.findCollectionByNameOrId(name);
    const expected = rules[stage];
    const listRule = readRule(collection.listRule);
    const viewRule = readRule(collection.viewRule);
    if (listRule !== expected || viewRule !== expected) {
      throw new Error(`Cannot replace the ${name} read rules: list ${listRule}, view ${viewRule}`);
    }
    return collection;
  });
}

function saveRules(app, collections, stage) {
  collections.forEach((collection) => {
    const rule = READ_RULES[collection.name][stage];
    collection.listRule = rule;
    collection.viewRule = rule;
    app.save(collection);
  });
}

migrate(
  (app) => {
    const collections = findCollectionsWithRules(app, 'before');
    const songs = collections.find(({ name }) => name === 'songs');
    songs.fields.add(new BoolField({ name: 'isPublished' }));
    app.save(songs);

    // 레코드를 하나씩 저장하면 곡 저장 훅과 제목 검색 트리거가 곡마다 돈다.
    app.db().newQuery('UPDATE songs SET isPublished = TRUE').execute();
    saveRules(app, collections, 'after');
  },
  (app) => {
    saveRules(app, findCollectionsWithRules(app, 'after'), 'before');
    const songs = app.findCollectionByNameOrId('songs');
    songs.fields.removeByName('isPublished');
    app.save(songs);
  },
);
