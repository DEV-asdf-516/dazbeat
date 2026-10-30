/// <reference path="../pb_data/types.d.ts" />
// PocketHost 에서는 `serve --origins` 를 바꿀 수 없어, 교차 출처 브라우저 요청을 기본 CORS
// 미들웨어(priority -1041)가 허용 헤더를 붙이기 전에 여기서 거부한다.
routerUse(
  new Middleware(
    (e) => {
      const { decideOrigin, ORIGIN_REJECTIONS } = require(`${__hooks}/lib/originPolicy.cjs`);
      const decision = decideOrigin(
        e.request.header.get('Origin'),
        e.request.host,
        $os.getenv('DAZBEAT_ALLOWED_ORIGINS'),
      );
      if (decision.kind === 'allowed') {
        return e.next();
      }
      const { status, message } = ORIGIN_REJECTIONS[decision.code];
      return e.json(status, { status, code: decision.code, message });
    },
    -1100,
    'dazbeatOrigins',
  ),
);
