/// <reference path="../pb_data/types.d.ts" />
// Raises the play session IP rules now that the issue route also limits each user. Ship this in the
// same deploy as 1791532400_enable_dazbeat_rate_limits.js: pending migrations run in file name
// order, so if this one is applied alone first, a later 1791532400 sets the rules back to 10.
const DAZBEAT_LABELS = ['POST /api/dazbeat/play-sessions', 'POST /api/dazbeat/play-sessions/'];
const RELAXED_MAX_REQUESTS = 30;
const PREVIOUS_MAX_REQUESTS = 10;
const DURATION_SECONDS = 60;

// Copies the stored rules into plain objects so they can be unmarshaled back as a whole list.
function readRules(settings) {
  return settings.rateLimits.rules.map((rule) => ({
    label: String(rule.label),
    audience: String(rule.audience),
    maxRequests: rule.maxRequests,
    duration: rule.duration,
  }));
}

function replaceDazbeatRules(app, maxRequests) {
  const settings = app.settings();
  const kept = readRules(settings).filter((rule) => !DAZBEAT_LABELS.includes(rule.label));
  const rules = DAZBEAT_LABELS.map((label) => ({
    label,
    audience: '',
    maxRequests,
    duration: DURATION_SECONDS,
  }));
  unmarshal({ rateLimits: { rules: [...kept, ...rules] } }, settings);
  app.save(settings);
}

migrate(
  (app) => replaceDazbeatRules(app, RELAXED_MAX_REQUESTS),
  (app) => replaceDazbeatRules(app, PREVIOUS_MAX_REQUESTS),
);
