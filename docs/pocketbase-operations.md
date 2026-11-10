# PocketBase 운영 문서

dazbeat 의 곡·채보·랭킹 데이터를 담는 PocketBase 의 개발 환경, 운영(PocketHost) 배포, 보안 설정, 백업·복구 절차를 정리한다. 이 문서의 운영 작업은 운영 계정을 가진 저장소 소유자가 직접 수행한다. 문서에는 비밀값(관리자 이메일·토큰·비밀번호·S3 키)을 적지 않으며, 예시의 `<...>` 는 실행할 때 실제 값으로 바꾼다.

## 운영 원본 정책

- 운영 데이터의 원본은 운영 PocketBase 다. Git 저장소나 로컬 시드 데이터가 원본이 아니다.
- 곡 메타데이터와 재킷은 PocketBase 관리 UI 에서 입력·수정한다.
- 새 곡은 비공개(`isPublished = false`)로 만들어지고, 관리 UI 에서 `isPublished` 를 켜야 플레이어에게 보인다. 에디터는 비공개 곡을 채보 에디터에서만 보며, 공개된 곡에 새로 저장한 난이도는 바로 보인다.
- 곡 목록은 `releasedOn`(YouTube 업로드일) 최신순이다. `releasedOn` 은 필수 필드라, 필드를 추가하는 마이그레이션 배포 뒤에는 시드 4곡(`sample`·`karma`·`lucy`·`moechakka`) 외의 기존 곡에 관리 UI 에서 값을 넣어야 한다. 비어 있는 곡은 다른 필드를 고쳐도 저장되지 않는다.
- 운영 인스턴스에 곡을 넣을 때 `previewStartMs`(미리듣기 시작 위치, YouTube 영상 ms)는 관리 UI 에서 입력한다. 비워 두면(0) `gameStartMs` 부터 미리듣는다.
- 채보는 권한형 에디터(`users.isEditor = true` 인 계정)로 저장한다. `charts.revision` 은 서버 hook 이 채보 내용으로 계산하므로 직접 넣지 않는다.
- 로컬 데이터로 운영 원본을 덮어쓰는 배포를 하지 않는다. `npm run seed` 는 로컬 루프백 PocketBase(`localhost`, `127.0.0.1`, `[::1]`) 전용이며 다른 대상은 네트워크 요청 전에 거절한다. 운영 PocketBase 를 Git·로컬 상태로 되돌리는 동기화 도구도 두지 않는다.

## 로컬 시드 데이터

### 형식

`npm run seed` 는 `pocketbase/seed/data/manifest.json` 과 그 안에서 가리키는 재킷·채보 파일을 읽는다. `pocketbase/seed/data/` 디렉터리 전체는 Git 무시 대상이라 저장소에 커밋되지 않는다. manifest 의 모든 경로는 이 디렉터리 기준 상대 경로이며, 디렉터리 밖(`..`, 절대 경로)을 가리키면 오류다.

