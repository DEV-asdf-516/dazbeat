/// <reference path="../pb_data/types.d.ts" />
// 내장 limiter 는 IP 기준이다. trusted proxy 헤더를 설정한 뒤에만 배포한다(client-ip 진단 라우트
// 참고). 그러지 않으면 프록시 뒤 모든 플레이어가 버킷 하나를 같이 쓴다.
const DAZBEAT_RATE_LIMIT_RULES = [
  { label: '*:auth', audience: '', maxRequests: 2, duration: 3 },
  { label: '*:create', audience: '', maxRequests: 20, duration: 5 },
  { label: '/api/batch', audience: '', maxRequests: 3, duration: 1 },
  { label: '/api/', audience: '', maxRequests: 300, duration: 10 },
  { label: 'POST /api/dazbeat/play-sessions', audience: '', maxRequests: 10, duration: 60 },
  { label: 'POST /api/dazbeat/play-sessions/', audience: '', maxRequests: 10, duration: 60 },
];
const DAZBEAT_LABELS = ['POST /api/dazbeat/play-sessions', 'POST /api/dazbeat/play-sessions/'];

// 저장된 규칙을 일반 객체로 복사해 목록 전체를 다시 unmarshal 할 수 있게 한다.
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
