/// <reference path="../pb_data/types.d.ts" />
// The built-in limiter is IP based. Deploy this only after the trusted proxy header is configured
// (see the client-ip diagnostics route), otherwise every player behind the proxy shares one bucket.
const DAZBEAT_RATE_LIMIT_RULES = [
  { label: '*:auth', audience: '', maxRequests: 2, duration: 3 },
  { label: '*:create', audience: '', maxRequests: 20, duration: 5 },
  { label: '/api/batch', audience: '', maxRequests: 3, duration: 1 },
  { label: '/api/', audience: '', maxRequests: 300, duration: 10 },
  { label: 'POST /api/dazbeat/play-sessions', audience: '', maxRequests: 10, duration: 60 },
  { label: 'POST /api/dazbeat/play-sessions/', audience: '', maxRequests: 10, duration: 60 },
];
const DAZBEAT_LABELS = ['POST /api/dazbeat/play-sessions', 'POST /api/dazbeat/play-sessions/'];

// Copies the stored rules into plain objects so they can be unmarshaled back as a whole list.
function readRules(settings) {
  return settings.rateLimits.rules.map((rule) => ({
    label: String(rule.label),
    audience: String(rule.audience),
    maxRequests: rule.maxRequests,
    duration: rule.duration,
  }));
}

migrate(
  (app) => {
    const settings = app.settings();
    const labels = DAZBEAT_RATE_LIMIT_RULES.map((rule) => rule.label);
    const kept = readRules(settings).filter((rule) => !labels.includes(rule.label));
    unmarshal(
      { rateLimits: { enabled: true, rules: [...kept, ...DAZBEAT_RATE_LIMIT_RULES] } },
      settings,
    );
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    const kept = readRules(settings).filter((rule) => !DAZBEAT_LABELS.includes(rule.label));
    unmarshal({ rateLimits: { enabled: false, rules: kept } }, settings);
    app.save(settings);
  },
);