```json
{
  "version": 2,
  "albums": [
    {
      "key": "orbit",
      "name": "orbit",
      "sortOrder": 30
    }
  ],
  "songs": [
    {
      "key": "example-song",
      "title": "Example Song",
      "category": "original",
      "youtubeVideoId": "xxxxxxxxxxx",
      "accentColor": 4773608,
      "constellation": "gemini",
      "album": "orbit",
      "releasedOn": "2026-01-01",
      "gameStartMs": 0,
      "gameEndMs": 30000,
      "previewStartMs": 15000,
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

- `songs` 는 1개 이상이고 `key` 는 manifest 안에서 유일해야 한다. `category`·`constellation`·난이도는 게임의 도메인 값만 쓸 수 있고, 알 수 없는 필드가 있으면 오류다. `releasedOn` 은 `YYYY-MM-DD` 형식의 YouTube 업로드일이다. `credit` 은 선택이다. `album` 은 선택이며 디스코그래피 업적의 수록 앨범으로, `albums` 의 `key` 중 하나여야 한다.
- `albums` 는 필수다(앨범이 없으면 빈 배열). `key` 는 manifest 안에서 유일하고 `^[a-z][A-Za-z0-9]*$` 형식이며, `name` 은 비어 있지 않은 표시 이름, `sortOrder` 는 정수다.
- 시드는 곡보다 먼저 앨범을 `key` 로 찾아 없는 앨범만 만들고, 새로 만드는 곡만 그 앨범에 연결한다. 이미 있는 앨범과 곡은 갱신하지 않는다.
- `previewStartMs` 는 선택이며 0 이상의 정수 ms(YouTube 영상 위치)다. 없거나 0 이면 `gameStartMs` 부터 미리듣는다. 새로 만드는 곡에만 저장하고, 이미 있는 곡은 갱신하지 않는다.
- 재킷 확장자는 `.jpg`/`.jpeg`/`.png`/`.webp` 만 허용한다.
- `version` 은 `2` 만 허용한다. 난이도를 바로 두던 version 1 manifest 는 변환하지 않고 오류로 거부한다.
- `charts` 는 레인 수(`"4"`·`"5"`·`"6"`) → 난이도 → 채보 파일 경로이며, 레인 수·난이도 모두 일부만 있어도 된다. 각 채보 파일은 게임의 채보 검증을 그 곡의 `key`·`gameStartMs`·`gameEndMs`, 난이도, manifest 의 레인 수로 통과해야 한다.
- 채보 파일에는 `laneCount` 필드가 있고 manifest 의 레인 수 키와 같아야 하며, 노트의 `lane` 은 `0` 부터 `laneCount - 1` 까지의 정수다. 예: `{ "songId": "example-song", "difficulty": "hard", "laneCount": 6, "offsetMs": 0, "notes": [{ "type": "tap", "timeMs": 1200, "lane": 5 }] }`
- 검증은 모두 첫 네트워크 요청 전에 끝난다. 실패하면 실패한 파일의 절대 경로와 manifest 안의 위치를 출력하고 아무것도 쓰지 않는다.

### 실행

1. `.env` 에 `VITE_POCKETBASE_URL`(예: `http://127.0.0.1:8090`), `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD` 를 넣는다(변수 설명은 `.env.example`).
2. 아래 "개발 Docker 실행" 으로 로컬 PocketBase 를 띄우고, 그 인스턴스에 superuser 를 만든다.
3. `npm run seed` 를 실행한다. `key` 로 곡을 찾아 없으면 재킷과 함께 만들고, 곡의 레인 수·난이도 조합 채보가 없으면 만든다. 이미 있는 곡·같은 조합의 채보는 갱신·삭제하지 않고 건너뛴다. 곡의 채보를 다 만든 뒤 비공개 곡을 공개한다.
4. `previewStartMs` 필드가 생기기 전에 시드한 로컬 곡은 `node --env-file-if-exists=.env --import ./pocketbase/seed/resolveTsImports.mjs pocketbase/seed/patchPreviewStarts.ts <preview-starts.json 경로>` 로 채운다. 파일은 곡 `key` → `{ "previewStartMs": … }` 형식이고, 값이 다른 곡의 `previewStartMs` 만 고친다. `npm run seed` 와 같은 환경 변수를 쓰며 로컬 루프백 PocketBase 전용이다.

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

