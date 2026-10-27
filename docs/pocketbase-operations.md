# PocketBase 운영 문서

dazbeat 의 곡·채보·랭킹 데이터를 담는 PocketBase 의 개발 환경, 운영(PocketHost) 배포, 보안 설정, 백업·복구 절차를 정리한다. 이 문서의 운영 작업은 운영 계정을 가진 저장소 소유자가 직접 수행한다. 문서에는 비밀값(관리자 이메일·토큰·비밀번호·S3 키)을 적지 않으며, 예시의 `<...>` 는 실행할 때 실제 값으로 바꾼다.

## 운영 원본 정책

- 운영 데이터의 원본은 운영 PocketBase 다. Git 저장소나 로컬 시드 데이터가 원본이 아니다.
- 곡 메타데이터와 재킷은 PocketBase 관리 UI 에서 입력·수정한다.
- 곡 목록은 `releasedOn`(YouTube 업로드일) 최신순이다. `releasedOn` 은 필수 필드라, 필드를 추가하는 마이그레이션 배포 뒤에는 시드 4곡(`sample`·`karma`·`lucy`·`moechakka`) 외의 기존 곡에 관리 UI 에서 값을 넣어야 한다. 비어 있는 곡은 다른 필드를 고쳐도 저장되지 않는다.
- 채보는 권한형 에디터(`users.isEditor = true` 인 계정)로 저장한다. `charts.revision` 은 서버 hook 이 채보 내용으로 계산하므로 직접 넣지 않는다.
- 로컬 데이터로 운영 원본을 덮어쓰는 배포를 하지 않는다. `npm run seed` 는 로컬 루프백 PocketBase(`localhost`, `127.0.0.1`, `[::1]`) 전용이며 다른 대상은 네트워크 요청 전에 거절한다. 운영 PocketBase 를 Git·로컬 상태로 되돌리는 동기화 도구도 두지 않는다.

## 로컬 시드 데이터

### 형식

`npm run seed` 는 `pocketbase/seed/data/manifest.json` 과 그 안에서 가리키는 재킷·채보 파일을 읽는다. `pocketbase/seed/data/` 디렉터리 전체는 Git 무시 대상이라 저장소에 커밋되지 않는다. manifest 의 모든 경로는 이 디렉터리 기준 상대 경로이며, 디렉터리 밖(`..`, 절대 경로)을 가리키면 오류다.

```json
{
  "version": 2,
  "songs": [
    {
      "key": "example-song",
      "title": "Example Song",
      "category": "original",
      "youtubeVideoId": "xxxxxxxxxxx",
      "accentColor": 4773608,
      "constellation": "gemini",
      "releasedOn": "2026-01-01",
      "gameStartMs": 0,
      "gameEndMs": 30000,
      "credit": ["Example credit line"],
      "jacket": "example-song/jacket.jpg",
      "charts": {
        "4": {
          "easy": "example-song/charts/4k-easy.json",
          "expert": "example-song/charts/4k-expert.json"
        },
        "6": {
          "hard": "example-song/charts/6k-hard.json"
        }
      }
    }
  ]
}
```

- `songs` 는 1개 이상이고 `key` 는 manifest 안에서 유일해야 한다. `category`·`constellation`·난이도는 게임의 도메인 값만 쓸 수 있고, 알 수 없는 필드가 있으면 오류다. `releasedOn` 은 `YYYY-MM-DD` 형식의 YouTube 업로드일이다. `credit` 은 선택이다.
- 재킷 확장자는 `.jpg`/`.jpeg`/`.png`/`.webp` 만 허용한다.
- `version` 은 `2` 만 허용한다. 난이도를 바로 두던 version 1 manifest 는 변환하지 않고 오류로 거부한다.
- `charts` 는 레인 수(`"4"`·`"5"`·`"6"`) → 난이도 → 채보 파일 경로이며, 레인 수·난이도 모두 일부만 있어도 된다. 각 채보 파일은 게임의 채보 검증을 그 곡의 `key`·`gameStartMs`·`gameEndMs`, 난이도, manifest 의 레인 수로 통과해야 한다.
- 채보 파일에는 `laneCount` 필드가 있고 manifest 의 레인 수 키와 같아야 하며, 노트의 `lane` 은 `0` 부터 `laneCount - 1` 까지의 정수다. 예: `{ "songId": "example-song", "difficulty": "hard", "laneCount": 6, "offsetMs": 0, "notes": [{ "type": "tap", "timeMs": 1200, "lane": 5 }] }`
- 검증은 모두 첫 네트워크 요청 전에 끝난다. 실패하면 실패한 파일의 절대 경로와 manifest 안의 위치를 출력하고 아무것도 쓰지 않는다.

