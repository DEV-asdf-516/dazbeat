# PocketBase 운영 문서

dazbeat 의 곡·채보·랭킹 데이터를 담는 PocketBase 의 개발 환경, 운영(PocketHost) 배포, 보안 설정, 백업·복구 절차를 정리한다. 이 문서의 운영 작업은 운영 계정을 가진 저장소 소유자가 직접 수행한다. 문서에는 비밀값(관리자 이메일·토큰·비밀번호·S3 키)을 적지 않으며, 예시의 `<...>` 는 실행할 때 실제 값으로 바꾼다.

## 운영 원본 정책

- 운영 데이터의 원본은 운영 PocketBase 다. Git 저장소나 로컬 시드 데이터가 원본이 아니다.
- 곡 메타데이터와 재킷은 PocketBase 관리 UI 에서 입력·수정한다.
- 채보는 권한형 에디터(`users.isEditor = true` 인 계정)로 저장한다. `charts.revision` 은 서버 hook 이 채보 내용으로 계산하므로 직접 넣지 않는다.
- 로컬 데이터로 운영 원본을 덮어쓰는 배포를 하지 않는다. `npm run seed` 는 로컬 루프백 PocketBase(`localhost`, `127.0.0.1`, `[::1]`) 전용이며 다른 대상은 네트워크 요청 전에 거절한다. 운영 PocketBase 를 Git·로컬 상태로 되돌리는 동기화 도구도 두지 않는다.

## 로컬 시드 데이터

### 형식

`npm run seed` 는 `pocketbase/seed/data/manifest.json` 과 그 안에서 가리키는 재킷·채보 파일을 읽는다. `pocketbase/seed/data/` 디렉터리 전체는 Git 무시 대상이라 저장소에 커밋되지 않는다. manifest 의 모든 경로는 이 디렉터리 기준 상대 경로이며, 디렉터리 밖(`..`, 절대 경로)을 가리키면 오류다.

```json
{
  "version": 1,
  "songs": [
    {
      "key": "example-song",
      "title": "Example Song",
      "category": "original",
      "youtubeVideoId": "xxxxxxxxxxx",
      "accentColor": 4773608,
      "constellation": "gemini",
      "gameStartMs": 0,
      "gameEndMs": 30000,
      "credit": ["Example credit line"],
      "jacket": "example-song/jacket.jpg",
      "charts": {
        "easy": "example-song/charts/easy.json",
        "expert": "example-song/charts/expert.json"
      }
    }
  ]
}
```

- `songs` 는 1개 이상이고 `key` 는 manifest 안에서 유일해야 한다. `category`·`constellation`·난이도는 게임의 도메인 값만 쓸 수 있고, 알 수 없는 필드가 있으면 오류다. `credit` 은 선택이다.
- 재킷 확장자는 `.jpg`/`.jpeg`/`.png`/`.webp` 만 허용한다.
- `charts` 에는 난이도 일부만 있어도 된다. 각 채보 파일은 게임의 채보 검증을 그 곡의 `key`·`gameStartMs`·`gameEndMs` 와 난이도로 통과해야 한다.
- 검증은 모두 첫 네트워크 요청 전에 끝난다. 실패하면 실패한 파일의 절대 경로와 manifest 안의 위치를 출력하고 아무것도 쓰지 않는다.

### 실행

1. `.env` 에 `VITE_POCKETBASE_URL`(예: `http://127.0.0.1:8090`), `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD` 를 넣는다(변수 설명은 `.env.example`).
2. 아래 "개발 Docker 실행" 으로 로컬 PocketBase 를 띄우고, 그 인스턴스에 superuser 를 만든다.
3. `npm run seed` 를 실행한다. `key` 로 곡을 찾아 없으면 재킷과 함께 만들고, 곡의 난이도별 채보가 없으면 만든다. 이미 있는 곡·채보는 갱신·삭제하지 않고 건너뛴다.

### 기존 실제 데이터의 Git 추적 정리

이전에는 실제 재킷·채보가 `pocketbase/seed/{sample,karma,lucy}/` 에 있었고 곡 메타데이터가 `pocketbase/seed/seed.ts` 의 `SEED_SONGS` 에 있었다. 피처 변경은 이 파일들을 지우거나 옮기지 않으므로, 원본 작업 트리에서 피처를 반영한 직후(커밋 전) 아래 순서로 정리한다.