1. `npm run build:hooks` 로 hook 이 `require` 하는 서버 번들 `pocketbase/pb_hooks/lib/` 아래 `.cjs`(목록은 `vite.hooks.config.ts`)를 만든다. 빌드 산출물이라 Git 무시 대상이며, 없으면 플레이 세션·곡 검색 API 와 채보 저장이 동작하지 않는다. `src/rhythm/`, `src/data/`, `pocketbase/lib/` 을 바꾼 뒤에도 다시 빌드한다.
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
- **랭킹 반영**: 통과한 결과는 세션에 고정된 revision(실제로 검증한 채보)으로 `play_results` 와 최고 기록(`scores`)에 저장된다. 랭킹은 채보의 현재 `revision` 기록만 보이므로, 플레이 도중 채보가 바뀌면 그 판의 기록은 남지만 현재 랭킹에는 나오지 않는다.
- **채보 변경 전 기록**: "채보 변경 전 기록은 새 채보 랭킹에 섞지 않는다" 에 예외가 없다. 이전 revision 기록은 지우지 않고 현재 랭킹에서만 빠지며, 채보가 바뀐 뒤 옛 revision 으로 새 세션을 요청하면 `409 chart_changed` 다.

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
| `play_results` | 검증을 통과한 판 1행(세션당 최대 1행). 총 플레이 횟수와 PLAY 계열 업적의 근거. 오토플레이 검사 결과(`autoplayCheck`, `autoplayReasons`, `inputStats`)도 함께 담는다 |
| `earned_chart_marks` | 채보 단위 도장(clear, s, fc, ap). `source` 가 `play` 면 제출, `backfill` 이면 소급 |
| `earned_song_marks` | 곡 단위 도장(곡의 모든 난이도에서 같은 도장을 받음). 한 번 기록되면 지우지 않는다 |
| `earned_achievements` | 획득 업적(= 컬렉션 요소). `earnedAt` 은 서버가 한 번 쓰고 바꾸지 않는다 |
| `achievements` | 업적 정의. 플레이어는 읽기만 하고 superuser 만 쓴다. 생성과 수정 요청은 저장 전에 규칙 값을 검사한다 |
| `albums` | 앨범(`key`, 표시 이름 `name`, `sortOrder`). 플레이어는 읽기만 하고 superuser 만 쓴다. 곡의 `album` 과 album 업적이 이 행을 가리킨다 |

위 네 기록 컬렉션은 API 규칙이 `null` 이라 관리자와 hook 만 읽고 쓴다. 사용자 관계는 cascade 라 계정을 지우면 함께 지워지고, 곡과 채보는 id 문자열이라 곡이나 채보를 지워도 달성 이력은 남는다. `users` 에는 `nickname`(필수, 대소문자 무시 유일)과 `featuredAchievement`(대표 컬렉션, 빈 값 가능)가 추가된다. 둘 다 가입 때는 설정할 수 없고, 본인 users 레코드 update 로 바꾼다. 형식과 획득 검사는 users 업데이트 요청 훅(`users.pb.js`)이, 닉네임 중복은 유일 인덱스가 맡는다. 관리자 수정은 검사를 생략한다.

### 경로

| 경로 | 동작 |
|---|---|
| `POST /api/dazbeat/play-sessions/{sessionId}/result` | 기존 결과 제출. 최고 점수 트랜잭션 안에서 판, 증거, 업적을 함께 기록하고 응답에 `newAchievements` 를 더한다 |
| `GET /api/dazbeat/profile` | 본인 스냅샷으로 평가해 새 업적을 지급한 뒤 닉네임, 통계, 활성 업적 진행 상태를 돌려준다 |
| `GET /api/dazbeat/profile/nickname/available?nickname=…` | 입력 중 닉네임 사용 가능 여부 안내(`{ available }`). 저장은 유일 인덱스가 판정한다. `400 invalid_nickname`, `400 invalid_request` |
| `PATCH /api/collections/users/records/{id}`(본인) | 닉네임과 대표 컬렉션 변경(`featuredAchievement` 빈 값은 해제). `400 data.nickname.code = invalid_nickname \| validation_not_unique`, `400 data.featuredAchievement.code = achievement_not_earned`, 본인이 아니면 `404` |

두 프로필 경로는 로그인이 필요하다(비로그인 `401`). 다른 사용자의 프로필을 보는 경로는 없다.

### 대시보드에서 업적과 앨범 관리

- 업적 추가: `achievements` 에 행을 만든다. `key` 는 `^[A-Z][A-Z0-9_]*$`, 이름 3개는 필수다. 종류(`kind`)별로 채울 칸은 아래와 같고, 맞지 않으면 저장이 틀린 칸의 오류로 막힌다. 종류가 쓰지 않는 칸은 무시된다.

  | kind | 필요한 칸 | 허용 표식(`mark`) |
  |---|---|---|
  | `plays` | `target` 1 이상 | 없음 |
  | `songs` | `target` 1 이상, `mark` | `clear` |
  | `charts` | `target` 1 이상, `mark`(`difficulty` 는 비우면 전체, 또는 `expert`) | `clear`, `s`, `fc`, `ap` |
  | `songMarks` | `target` 1 이상, `mark` | `clear`, `s`, `fc`, `ap` |
  | `zodiacVisits` | `target` 1 이상, `mark` | `clear`, `s`, `fc`, `ap` |
  | `zodiacComplete` | `mark`, `zodiac` | `clear`, `s`, `fc`, `ap` |
  | `zodiacCompletions` | `target` 1 이상 | 없음 |
  | `album` | `mark`, `album` | `clear`, `s`, `fc` |

  `category` 가 `album` 이면 `kind` 도 `album` 이어야 하고 그 반대도 같다.