### 실행

1. `.env` 에 `VITE_POCKETBASE_URL`(예: `http://127.0.0.1:8090`), `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD` 를 넣는다(변수 설명은 `.env.example`).
2. 아래 "개발 Docker 실행" 으로 로컬 PocketBase 를 띄우고, 그 인스턴스에 superuser 를 만든다.
3. `npm run seed` 를 실행한다. `key` 로 곡을 찾아 없으면 재킷과 함께 만들고, 곡의 레인 수·난이도 조합 채보가 없으면 만든다. 이미 있는 곡·같은 조합의 채보는 갱신·삭제하지 않고 건너뛴다.

### 레인 수 마이그레이션 뒤 로컬 데이터 재생성

`1792814400_add_charts_lane_count.js` 는 `charts` 에 필수 `laneCount` 를 추가하고 유일 키를 `(song, difficulty, laneCount)` 로 바꾸지만 기존 레코드를 채우지 않는다. 이 마이그레이션 전에 만든 로컬 PocketBase 의 채보는 `laneCount` 가 없어 수정·로드에 실패하므로, 로컬 데이터를 새로 만든 뒤 다시 시드한다.

1. 로컬 시드 데이터를 위 version 2 형식으로 고친다(채보 파일에 `laneCount` 추가, manifest `charts` 를 레인 수 키 아래로).
2. 로컬 PocketBase 를 멈추고(`docker compose stop pocketbase`) 데이터 폴더 `pocketbase/pb_data/` 를 다른 이름으로 옮겨 둔다. 계정과 플레이 기록, 업로드 파일이 모두 그 안에 있으므로 사람이 확인하고 실행한다. `docker compose down -v` 는 이 폴더를 지우지 않는다.
3. 아래 "개발 Docker 실행" 으로 다시 띄우고 superuser 를 만든 뒤 `npm run seed` 를 실행한다. Google 로그인 설정도 데이터 폴더와 함께 사라지므로 `.env` 의 `DAZBEAT_GOOGLE_CLIENT_ID`·`DAZBEAT_GOOGLE_CLIENT_SECRET` 이 있는지 확인한다(아래 "로컬 Google 로그인").

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

1. `npm run build:hooks` 로 hook 이 `require` 하는 서버 번들 `pocketbase/pb_hooks/lib/*.cjs`(목록은 `vite.hooks.config.ts`)를 만든다. 빌드 산출물이라 Git 무시 대상이며, 없으면 플레이 세션·곡 검색 API 와 채보 저장이 동작하지 않는다. `src/rhythm/`, `src/data/`, `pocketbase/verification/` 을 바꾼 뒤에도 다시 빌드한다.
2. `docker compose up --build` 로 PocketBase 를 띄운다. `127.0.0.1:8090` 에서만 열린다.
   - `./pocketbase/pb_data` → `/pb/pb_data`, `./pocketbase/pb_migrations` → `/pb/pb_migrations`, `./pocketbase/pb_hooks` → `/pb/pb_hooks` 로 마운트된다. DB 와 업로드 파일은 Git 무시 대상인 `pocketbase/pb_data/` 에 남아, 컨테이너나 Docker 볼륨을 지워도 사라지지 않는다.
   - `DAZBEAT_ALLOWED_ORIGINS` 는 Vite 개발 서버 Origin 인 `http://localhost:5173,http://127.0.0.1:5173` 이다.
   - `DAZBEAT_GOOGLE_CLIENT_ID`, `DAZBEAT_GOOGLE_CLIENT_SECRET` 은 `.env` 에서 받아 넘긴다(아래 "로컬 Google 로그인").
3. hook 이나 번들을 바꾼 뒤에는 `docker compose restart pocketbase` 로 다시 읽게 한다.

### 로컬 Google 로그인