1. 원본 작업 트리에서 `pocketbase/seed/{sample,karma,lucy}/` 아래에 재킷·채보 파일이 있는지 확인한다.
2. 그 디렉터리들을 `pocketbase/seed/data/` 아래로 옮긴다(삭제하지 않는다).
3. 이번 변경 전 커밋의 `pocketbase/seed/seed.ts` 에 있던 `SEED_SONGS` 값으로 `pocketbase/seed/data/manifest.json` 을 작성한다. 재킷·채보 경로는 옮긴 위치 기준 상대 경로로 적는다.
4. `git rm -r --cached pocketbase/seed/sample pocketbase/seed/karma pocketbase/seed/lucy` 로 옛 경로의 추적만 해제한다(로컬 파일은 남는다).
5. `git status` 로 실제 데이터 파일이 추적·스테이징 목록에 없는지, 그리고 `pocketbase/seed/data/` 아래에 로컬 파일이 남아 있는지 확인한다.
6. 로컬 PocketBase 에 `npm run seed` 를 실행해 manifest 가 검증을 통과하고 곡·채보가 만들어지는지 확인한다.

과거 커밋에는 실제 채보와 메타데이터가 그대로 남는다. 이력 재작성·강제 푸시는 하지 않는다. 저장소가 공개 저장소라면 과거 이력 처리가 필요한지 별도로 판단한다.

## 개발 Docker 실행

개발 Docker PocketBase 는 운영과 같은 `pb_migrations` 와 `pb_hooks` 를 쓴다.

1. `npm run build:hooks` 로 서버 검증 번들 `pocketbase/pb_hooks/lib/verifyPlay.cjs` 를 만든다. 이 파일은 빌드 산출물이라 Git 무시 대상이며, 없으면 플레이 세션 API 가 동작하지 않는다. `src/rhythm/`, `src/data/`, `pocketbase/verification/` 을 바꾼 뒤에도 다시 빌드한다.
2. `docker compose up --build` 로 PocketBase 를 띄운다. `127.0.0.1:8090` 에서만 열린다.
   - `./pocketbase/pb_migrations` → `/pb/pb_migrations`, `./pocketbase/pb_hooks` → `/pb/pb_hooks` 로 마운트된다.
   - `DAZBEAT_ALLOWED_ORIGINS` 는 Vite 개발 서버 Origin 인 `http://localhost:5173,http://127.0.0.1:5173` 이다.
3. hook 이나 번들을 바꾼 뒤에는 `docker compose restart pocketbase` 로 다시 읽게 한다.

통합 테스트(`npm run test:integration`)는 Docker 를 쓰지 않는다. `pocketbase/Dockerfile` 의 `PB_VERSION` 과 같은 버전의 PocketBase 바이너리를 내려받아 임시 데이터 디렉터리로 띄운다.

## PocketHost 배포

### 버전 확인

PocketHost 인스턴스의 PocketBase 버전은 `pocketbase/Dockerfile` 의 `PB_VERSION` 과 같은 minor(현재 0.40.x)여야 한다. 배포 전마다 PocketHost 대시보드에서 인스턴스 버전을 확인한다. 사용자 정의 바이너리나 별도 Node 프로세스는 전제로 하지 않는다.

### 절차

1. **빌드**: 배포할 커밋에서 `npm ci` 후 `npm run build:hooks` 를 실행해 `pocketbase/pb_hooks/lib/verifyPlay.cjs` 를 만든다.
2. **수동 백업**: 관리 UI Settings › Backups 에서 백업을 만들고 zip 을 내려받는다(아래 "백업·복구"). 마이그레이션·hook 배포 전에는 반드시 한다.
3. **SFTP 업로드**: PocketHost 의 SFTP 로 저장소의 `pocketbase/pb_migrations/` 와 `pocketbase/pb_hooks/`(빌드된 `lib/` 포함)를 인스턴스의 `pb_migrations/`, `pb_hooks/` 에 올린다. rate limit 마이그레이션(`1791532400_enable_dazbeat_rate_limits.js`)은 "클라이언트 IP 와 요청 제한" 의 순서를 따르므로 처음 배포할 때는 빼고 올린다.
4. **재시작**: PocketHost 대시보드에서 인스턴스를 재시작한다. 새 마이그레이션은 시작할 때 적용된다.
5. **점검**: 관리 UI Logs 에 hook 로드·마이그레이션 오류가 없는지 보고, 아래 "Origin 허용 목록과 CORS" 의 브라우저 점검과 GitHub Pages 에서의 로그인·곡 조회·랭킹 제출을 확인한다. 관리 UI 에서 `charts` 레코드의 `revision` 이 채워져 있는지도 본다.

## Origin 허용 목록과 CORS

### 동작

