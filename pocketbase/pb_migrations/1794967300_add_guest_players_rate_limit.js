/// <reference path="../pb_data/types.d.ts" />
// 로그인 없이 받는 게스트 플레이어 라우트라 계정 대신 IP 로 막는다. 로그인했지만 세션 발급에 실패한 판도
// 이 라우트로 오므로 audience 는 비워 둔다.
const GUEST_PLAYERS_RULE = {
  label: 'POST /api/dazbeat/charts/',
  audience: '',
  maxRequests: 10,
  duration: 60,
};

// 저장된 규칙을 일반 객체로 복사해 목록 전체를 다시 unmarshal 할 수 있게 한다.
function readRules(settings) {
  return settings.rateLimits.rules.map((rule) => ({
    label: String(rule.label),
    audience: String(rule.audience),
    maxRequests: rule.maxRequests,
    duration: rule.duration,
  }));
}

function replaceGuestPlayersRules(app, added) {
  const settings = app.settings();
  const kept = readRules(settings).filter((rule) => rule.label !== GUEST_PLAYERS_RULE.label);
  unmarshal({ rateLimits: { rules: [...kept, ...added] } }, settings);
  app.save(settings);
}

migrate(
  (app) => replaceGuestPlayersRules(app, [GUEST_PLAYERS_RULE]),
  (app) => replaceGuestPlayersRules(app, []),
);