Google OAuth 클라이언트 값은 DB 에만 저장되므로 데이터 폴더 `pocketbase/pb_data/` 를 새로 만들면 함께 사라진다. 그래서 로컬에서는 `.env` 에 두고 `pocketbase/pb_hooks/googleAuth.pb.js` 가 서버가 켜질 때마다 users 컬렉션의 Google provider 를 그 값으로 맞춘다. 값이 같으면 저장하지 않고, 변수가 없으면(PocketHost) 관리 UI 의 설정을 그대로 둔다.

1. Google Cloud Console 의 OAuth 클라이언트(웹 애플리케이션) 승인된 리디렉션 URI 에 `http://127.0.0.1:8090/api/oauth2-redirect` 를 넣는다.
2. 그 클라이언트의 ID 와 보안 비밀을 `.env` 의 `DAZBEAT_GOOGLE_CLIENT_ID`, `DAZBEAT_GOOGLE_CLIENT_SECRET` 에 넣는다.
3. `docker compose up -d` 로 컨테이너를 다시 만든다(`restart` 는 바뀐 환경변수를 읽지 않는다).
4. `curl -s 'http://127.0.0.1:8090/api/collections/users/auth-methods?fields=oauth2'` 의 `providers` 에 `google` 이 있는지 확인한다.

통합 테스트(`npm run test:integration`)는 Docker 를 쓰지 않는다. `pocketbase/Dockerfile` 의 `PB_VERSION` 과 같은 버전의 PocketBase 바이너리를 내려받아 임시 데이터 디렉터리로 띄운다.

## PocketHost 배포

### 버전 확인

PocketHost 인스턴스의 PocketBase 버전은 `pocketbase/Dockerfile` 의 `PB_VERSION` 과 같은 minor(현재 0.40.x)여야 한다. 배포 전마다 PocketHost 대시보드에서 인스턴스 버전을 확인한다. 사용자 정의 바이너리나 별도 Node 프로세스는 전제로 하지 않는다.

### 절차

1. **빌드**: 배포할 커밋에서 `npm ci` 후 `npm run build:hooks` 를 실행해 `pocketbase/pb_hooks/lib/` 의 서버 번들을 만든다.
2. **수동 백업**: 관리 UI Settings › Backups 에서 백업을 만들고 zip 을 내려받는다(아래 "백업·복구"). 마이그레이션·hook 배포 전에는 반드시 한다.
3. **SFTP 업로드**: PocketHost 의 SFTP 로 저장소의 `pocketbase/pb_migrations/` 와 `pocketbase/pb_hooks/`(빌드된 `lib/` 포함)를 인스턴스의 `pb_migrations/`, `pb_hooks/` 에 올린다. rate limit 마이그레이션 두 개(`1791532400_enable_dazbeat_rate_limits.js`, `1792121900_relax_play_session_ip_rate_limits.js`)는 한 묶음으로 다룬다. `1791532400` 이 이미 적용된 인스턴스는 이번 배포에서 `1792121900` 을 함께 올린다. `1791532400` 을 아직 보류 중이면 둘 다 빼고 올렸다가 "클라이언트 IP 와 요청 제한" 의 "배포 순서" 5단계에서 함께 올린다. 아직 적용하지 않은 마이그레이션은 파일 이름 순서로 적용되므로, `1792121900` 만 먼저 올리면 나중에 올린 `1791532400` 이 dazbeat 규칙을 10 요청 / 60초로 다시 덮는다.
4. **재시작**: PocketHost 대시보드에서 인스턴스를 재시작한다. 새 마이그레이션은 시작할 때 적용된다.
5. **점검**: 관리 UI Logs 에 hook 로드·마이그레이션 오류가 없는지 보고, 아래 "Origin 허용 목록과 CORS" 의 브라우저 점검과 GitHub Pages 에서의 로그인·곡 조회·랭킹 제출을 확인한다. 관리 UI 에서 `charts` 레코드의 `revision` 이 채워져 있는지도 본다.

서버와 클라이언트를 함께 바꾸는 배포는 서버(마이그레이션·hook·`npm run build:hooks` 산출물)를 위 절차로 먼저 배포하고, 그 뒤 클라이언트를 배포한다. 세션 채보 스냅샷(아래 "세션 채보 스냅샷")을 들이는 배포에서는 다음을 지킨다.