- 앨범 추가: `albums` 행을 만들고, 곡의 `album` 을 그 앨범으로 연결한 뒤, 그 앨범의 CLEAR, S, FC 업적 3행을 직접 추가한다(자동으로 생기지 않는다).
- 업적은 지우지 말고 `retired` 로 은퇴시킨다. 은퇴 업적은 판정과 진행률에서 빠지지만 획득 기록과 대표 업적은 남는다.
- `key` 는 저장 뒤 바꾸지 않는다. 획득 기록과 대표 업적이 key 로 연결된다.
- 세트(`achievementSet`)의 활성 업적을 모두 은퇴시키지 않는다. 비는 세트가 있으면 프로필을 열 수 없다.
- 순서는 `sortOrder` 가 작은 값이 앞이고, 같으면 `key` 순이다.
- 플레이어 화면은 부팅 때 정의를 한 번 읽으므로, 변경은 새로고침한 뒤 보인다.

### 소급과 집계 시작 시점

- `1792900900_backfill_achievement_marks.js` 는 적용 시점의 `scores` 최고 기록에서 증명되는 mark 만 `achievement_marks`(지금 이름 `earned_chart_marks`, source `backfill`, 별자리 빈 값)로 옮긴다. 업적은 지급하지 않고, 그 사용자의 다음 프로필 조회나 다음 제출의 평가가 지급한다.
- 플레이 횟수(FIRST_FINISH, PLAY 계열)와 황도 순례는 소급하지 않는다. `play_results` 는 이 기능을 배포한 뒤 검증된 판부터 쌓이므로, 총 플레이 횟수는 배포 시점부터 센다.
- `1792901000_add_users_profile_fields.js` 는 기존 사용자마다 `과즙이` + 4자리 숫자 기본 닉네임을 채운 뒤 `nickname` 을 필수로 바꾼다. 새 계정은 `users.pb.js` 훅이 저장 전에 같은 규칙으로 채운다. 4자리가 모두 쓰인 뒤에만 자릿수가 늘어난다.
- 되돌릴 때는 파일 이름 역순으로 down 한다. 닉네임 마이그레이션 down 은 두 필드와 인덱스, 규칙 불변식을 지우고, 소급 down 은 `backfill` 증거만 지운다. `1793152800_allow_users_profile_updates.js` down 은 두 필드의 직접 변경 금지 조건을 users 업데이트 규칙에 다시 덧붙인다.

### 오토플레이 의심 표시

결과 제출 훅이 검증을 통과한 판마다 입력 통계를 계산해 `play_results` 행에 같은 저장으로 남긴다. `suspicious` 판은 검토 대기(`reviewStatus = pending`)로 저장되어 승인 전까지 최고 점수, 랭킹, 채보 도장, 업적, 플레이 횟수에 반영되지 않는다(아래 "플레이 검토와 랭킹"). 플레이어 API 로는 볼 수 없고 대시보드와 검토 API 로만 본다.

| 필드 | 값 |
|---|---|
| `autoplayCheck` | `unjudged`(표본 50개 미만이라 판정 안 함), `clear`(사유 없음), `suspicious`(사유 하나 이상) |
| `autoplayReasons` | `suspicious` 일 때 걸린 사유(순서 의미 없음). `low_std_dev`: 오차 표준편차 2ms 이하, `zero_cluster`: ±1ms 안 표본 비율 0.5 이상, `synced_chords`: 동시 노트 묶음 10개 이상이고 묶음 안 입력 간격 1ms 이하 묶음 비율 0.95 이상. 그 밖에는 빈 값 |
| `inputStats` | 판정 결과와 관계없이 아래 여섯 값. 숫자는 반올림하지 않는다 |

