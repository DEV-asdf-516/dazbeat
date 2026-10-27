/// <reference path="../pb_data/types.d.ts" />
// The Google OAuth2 client lives only in the database, so a fresh local data folder does not have
// it. A migration would run once, possibly before the variables are set, so this runs on every
// start instead. Without the variables (PocketHost) the dashboard configuration is left alone.
onBootstrap((e) => {
  e.next();
  const clientId = $os.getenv('DAZBEAT_GOOGLE_CLIENT_ID');
  const clientSecret = $os.getenv('DAZBEAT_GOOGLE_CLIENT_SECRET');
  if (clientId === '' || clientSecret === '') {
    return;
  }
  const users = e.app.findCollectionByNameOrId('users');
  const current = users.oauth2.providers.find((provider) => provider.name === 'google');
  if (
    current !== undefined &&
    current.clientId === clientId &&
    current.clientSecret === clientSecret
  ) {
    return;
  }
  // DAZBEAT signs in with Google only, so the provider list is this one entry.
  unmarshal({ oauth2: { providers: [{ name: 'google', clientId, clientSecret }] } }, users);
  e.app.save(users);
});