- 마이그레이션 `1792122000_add_play_sessions_chart_data.js` 는 적용 순간의 `play_sessions` 행을 모두 지운다. 그때 플레이 중이던 판은 제출 때 `404 session_not_found` 로 랭킹 없이 끝난다.
- 새 서버 + 이전 클라이언트는 발급 API 계약이 같아 동작한다. 이전 클라이언트는 발급 `409` 때 재조회하지 않고 랭킹 없이 진행한다.
- 되돌릴 때는 hook 과 이 마이그레이션을 함께 되돌린다. 마이그레이션 down 은 `chartData` 필드만 지우고 세션 행은 남긴다.

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
| PocketBase `POST /api/dazbeat/play-sessions`  | 랭킹 세션 발급                  | 30 요청 / 60초      |
| PocketBase `POST /api/dazbeat/play-sessions/` | 결과 제출(접두 일치)            | 30 요청 / 60초      |
| PocketBase 발급 hook                          | 사용자당 세션 발급              | 20 발급 / 60초      |

- PocketBase 내장 limiter 의 규칙은 마이그레이션 `1791532400_enable_dazbeat_rate_limits.js` 가 관리한다. 같은 label 의 규칙은 값을 덮고 다른 label 은 보존한다. down 은 두 dazbeat 규칙을 지우고 limiter 를 끈다. 두 dazbeat 규칙의 값은 이어지는 완화 마이그레이션 `1792121900_relax_play_session_ip_rate_limits.js` 가 10 요청에서 30 요청 / 60초로 바꾼다. 이 마이그레이션은 두 dazbeat label 만 바꾸고 다른 규칙과 limiter 켜짐 여부·제외 IP 는 그대로 두며, down 은 두 label 을 10 요청 / 60초로 되돌린다.
- 정상 플레이 1판의 PocketBase 요청은 아래 "요청 수와 채보 캐시" 표처럼 0~4건이고(접속 때 곡·채보 목록 2건 별도), 위 제한 안에 들어간다.
- 초과하면 `429` 를 받는다. PocketBase 내장 limiter 의 `429` 는 PocketBase 표준 JSON 이고 `Retry-After` 가 없다. PocketHost 엣지의 `429` 에는 `Retry-After` 가 있다. 게임 클라이언트는 `429` 를 `rate_limited` 로 `console.warn` 에 남기고 자동 재시도하지 않으며, 그 판은 랭킹 없이 끝난다(로컬 기록은 유지).

### 사용자 단위 세션 발급 제한

IP 제한과 별도로 발급 hook(`pb_hooks/playSessions.pb.js`)이 로그인 사용자마다 세션 발급 횟수를 센다.

- **윈도**: 20회 / 60초 고정 윈도다. 윈도는 그 사용자의 첫 발급 시각부터 60초이고, 지나면 다음 발급 시각에서 새 윈도가 시작된다.
- **카운트 대상**: 세션이 실제로 발급된 요청만 센다. 비로그인(`401`), `invalid_request`·`chart_not_found`·`chart_changed`, 한도 초과로 거절된 요청은 세지 않는다.
- **저장소**: 서버 전용 컬렉션 `play_session_quotas`(마이그레이션 `1792121800_create_play_session_quotas.js`). 모든 API rule 이 비어 superuser 와 hook 만 읽고 쓴다. 사용자당 1행을 제자리에서 갱신하므로 행 수는 사용자 수를 넘지 않는다. DB 에 있으므로 인스턴스 재시작·휴면 뒤에도 유지되고, 사용자를 지우면 함께 지워진다. 판정·기록은 세션 교체와 같은 트랜잭션 안에서 하므로 동시 요청으로도 한도를 넘지 않는다.
- **IP 제한과의 관계**: IP 제한을 대체하지 않고 그 위에 더한다. 내장 limiter 가 먼저 평가되므로 사용자 단위로 거절된 요청도 IP 버킷을 쓴다. 클라이언트 IP 판정과 무관하게 동작하므로, 아래 "실제 IP 를 얻지 못할 때" 처럼 내장 limiter 를 쓰지 않는 경우에도 유지된다.
- **응답**: 초과하면 `429` `{"status":429,"code":"session_rate_limited",...}` 와 윈도가 끝날 때까지 남은 초를 담은 `Retry-After` 헤더를 돌려준다. 게임은 자동 재시도하지 않고 그 판을 랭킹 없이 진행한다(로컬 기록은 유지).
- **결과 제출**: 결과 제출 hook 은 첫 요청이 리플레이 전에 세션을 소비(삭제)하고, 소비한 요청만 리플레이한 뒤 별도 트랜잭션에서 최고 기록을 갱신한다. 그래서 세션 하나당 리플레이는 최대 1회이고, 사용자당 리플레이 수는 위 발급 한도를 넘지 않는다. 결과 제출에는 사용자 단위 제한을 따로 두지 않는다. 같은 세션을 다시 제출하면 리플레이 없이 `404 session_not_found` 다.