`inputStats` 의 키(오차 = 입력 시각 − 노트 시각, press 로 판정된 tap 과 hold 시작만 표본이다. miss 와 hold 끝은 넣지 않는다):

- `sampleCount`: 표본 수
- `chordCount`: 같은 시각의 노트 중 press 로 판정된 것이 2개 이상인 묶음 수
- `meanOffsetMs`: 오차 평균(부호 있음, 음수면 일찍 누름). 단독 사유로 쓰지 않는다
- `stdDevMs`: 오차의 모표준편차
- `nearZeroRatio`: |오차| ≤ 1ms 인 표본 비율
- `syncedChordRatio`: 묶음 안 입력 시각의 최댓값 − 최솟값 ≤ 1ms 인 묶음 비율

`null` 은 표본이 없어 정의되지 않는 값이다. `sampleCount` 가 0 이면 `meanOffsetMs`, `stdDevMs`, `nearZeroRatio` 가, `chordCount` 가 0 이면 `syncedChordRatio` 가 `null` 이다.

- 대시보드 필터 예: `autoplayCheck = 'suspicious'`, `autoplayReasons ?= 'synced_chords'`.
- 임계값과 최소 표본 수는 `pocketbase/lib/session/service/verify.ts` 의 `AUTOPLAY_THRESHOLDS` 에 모여 있다. 처음 값이며 쌓인 `inputStats` 를 보고 다시 정한다.
- 이 마이그레이션을 되돌리면 세 필드와 그 값이 지워진다. 행과 다른 필드는 남는다.

## 계정 삭제와 재가입 차단

### 동작 요약

- 로그인한 사용자는 `DELETE /api/dazbeat/account` 로 자기 계정을 지운다. 한 트랜잭션에서 사용자의 Google 연결로 차단 행을 저장하고, users 레코드를 지운다. 종속 기록(점수, 플레이 결과, 세션, 세션 발급 제한, 마크, 업적)과 외부 인증 연결은 PocketBase cascade 로 함께 지워진다. 성공은 `204` 다.
- 서버 전용 컬렉션 `deleted_account_identities` 에는 `provider`, `identityDigest`(`HMAC-SHA256(키, "<provider>:<Google sub>")` 의 hex), `keyId`(키 지문), `deletedAt` 만 저장한다. 이메일, 닉네임, 원래 Google ID, PocketBase 사용자 ID 는 저장하지 않는다. 행은 가명처리 개인정보로 다룬다. API 규칙은 모두 `null` 이라 superuser 와 훅만 읽고 쓴다.
- Google OAuth 인증(기존 로그인, 이메일로 기존 계정에 연결, 신규 가입)은 `e.next()` 전에 같은 트랜잭션에서 차단 목록을 확인한다. 차단된 Google 계정은 계정, 연결, 토큰 없이 거절된다.
- 거절 응답(`{ status, code, message }`):

| code | status | 상황 |
|---|---|---|
| `rejoin_block_unavailable` | 503 | 키 설정이 무효이거나, 설정에 없는 키로 만든 차단 행이 있음 |
| `account_identity_missing` | 409 | 삭제할 사용자에게 Google 연결이 없거나, OAuth 사용자 ID 가 비어 있음 |
| `account_not_found` | 404 | 같은 사용자의 삭제가 먼저 끝남(동시 요청) |
| `account_rejoin_blocked` | 403 | 탈퇴한 Google 계정의 OAuth 인증 |
| `external_auth_locked` | 403 | superuser 가 아닌 사용자의 `_externalAuths` 연결 삭제 |

- 마이그레이션 `1794103200_add_account_deletion.js` 가 users 규칙을 바꾼다.
  - `deleteRule` 이 `null` 이 된다. 표준 users 삭제 API 는 차단 행 없이 지우는 우회라 닫는다. superuser 대시보드 삭제는 운영자 작업으로 남는다(차단 행은 남지 않는다).
  - `createRule` 에 `@request.context = "oauth2"` 가 붙는다. 이메일·비밀번호 직접 가입은 `400` 으로 막히고, 가입은 Google OAuth 로만 된다.
  - 사용자는 자기 Google 연결을 해제할 수 없다(`external_auth_locked`).