PocketHost 에서는 PocketBase 의 `serve --origins` 를 바꿀 수 없어 기본값 `*` 로 남는다. 대신 `pb_hooks/origins.pb.js` 의 전역 미들웨어가 PocketBase 기본 CORS 처리보다 먼저 Origin 을 검사한다. 이것이 PocketHost 에서 실제로 지원되는 동등 경로다.

- Origin 헤더 없음 → 통과(이 요청은 API Rules·인증·rate limit 이 보호한다).
- Origin 이 `DAZBEAT_ALLOWED_ORIGINS`(쉼표 구분, 정확 일치)에 있음 → 통과하고 PocketBase 기본 CORS 가 허용 헤더를 붙인다.
- Origin 이 요청한 PocketBase 자신의 호스트와 같음(관리 UI) → 통과.
- 그 밖의 Origin(`null` 포함) → preflight 와 실제 요청 모두 `403` `{"status":403,"code":"origin_not_allowed",...}`, CORS 허용 헤더 없음.
- 허용 목록이 비었거나 설정되지 않았으면 교차 Origin 요청을 모두 거절한다.

### Secret 설정

PocketHost 대시보드의 인스턴스 Secret 에 아래 값을 넣고 인스턴스를 재시작한다. 경로 `/dazbeat/` 는 Origin 에 들어가지 않는다. 운영에 `*` 를 넣지 않는다.

`DAZBEAT_ALLOWED_ORIGINS` 는 `.env` 에서 읽히지 않는 서버 전용 배포 변수라 `.env.example` 에 넣지 않는다. `.env.example` 은 클라이언트(Vite)·시드가 `.env` 에서 읽는 변수만 담고, 이 변수의 이름·값은 이 문서와 `docker-compose.yml`(로컬)에서만 관리한다.

```text
DAZBEAT_ALLOWED_ORIGINS=https://dev-asdf-516.github.io
```

### 브라우저 점검

1. 허용 Origin: `https://dev-asdf-516.github.io/dazbeat/` 를 열어 Google 로그인, 곡 목록 조회, 한 곡 완주 후 랭킹 제출이 되는지 확인한다. 개발자 도구 Network 에서 PocketBase 응답에 `Access-Control-Allow-Origin` 헤더가 있고, 제출 실패를 뜻하는 `console.warn` 이 없는지 본다.
2. 비허용 Origin: 다른 사이트(예: `https://example.com`) 탭의 개발자 도구 콘솔에서 `fetch('<인스턴스 URL>/api/collections/songs/records')` 를 실행해 CORS 오류로 실패하고, Network 에서 응답이 `403` 인지 확인한다.
3. 관리 UI(`<인스턴스 URL>/_/`) 로그인이 계속 되는지 확인한다.

보조 확인으로 curl 을 쓸 수 있다. 응답이 `403` 이고 `Access-Control-Allow-Origin` 헤더가 없어야 한다.

```sh
curl -i -X OPTIONS '<인스턴스 URL>/api/collections/songs/records' \
  -H 'Origin: https://example.com' \
  -H 'Access-Control-Request-Method: GET'
```

## 클라이언트 IP 와 요청 제한

### 제한 수치

| 위치                                          | 대상                            | 제한                |
| --------------------------------------------- | ------------------------------- | ------------------- |
| PocketHost 엣지                               | IP 당                           | 50 요청 / 10초      |
| PocketHost 엣지                               | IP 당                           | 1,000 요청 / 1시간  |
| PocketHost 엣지                               | 인스턴스당                      | 10,000 요청 / 1시간 |
| PocketHost 엣지                               | IP 당 동시 연결                 | 15                  |
| PocketBase `*:auth`                           | 로그인·인증(Google OAuth2 포함) | 2 요청 / 3초        |
| PocketBase `*:create`                         | 레코드 생성                     | 20 요청 / 5초       |
| PocketBase `/api/batch`                       | 배치 요청                       | 3 요청 / 1초        |
| PocketBase `/api/`                            | 일반 API                        | 300 요청 / 10초     |
| PocketBase `POST /api/dazbeat/play-sessions`  | 랭킹 세션 발급                  | 10 요청 / 60초      |
| PocketBase `POST /api/dazbeat/play-sessions/` | 결과 제출(접두 일치)            | 10 요청 / 60초      |