### 세션 유효 시간

- 세션은 `발급 시각 + 곡 플레이 길이 + 12시간` 에 만료된다(`SESSION_GRACE_MS`, `pocketbase/verification/verifyPlay.ts`). 만료 뒤 제출은 `410 session_expired` 다.
- 일시정지를 오래 했다가 이어서 끝까지 플레이해도 랭킹에 반영되도록 유예를 길게 둔다.
- 발급 hook 이 같은 사용자의 이전 세션을 지우므로 사용자당 활성 세션은 1개다. 그래서 유예가 길어도 동시에 쥘 수 있는 세션 수는 늘지 않는다. 다른 탭·기기에서 새 판을 시작하면 먼저 시작한 판은 제출 때 `404 session_not_found` 로 랭킹 없이 끝난다.

### 세션 채보 스냅샷

발급 hook 은 요청의 `chartRevision` 과 비교한 바로 그 채보 레코드의 `data` 원문 JSON 을 세션의 `play_sessions.chartData` 에 그대로 저장한다(마이그레이션 `1792122000_add_play_sessions_chart_data.js`).

- **저장소**: json, required, `maxSize` 미지정이라 PocketBase 기본 한도 1MB 다. `charts.data` 와 같은 설정이므로 저장할 수 있는 어떤 채보든 담는다. 컬렉션의 모든 API rule 이 비어 있어 superuser 와 hook 만 읽고 쓴다.
- **검증**: 결과 제출 hook 은 현재 채보가 아니라 세션 스냅샷으로 리플레이한다. 스냅샷의 sha256 이 세션 `chartRevision` 과 다를 때만 `chart_changed` 로 거절하며, 정상 운영에서는 일어나지 않는다. 그래서 플레이 도중 채보가 바뀌어도 그 판은 플레이한 채보 기준으로 판정된다.
- **랭킹 반영**: 통과한 결과는 최고 기록 저장 트랜잭션 안에서 읽은 그 채보의 현재 `revision` 행에 저장되어 현재 랭킹에 보인다. 플레이한 revision 은 따로 남기지 않는다.
- **feature 016 원칙의 예외 범위**: "채보 변경 전 기록은 새 채보 랭킹에 섞지 않는다" 의 예외는 채보가 바뀔 때 진행 중이던 세션의 결과뿐이다. 이미 저장된 옛 revision 기록은 계속 숨겨지고, 채보가 바뀐 뒤 옛 revision 으로 새 세션을 요청하면 여전히 `409 chart_changed` 다.

### 요청 수와 채보 캐시

게임 클라이언트는 플레이할 채보를 탭 메모리에 chart id 당 하나씩 보관한다(`src/backend/ChartCache.ts`). 새로고침하면 비워지고, 브라우저 저장소에는 남기지 않는다.

- **플레이 준비**: 캐시의 채보 revision 으로 세션을 발급받는다. 캐시가 낡아 발급이 `409 chart_changed` 이면 그 채보를 서버에서 다시 받고 새 revision 으로 한 번만 다시 발급한다. 재발급도 실패하면 새 채보로 랭킹 없이 플레이한다. `chart_changed` 가 아닌 발급 실패(`429` 등)는 다시 받지 않고 캐시의 채보로 랭킹 없이 플레이한다.
- **비로그인**: 발급하지 않으므로 낡은 캐시를 알아챌 계기가 없다. 새로고침 전까지 캐시의 채보로 플레이한다.
- **에디터**: 채보 열기는 캐시를 쓰지 않고 항상 서버에서 받는다. 에디터 저장은 저장 응답의 채보·서버 revision 으로 그 chart id 의 캐시를 갱신하므로, 저장 뒤 첫 판도 채보 요청이 없다.