- 테스트 계정은 superuser 로 만든다. 관리 UI 나 superuser 로 인증한 API 로 users 레코드를 만들고, 그 계정은 비밀번호로 로그인한다(`passwordAuth` 는 켜 둔다). 이 계정에는 Google 연결이 없어 계정 삭제는 `409 account_identity_missing` 이다.
- 브라우저에 저장된 로컬 기록과 설정은 계정 삭제로 지워지지 않는다.
- 운영자 검토 이력 `play_reviews`(아래 "플레이 검토와 랭킹")는 감사 목적으로 계정 삭제 뒤에도 남긴다(사용자 결정). 지워진 판의 id(`playResult`)와 결정, 심사자, 사유만 담고 users 를 가리키지 않아, 판이 지워진 뒤에는 그 행으로 사용자를 찾을 수 없다.

### 키 생성과 설정

| 변수 | 설명 |
|---|---|
| `DAZBEAT_REJOIN_BLOCK_HMAC_KEY` | 현재 키. 새 차단 행은 이 키로 만든다. 앞뒤 공백을 뗀 뒤 32자 이상 |
| `DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS` | 은퇴 키 목록, 쉼표 구분. 각 항목 32자 이상, 빈 항목은 무시한다. 없으면 빈 값 |

1. `openssl rand -hex 32` 로 키(64자 hex)를 만든다. 키는 서버 전용 비밀값이라 저장소·문서·로그에 적지 않는다.
2. 로컬: `.env` 에 두 변수를 넣고 `docker compose up -d` 로 컨테이너를 다시 만든다(`restart` 는 바뀐 환경변수를 읽지 않는다). `docker-compose.yml` 이 `.env` 에서 받아 넘긴다.
3. PocketHost: 인스턴스 Secret 에 두 변수를 넣고 인스턴스를 재시작한다.
4. 키 없이 띄우거나 키가 짧거나 은퇴 목록에 짧은 항목이 있으면 모든 Google 로그인과 계정 삭제가 `503 rejoin_block_unavailable` 이다. 차단 확인 없이 가입시키지 않기 위한 의도된 안전 실패다.

### 키 회전

1. 새 키를 만든다.
2. 지금의 현재 키를 `DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS` 에 더하고, 새 키를 `DAZBEAT_REJOIN_BLOCK_HMAC_KEY` 에 넣는다.
3. 재시작한다. 이후 새 차단 행은 새 키의 `keyId` 로 저장되고, 옛 키로 막힌 계정은 은퇴 키로 계속 막힌다.
4. 은퇴 키는 그 키의 `keyId` 행이 하나라도 남아 있는 한 계속 보관한다. 원래 Google ID 를 보관하지 않으므로 옛 행을 새 키로 다시 계산하는 절차는 없다.

### 키 분실과 복구

- 차단 행의 `keyId` 가 현재 키와 은퇴 키 어느 지문과도 맞지 않으면 그 행을 확인할 수 없다. 이때 서버는 새 키로 조용히 넘어가지 않고 모든 Google 로그인과 계정 삭제를 `503 rejoin_block_unavailable` 로 거절한다. 은퇴 키를 목록에서 빼거나 키를 잘못 바꿔도 같다.
- 복구는 원래 키를 현재 키나 은퇴 목록에 되돌리고 재시작하는 것이다.

### 배포 순서

1. 위 "PocketHost 배포" 절차로 서버(마이그레이션, 훅, `npm run build:hooks` 산출물)를 올리기 전에 Secret 두 변수를 넣는다. Secret 없이 서버를 올리면 그 사이 모든 Google 로그인이 `503` 이다.
2. 재시작 뒤 관리 UI 에서 `deleted_account_identities` 컬렉션과 users 의 두 규칙을 확인한다.
3. 그 뒤 클라이언트를 배포한다. 이전 클라이언트는 계정 삭제 진입점이 없을 뿐 그대로 동작한다.
4. 마이그레이션 down 은 차단 컬렉션을 지우고 users 두 규칙을 원래 값으로 되돌린다. 규칙이 예상과 다르면 추측해서 고치지 않고 실패한다.

