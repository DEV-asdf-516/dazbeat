/// <reference path="../pb_data/types.d.ts" />
// 플레이 라우트가 /play-sessions 에서 /play 로 옮겨져, 걸어 둔 한도를 그대로 새 경로 라벨로 옮긴다.
const LABEL_RENAMES = [
  ['POST /api/dazbeat/play-sessions', 'POST /api/dazbeat/play'],
  ['POST /api/dazbeat/play-sessions/', 'POST /api/dazbeat/play/'],
];

// 저장된 규칙을 일반 객체로 복사해 목록 전체를 다시 unmarshal 할 수 있게 한다.
function readRules(settings) {
  return settings.rateLimits.rules.map((rule) => ({
    label: String(rule.label),
    audience: String(rule.audience),
    maxRequests: rule.maxRequests,
    duration: rule.duration,
  }));
}

function renameLabels(app, renames) {
  const settings = app.settings();
  const labels = new Map(renames);
  const rules = readRules(settings).map((rule) => ({
    ...rule,
    label: labels.get(rule.label) ?? rule.label,
  }));
  unmarshal({ rateLimits: { rules } }, settings);
  app.save(settings);
}

migrate(
  (app) => renameLabels(app, LABEL_RENAMES),
  (app) =>
    renameLabels(
      app,
      LABEL_RENAMES.map(([from, to]) => [to, from]),
    ),
);