| 시점                                          | 캐시 도입 전                                        | 캐시 도입 후                                                  |
| --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| 접속 1회                                      | 곡 목록 1 + 채보 목록 1 (재킷 파일은 브라우저 캐시) | 같다                                                          |
| 로그인 사용자, 그 탭에서 처음 플레이하는 채보 | 채보 1 + 발급 1 + 제출 1 = 3                        | 같다                                                          |
| 로그인 사용자, 같은 채보 반복                 | 3                                                   | 발급 1 + 제출 1 = 2                                           |
| 로그인 사용자, 캐시가 낡은 판                 | 3 (+ 플레이 도중 바뀌면 결과 거절)                  | 발급(409) 1 + 재조회 1 + 재발급 1 + 제출 1 = 4, 이후 반복은 2 |
| 비로그인, 같은 채보 반복                      | 1                                                   | 0                                                             |
| 에디터 채보 열기 / 저장                       | 1 / 1 (새 채보면 곡 조회 +1)                        | 같다                                                          |

PocketHost 한도는 인스턴스당 10,000 요청 / 1시간, IP 당 1,000 요청 / 1시간이고, 요금제를 올려도 인스턴스 한도는 늘지 않는다. 한 접속에서 같은 채보를 20판 하는 로그인 사용자는 캐시 전 접속 2 + 20 × 3 = 62 요청에서 접속 2 + 3 + 19 × 2 = 43 요청이 되어, 같은 인스턴스 한도로 약 1.4~1.5배의 사용자를 받는다.

실측 절차(운영 PocketHost 배포 뒤):

1. `curl -i '<인스턴스 URL>/api/collections/songs/records'` 응답에서 `X-PocketHost-RateLimit-*` 헤더를 확인한다. 헤더의 정확한 이름·의미는 실측 때 본 그대로 이 절에 기록한다.
2. 로그인한 브라우저에서 같은 채보를 두 번 플레이하고, 개발자 도구 Network 탭에서 두 번째 판에 `charts/records/<id>` 요청이 없고 세션 발급·결과 제출만 있는지 확인한다.

### IP 기준 제한의 전제

PocketBase 내장 limiter 는 클라이언트 IP 단위로 버킷을 나눈다. 로그인 사용자 단위 버킷은 없고, 같은 IP 의 다른 사용자는 같은 버킷을 쓴다. trusted proxy 를 설정하지 않으면 `X-Forwarded-For` 를 무시하고 접속 IP 를 쓰므로, PocketHost 뒤에서는 모든 사용자가 프록시 IP 하나의 버킷을 나눠 쓰게 될 수 있다. 그래서 rate limit 마이그레이션은 실제 클라이언트 IP 를 확인한 뒤에만 배포한다.

### 배포 순서

1. **hooks 배포**: rate limit 마이그레이션 두 개(`1791532400`, `1792121900`) 없이 "PocketHost 배포" 절차로 `pb_hooks` 와 나머지 마이그레이션을 배포한다.
2. **IP 헤더 확인**: superuser 토큰으로 진단 라우트를 호출한다. 일반 사용자 토큰은 `403`, 토큰 없음은 `401` 이다.

   ```sh
   curl -s '<인스턴스 URL>/api/dazbeat/diagnostics/client-ip' \
     -H 'Authorization: <superuser 토큰>'
   ```

   응답은 `{"remoteIP", "realIP", "headers": {"X-Forwarded-For", "X-Real-IP", "CF-Connecting-IP", "X-PocketHost-Client-IP"}}` 이고 없는 헤더는 빈 문자열이다. 호출한 PC 의 공인 IP 와 같은 값이 어느 헤더에 오는지 확인한다.