- PocketBase 내장 limiter 의 규칙은 마이그레이션 `1791532400_enable_dazbeat_rate_limits.js` 가 관리한다. 같은 label 의 규칙은 값을 덮고 다른 label 은 보존한다. down 은 두 dazbeat 규칙을 지우고 limiter 를 끈다.
- 정상 플레이 1판은 곡·채보 목록, 재킷, 채보, 세션 발급, 결과 제출 등 약 10건이라 위 제한 안에 들어간다.
- 초과하면 `429` 를 받는다. PocketBase 내장 limiter 의 `429` 는 PocketBase 표준 JSON 이고 `Retry-After` 가 없다. PocketHost 엣지의 `429` 에는 `Retry-After` 가 있다. 게임 클라이언트는 `429` 를 `rate_limited` 로 `console.warn` 에 남기고 자동 재시도하지 않으며, 그 판은 랭킹 없이 끝난다(로컬 기록은 유지).

### IP 기준 제한의 전제

PocketBase 내장 limiter 는 클라이언트 IP 단위로 버킷을 나눈다. 로그인 사용자 단위 버킷은 없고, 같은 IP 의 다른 사용자는 같은 버킷을 쓴다. trusted proxy 를 설정하지 않으면 `X-Forwarded-For` 를 무시하고 접속 IP 를 쓰므로, PocketHost 뒤에서는 모든 사용자가 프록시 IP 하나의 버킷을 나눠 쓰게 될 수 있다. 그래서 rate limit 마이그레이션은 실제 클라이언트 IP 를 확인한 뒤에만 배포한다.

### 배포 순서

1. **hooks 배포**: rate limit 마이그레이션 없이 "PocketHost 배포" 절차로 `pb_hooks` 와 나머지 마이그레이션을 배포한다.
2. **IP 헤더 확인**: superuser 토큰으로 진단 라우트를 호출한다. 일반 사용자 토큰은 `403`, 토큰 없음은 `401` 이다.

   ```sh
   curl -s '<인스턴스 URL>/api/dazbeat/diagnostics/client-ip' \
     -H 'Authorization: <superuser 토큰>'
   ```

   응답은 `{"remoteIP", "realIP", "headers": {"X-Forwarded-For", "X-Real-IP", "CF-Connecting-IP", "X-PocketHost-Client-IP"}}` 이고 없는 헤더는 빈 문자열이다. 호출한 PC 의 공인 IP 와 같은 값이 어느 헤더에 오는지 확인한다.

3. **trusted proxy 설정**: 관리 UI Settings › Application 의 trusted proxy(User IP proxy headers)에 2단계에서 찾은 헤더 이름을 넣는다. `X-Forwarded-For` 처럼 여러 IP 가 이어지는 헤더라면 맨 왼쪽 IP 사용 여부를 그 헤더 값의 순서에 맞춰 정한다.
4. **판정 IP 재확인**: 진단 라우트를 다시 호출해 `realIP` 가 호출한 PC 의 공인 IP 인지 확인한다. 가능하면 다른 네트워크(예: 휴대폰 테더링)에서도 호출해 `realIP` 가 달라지는지 본다.
5. **rate limit 마이그레이션 배포**: `1791532400_enable_dazbeat_rate_limits.js` 를 SFTP 로 올리고 인스턴스를 재시작한다. 관리 UI Settings › Rate limits 에서 limiter 가 켜져 있고 위 표의 규칙이 들어갔는지 확인한다.

### 429 측정

로그인한 테스트 계정의 토큰과 실제 채보의 `id`·`revision` 으로 세션 발급을 60초 안에 11번 보낸다. 10번째까지는 `200`(또는 채보 상태에 따른 `4xx` 업무 오류), 11번째는 `429` 여야 한다. 발급할 때마다 그 사용자의 이전 세션은 교체되므로 운영 데이터에 남는 것은 세션 1개뿐이다.

```sh
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST '<인스턴스 URL>/api/dazbeat/play-sessions' \
    -H 'Authorization: <테스트 계정 토큰>' \
    -H 'Content-Type: application/json' \
    -d '{"chartId":"<채보 id>","chartRevision":"<채보 revision>"}'
done
```

측정 뒤 다른 네트워크에서 같은 요청을 1번 보내 `429` 가 아닌지 확인한다. `429` 라면 버킷이 IP 별로 나뉘지 않은 것이므로 아래 처리를 따른다.

### 실제 IP 를 얻지 못할 때

진단 라우트의 어느 헤더에도 실제 클라이언트 IP 가 오지 않거나 4단계에서 `realIP` 가 실제 IP 가 되지 않으면, 운영에서 PocketBase 내장 limiter 를 쓰지 않는다. rate limit 마이그레이션을 올리지 않고(이미 적용됐다면 관리 UI Settings › Rate limits 에서 limiter 를 끈다) PocketHost 엣지 제한만 남긴다. 이 경우 내장 rate limit 은 "적용 안 됨"으로 보고한다. 사용자당 활성 세션은 유일 인덱스로 1개로 묶여 있어 세션 행 수는 여전히 제한된다.

