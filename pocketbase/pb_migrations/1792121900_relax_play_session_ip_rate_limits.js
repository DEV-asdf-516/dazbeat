/// <reference path="../pb_data/types.d.ts" />
// 발급 라우트가 사용자별로도 제한하게 됐으므로 플레이 세션 IP 규칙을 완화한다. 반드시
// 1791532400_enable_dazbeat_rate_limits.js 와 같은 배포로 내보낸다. 대기 중인 마이그레이션은 파일
// 이름 순서로 돌므로, 이것만 먼저 적용되면 나중에 도는 1791532400 이 규칙을 10 으로 되돌린다.
const DAZBEAT_LABELS = ['POST /api/dazbeat/play-sessions', 'POST /api/dazbeat/play-sessions/'];
const RELAXED_MAX_REQUESTS = 30;
const PREVIOUS_MAX_REQUESTS = 10;
const DURATION_SECONDS = 60;

// 저장된 규칙을 일반 객체로 복사해 목록 전체를 다시 unmarshal 할 수 있게 한다.
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