3. **trusted proxy 설정**: 관리 UI Settings › Application 의 trusted proxy(User IP proxy headers)에 2단계에서 찾은 헤더 이름을 넣는다. `X-Forwarded-For` 처럼 여러 IP 가 이어지는 헤더라면 맨 왼쪽 IP 사용 여부를 그 헤더 값의 순서에 맞춰 정한다.
4. **판정 IP 재확인**: 진단 라우트를 다시 호출해 `realIP` 가 호출한 PC 의 공인 IP 인지 확인한다. 가능하면 다른 네트워크(예: 휴대폰 테더링)에서도 호출해 `realIP` 가 달라지는지 본다.
5. **rate limit 마이그레이션 배포**: `1791532400_enable_dazbeat_rate_limits.js` 와 `1792121900_relax_play_session_ip_rate_limits.js` 를 함께 SFTP 로 올리고 인스턴스를 재시작한다. 하나만 올리지 않는다("PocketHost 배포" 3단계). 관리 UI Settings › Rate limits 에서 limiter 가 켜져 있고 위 표의 규칙이 들어갔는지, 두 dazbeat 규칙이 30 요청 / 60초인지 확인한다.

### 429 측정

IP 규칙은 같은 IP 에서 테스트 계정을 바꿔 가며 실제 채보의 `id`·`revision` 으로 세션 발급을 60초 안에 31번 보내 확인한다. 사용자 단위 제한(20회)에 먼저 걸리지 않도록 한 계정으로 20번까지만 보낸다. 30번째까지는 `200`(또는 채보 상태에 따른 `4xx` 업무 오류), 31번째는 본문에 `code` 가 없는 PocketBase 표준 `429` 여야 한다. 발급할 때마다 그 사용자의 이전 세션은 교체되므로 운영 데이터에 남는 것은 계정마다 세션 1개뿐이다.

```sh
for i in $(seq 1 31); do
  if [ "$i" -le 20 ]; then token='<테스트 계정 1 토큰>'; else token='<테스트 계정 2 토큰>'; fi
  curl -s -w " %{http_code}\n" -X POST '<인스턴스 URL>/api/dazbeat/play-sessions' \
    -H "Authorization: $token" \
    -H 'Content-Type: application/json' \
    -d '{"chartId":"<채보 id>","chartRevision":"<채보 revision>"}'
done
```

측정 뒤 다른 네트워크에서 같은 요청을 1번 보내 `429` 가 아닌지 확인한다. `429` 라면 버킷이 IP 별로 나뉘지 않은 것이므로 아래 처리를 따른다.

사용자 단위 제한은 같은 계정으로 세션 발급을 60초 안에 21번 보내 확인한다. 20번째까지는 `200`, 21번째는 `429` 이고 본문 `code` 가 `session_rate_limited`, 응답에 `Retry-After` 헤더가 있어야 한다(`curl -i` 로 헤더를 본다). IP 규칙이 21회보다 먼저 걸리면 PocketBase 표준 `429`(`code` 없음)가 먼저 나오므로, 본문 `code` 로 둘을 구분한다. 이어서 같은 IP 에서 다른 테스트 계정으로 1번 발급해 IP 버킷이 남아 있는 동안 `200` 인지 확인한다.

### 실제 IP 를 얻지 못할 때

진단 라우트의 어느 헤더에도 실제 클라이언트 IP 가 오지 않거나 4단계에서 `realIP` 가 실제 IP 가 되지 않으면, 운영에서 PocketBase 내장 limiter 를 쓰지 않는다. rate limit 마이그레이션 두 개(`1791532400`, `1792121900`)를 모두 올리지 않고(이미 적용됐다면 관리 UI Settings › Rate limits 에서 limiter 를 끈다) PocketHost 엣지 제한만 남긴다. 이 경우 내장 rate limit 은 "적용 안 됨"으로 보고한다. 사용자 단위 발급 제한(20회/60초)은 클라이언트 IP 판정과 무관한 hook 의 제한이라 이 경우에도 그대로 동작한다. 사용자당 활성 세션은 유일 인덱스로 1개로 묶여 있어 세션 행 수는 여전히 제한된다.

## 업적과 프로필

### 컬렉션

| 컬렉션 | 내용 |
|---|---|
| `play_results` | 검증을 통과한 판 1행(세션당 최대 1행). 총 플레이 횟수와 PLAY 계열 업적의 근거 |
| `achievement_marks` | 채보 단위 달성 증거(clear, s, fc, ap). `source` 가 `play` 면 제출, `backfill` 이면 소급 |
| `song_masteries` | 곡 마스터 달성 이력. 한 번 기록되면 지우지 않는다 |
| `earned_achievements` | 획득 업적(= 컬렉션 요소). `earnedAt` 은 서버가 한 번 쓰고 바꾸지 않는다 |