## 백업·복구

### 백업 대상

운영 PocketBase 의 DB(`songs`, `charts`, `scores`, `play_sessions`, `users` 등)와 업로드 파일 스토리지(재킷)가 원본이다. 백업은 `pb_data` 의 DB 와 업로드 파일을 함께 담아야 한다.

### 주 백업: PocketBase 내장 백업

- 관리 UI Settings › Backups 에서 자동 백업을 켠다.
  - cron: 매일 1회, `0 18 * * *`(UTC, 03:00 KST)
  - 보존: 14개
- 저장 위치는 호스트 외부의 S3 호환 스토리지를 권장한다(PocketHost 문서도 S3 를 권장한다). S3 키는 관리 UI 에만 입력하고 저장소·문서에 적지 않는다.
- 업로드 파일 자체를 S3 에 두는 구성이면 내장 백업 zip 에 업로드 파일이 빠진다. 그 경우 버킷의 버전 관리·복제를 따로 켠다.

### 보조 백업

- PocketHost 의 일일 백업(PocketHost 가 운영, 보존 기간 비공개).
- 수동: 인스턴스를 끈 뒤 SFTP 로 `pb_data` 전체(DB 와 `storage`)를 내려받는다.

### 담당과 주기

- 담당자는 저장소 소유자(운영 계정 보유자)다.
- 마이그레이션·hook 배포·운영 데이터 변경 전에는 반드시 수동 백업을 만들고 내려받는다.
- PocketHost 인스턴스가 휴면 중이면 예약 백업이 실패할 수 있으므로 월 1회 백업 목록을 확인한다.

### 복구

- 관리 UI Settings › Backups 에서 백업 zip 을 복원한다.
- 또는 인스턴스를 끈 상태에서 SFTP 로 `pb_data` 를 백업본으로 교체한 뒤 다시 켠다.

### 복구 검증

1. 백업 zip 을 로컬 Docker PocketBase 에 복원한다("개발 Docker 실행" 으로 띄운 뒤 관리 UI 에서 복원).
2. 곡 수와 채보 수가 운영과 같은지 확인한다.
3. 곡 목록의 재킷 URL 이 열리는지 확인한다.
4. 로컬 게임(`npm run dev`)에서 각 채보가 로드되는지 확인한다.
5. 관리 UI 에서 모든 `charts` 레코드의 `revision` 이 채워져 있는지 확인한다.

## 보안 한계

- 서버 리플레이 재계산은 점수·판정 숫자 위조와 비정상 요청을 줄이지만, 완벽하게 조작된 입력 타임라인이나 자동 플레이를 사람의 플레이와 구별하지 못한다. 완전한 안티치트가 아니다.
- CORS 는 브라우저만 지키는 정책이다. curl·스크립트·봇은 Origin 을 생략하거나 위조할 수 있으므로 Origin 검사로 직접 HTTP 요청을 막았다고 보지 않는다. 실제 보호는 API Rules·인증·rate limit 이다.
- `users` 컬렉션의 이메일/비밀번호 가입 API 가 열려 있어 계정을 쉽게 만들 수 있다. 로그인 정책은 이번 범위에서 바꾸지 않았으며, 여러 계정을 이용한 랭킹 남용 위험이 남는다.
- 재킷·영상을 공개로 제공하려면 별도의 저작권 허락이 필요하다. 저장 위치를 PocketBase 로 옮긴 것이 허락을 대신하지 않는다.

## 운영 확인 체크리스트

아래 항목은 운영 계정이 있어야 해서 자동화할 수 없다. 수행하기 전에는 완료로 표시하지 않는다.

- [ ] PocketHost 인스턴스 PocketBase 버전이 `PB_VERSION` 과 같은 minor(0.40.x)인지 확인
- [ ] Secret `DAZBEAT_ALLOWED_ORIGINS=https://dev-asdf-516.github.io` 적용과 인스턴스 재시작
- [ ] 실제 브라우저에서 GitHub Pages 의 Google 로그인·곡 조회·랭킹 제출 확인
- [ ] 비허용 웹 Origin 에서 브라우저 요청이 거부되는지 확인
- [ ] 진단 라우트로 클라이언트 IP 전달 헤더 확인, trusted proxy 설정과 `realIP` 재확인
- [ ] rate limit 마이그레이션 배포 후 운영 429 측정(또는 "적용 안 됨" 보고)
- [ ] 자동 백업 설정(cron·보존·S3)과 복구 검증
- [ ] 로컬 실제 데이터를 `pocketbase/seed/data/` 로 옮기고 옛 경로의 Git 추적 해제