### 운영 적용 전 승인 필요 항목

아래 항목은 코드로 정할 수 없다. 승인되기 전에는 운영에 적용하지 않는다. 코드 구현이 끝났다는 것이 승인이나 배포가 끝났다는 뜻은 아니다.

- [ ] 탈퇴 뒤에도 가명 식별자(`identityDigest`)를 기한 없이 보존하는 목적과 기간의 고지, 그리고 그 적법성
- [ ] 계정 삭제 팝업과 개인정보 처리 안내의 고지 문구
- [ ] 삭제 예외(차단 행 보관, 운영자 검토 이력 `play_reviews` 보관, 운영자 대시보드 삭제)의 근거
- [ ] 키 보관, 복구, 회전의 책임자와 보관 장소
- [ ] 운영 DB 백업(아래 "백업·복구")과 이 기능을 되돌릴 때의 롤백 방안

## 플레이 검토와 랭킹

### 검토 상태

- `play_results.reviewStatus`: `approved`(순위와 업적에 반영됨), `pending`(검토 대기), `rejected`(반려). 제출 때 `clear`·`unjudged` 는 바로 승인, `suspicious` 는 대기다.
- `play_results.achievedAt` 은 달성 시각, `play_results.reviewNote` 는 운영자가 적는 결정 사유다.
- `scores` 는 승인된 최고 점수만 담고 API 규칙이 모두 `null` 이다. 랭킹은 `GET /api/dazbeat/leaderboards/{chartId}`, 내 플레이 곡 순위는 `GET /api/dazbeat/profile/rankings` 로만 본다.
- `play_reviews` 는 관리자 결정 한 건마다 한 행(결정, 심사자 id 와 이메일, 사유, 시각)인 서버 전용 감사 이력이다. 한 플레이에 결정은 하나다.

### 배포 순서

1. 수동 백업을 만들고 내려받는다("백업·복구").
2. `npm run build:hooks` 로 서버 번들을 만든다.
3. 마이그레이션(`1794016800_add_play_reviews.js`, `1794016900_review_existing_plays.js`, `1794362400_add_review_note.js`)과 hook 을 올리고 재시작한다("PocketHost 배포" 절차). 서버를 먼저 배포한다.
4. 클라이언트를 배포한다.

3 과 4 사이에는 옛 클라이언트가 새 제출 응답(`bestScore` 없음, `review` 추가)을 읽지 못해 "기록 저장 확인 불가" 안내를 띄울 수 있다. 기록 자체는 서버에 저장된다. 이 창을 짧게 하려고 서버 배포 직후 클라이언트를 배포한다.

### 이관 확인

`1794016900_review_existing_plays.js` 는 기존 판에 검토 상태를 채우고(`suspicious` 만 대기), 승인 판으로 `scores` 를 다시 만들고, 대기 근거로만 증명되던 채보 도장을 뺀다. 배포 전후에 관리 UI 에서 아래 수를 기록해 비교한다.

| 항목 | 대시보드 필터 |
|---|---|
| 상태별 `play_results` 수 | `reviewStatus = 'approved'`, `reviewStatus = 'pending'` |
| `scores` 수 | 필터 없음 |
| 뺀 채보 도장 수 | 배포 전후 `earned_chart_marks` 전체 수의 차이 |

- 승인 판 수 + 대기 판 수 = 배포 전 `play_results` 수이고, `reviewStatus = 'pending'` 수 = 배포 전 `autoplayCheck = 'suspicious'` 수다.
- `scores` 는 판으로만 다시 만들어, 같은 사용자, 채보, 점수의 판이 없는 `scores` 행은 사라진다. 운영에는 그런 행이 없음을 확인했다.

### 롤백

순서는 클라이언트 → hook → 마이그레이션 down(`1794362400`, `1794016900`, `1794016800` 순)이다. 데이터 down 은 이전 코드가 읽을 수 있는 상태만 만든다.