네 컬렉션 모두 API 규칙이 `null` 이라 관리자와 hook 만 읽고 쓴다. 사용자 관계는 cascade 라 계정을 지우면 함께 지워지고, 곡과 채보는 id 문자열이라 곡이나 채보를 지워도 달성 이력은 남는다. `users` 에는 `nickname`(필수, 대소문자 무시 유일)과 `featuredAchievement`(대표 컬렉션, 빈 값 가능)가 추가되며, 일반 users API 로는 둘 다 만들거나 바꿀 수 없다.

### 경로

| 경로 | 동작 |
|---|---|
| `POST /api/dazbeat/play-sessions/{sessionId}/result` | 기존 결과 제출. 최고 점수 트랜잭션 안에서 판, 증거, 업적을 함께 기록하고 응답에 `newAchievements` 를 더한다 |
| `GET /api/dazbeat/profile` | 본인 스냅샷으로 평가해 새 업적을 지급한 뒤 닉네임, 통계, 117개 진행 상태를 돌려준다 |
| `POST /api/dazbeat/profile/nickname` | 닉네임 변경. `400 invalid_nickname`, `409 nickname_taken`, `400 invalid_request` |
| `GET /api/dazbeat/profile/nickname/available?nickname=…` | 입력 중 닉네임 사용 가능 여부 안내(`{ available }`). 저장 때 다시 확인한다. `400 invalid_nickname`, `400 invalid_request` |
| `POST /api/dazbeat/profile/featured` | 대표 컬렉션 지정과 해제. `409 achievement_not_earned`, `400 invalid_request` |

네 프로필 경로는 로그인이 필요하다(비로그인 `401`). 다른 사용자의 프로필을 보는 경로는 없다.

### 소급과 집계 시작 시점

- `1792900900_backfill_achievement_marks.js` 는 적용 시점의 `scores` 최고 기록에서 증명되는 mark 만 `achievement_marks`(source `backfill`, 별자리 빈 값)로 옮긴다. 업적은 지급하지 않고, 그 사용자의 다음 프로필 조회나 다음 제출의 평가가 지급한다.
- 플레이 횟수(FIRST_FINISH, PLAY 계열)와 황도 순례는 소급하지 않는다. `play_results` 는 이 기능을 배포한 뒤 검증된 판부터 쌓이므로, 총 플레이 횟수는 배포 시점부터 센다.
- `1792901000_add_users_profile_fields.js` 는 기존 사용자마다 `과즙이` + 4자리 숫자 기본 닉네임을 채운 뒤 `nickname` 을 필수로 바꾼다. 새 계정은 `users.pb.js` 훅이 저장 전에 같은 규칙으로 채운다. 4자리가 모두 쓰인 뒤에만 자릿수가 늘어난다.
- 되돌릴 때는 파일 이름 역순으로 down 한다. 닉네임 마이그레이션 down 은 두 필드와 인덱스, 규칙 불변식을 지우고, 소급 down 은 `backfill` 증거만 지운다.

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
- [ ] rate limit 마이그레이션 `1791532400` 과 `1792121900` 을 같은 배포에서 함께 올렸는지 확인(따로 먼저 올린 `1792121900` 은 나중에 적용된 `1791532400` 이 10 요청으로 되돌린다. "PocketHost 배포" 3단계). 관리 UI Settings › Rate limits 에서 두 dazbeat 규칙이 30 요청 / 60초인지 본다
- [ ] rate limit 마이그레이션 배포 후 운영 429 측정(사용자 단위 `session_rate_limited` 포함, 또는 내장 limiter "적용 안 됨" 보고)
- [ ] 운영 PocketHost 에서 요청 수·`X-PocketHost-RateLimit-*` 실측("요청 수와 채보 캐시" 실측 절차)
- [ ] 자동 백업 설정(cron·보존·S3)과 복구 검증
- [ ] 로컬 실제 데이터를 `pocketbase/seed/data/` 로 옮기고 옛 경로의 Git 추적 해제
