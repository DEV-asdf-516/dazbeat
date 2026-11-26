/// <reference path="../pb_data/types.d.ts" />
// 운영자가 대시보드에서 쓰는 공지. 플레이어는 게시한 공지만 목록으로 읽는다.
migrate(
  (app) => {
    const titleMaxLength = 60;
    const bodyMaxLength = 2000;
    const notices = new Collection({
      type: 'base',
      name: 'notices',
      listRule: 'isPublished = true',
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'titleKo', type: 'text', required: true, max: titleMaxLength },
        { name: 'titleEn', type: 'text', required: true, max: titleMaxLength },
        { name: 'titleJa', type: 'text', required: true, max: titleMaxLength },
        { name: 'bodyKo', type: 'text', required: true, max: bodyMaxLength },
        { name: 'bodyEn', type: 'text', required: true, max: bodyMaxLength },
        { name: 'bodyJa', type: 'text', required: true, max: bodyMaxLength },
        { name: 'isPublished', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_notices_published_created ON notices (isPublished, created)'],
    });
    app.save(notices);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('notices'));
  },
);