- 대기 판이 자기 revision 의 최고보다 높으면 `scores` 에 반영하고, 대기 판이 증명하는 채보 도장을 다시 만든다.
- 반려 결정, 감사 이력, 승인으로 바뀐 최고 점수 같은 이관 뒤 변화는 정확히 되돌리지 않는다. 정확한 원상태가 필요하면 1 단계의 백업을 복구한다("복구").

### 검토 절차

PocketBase 대시보드(`<서버 URL>/_/`)에 superuser 로 로그인해 `play_results` 를 고쳐 결정한다. 별도 도구나 비밀값 설정은 없다.

1. `play_results` 에 `reviewStatus = 'pending'` 필터를 걸고 `created` 순으로 본다.
2. 판을 열어 점수, 판정 수(`counts`), 오토플레이 판정과 사유(`autoplayCheck`, `autoplayReasons`), 입력 통계(`inputStats`)를 확인한다.
3. `reviewStatus` 를 `approved` 나 `rejected` 로 바꾸고 `reviewNote` 에 사유를 적어 저장한다. 반려는 사유가 필수다(1~500자).

- 저장하면 hook 이 한 트랜잭션에서 결정을 `play_reviews` 에 남기고(심사자는 로그인한 superuser), 승인이면 그 판의 revision 에 최고 점수와 도장, 업적, 플레이 횟수를 반영한다.
- `pending` 에서 결정으로 바꾸는 것만 받는다. 이미 결정된 판의 상태나 사유를 바꾸면 `409 already_reviewed`, `pending` 으로 되돌리면 `400 invalid_review_status` 로 거절한다. 검토 필드를 건드리지 않은 수정은 그대로 저장된다.
- 결정 이력은 `play_reviews` 를 `created` 역순으로 본다. 판이 계정 삭제로 지워져도 이력은 남는다.

### 업적 보존 정책

의심 판 때문에 이미 지급된 업적과 곡 도장은 어느 판 때문에 지급됐는지 연결이 없어 이관에서 지우지 않는다. 플레이 횟수(`reviewStatus = 'approved'` 인 판 수)와 채보 도장 진행도는 승인 근거만 반영한다.

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

## 쿼리 플래너 통계

PocketBase 가 주기적으로 돌리는 `PRAGMA optimize` 는 그 연결에서 조회한 테이블만 다시 분석해, 행 수가 크게 바뀐 테이블의 `sqlite_stat1` 이 낡은 채 남을 수 있다. 낡은 통계에서는 플래너가 인덱스 대신 테이블 전체를 훑는다(예: 랭킹 상위 목록이 행마다 `users` 전체를 읽음). `pb_hooks/dbOptimize.pb.js` 가 매일 UTC 19:00(KST 04:00)에 `PRAGMA analysis_limit=1000` 과 `PRAGMA optimize=0x10002` 로 모든 테이블을 확인하고, 행 수가 크게 바뀐 테이블만 다시 분석한다. 쓰기 연결에서 돌아 그동안 쓰기 요청이 잠깐 줄을 선다.

## 보안 한계

- 서버 리플레이 재계산은 점수·판정 숫자 위조와 비정상 요청을 줄이지만, 완벽하게 조작된 입력 타임라인이나 자동 플레이를 사람의 플레이와 구별하지 못한다. 완전한 안티치트가 아니다.
- CORS 는 브라우저만 지키는 정책이다. curl·스크립트·봇은 Origin 을 생략하거나 위조할 수 있으므로 Origin 검사로 직접 HTTP 요청을 막았다고 보지 않는다. 실제 보호는 API Rules·인증·rate limit 이다.
- `users` 의 이메일/비밀번호 직접 가입은 막혀 있고, 가입은 Google OAuth 로만 된다(`1794103200_add_account_deletion.js`, 위 "계정 삭제와 재가입 차단"). 다만 Google 계정을 여러 개 쓰면 계정도 여러 개 만들 수 있어, 여러 계정을 이용한 랭킹 남용 위험은 남는다. 탈퇴한 Google 계정의 재가입 차단은 그 Google 계정만 막고 같은 사람의 다른 계정은 막지 않는다.
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
