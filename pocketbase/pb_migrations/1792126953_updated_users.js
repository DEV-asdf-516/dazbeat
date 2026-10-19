/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('_pb_users_auth_');

    collection.fields.addAt(
      4,
      new Field({
        help: '',
        hidden: true,
        id: 'bool1547992806',
        name: 'emailVisibility',
        presentable: false,
        required: false,
        system: true,
        type: 'bool',
      }),
    );

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('_pb_users_auth_');

    collection.fields.addAt(
      4,
      new Field({
        help: '',
        hidden: false,
        id: 'bool1547992806',
        name: 'emailVisibility',
        presentable: false,
        required: false,
        system: true,
        type: 'bool',
      }),
    );

    return app.save(collection);
  },
);
