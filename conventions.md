# TypeScript conventions

## 1. 기본 스택

- npm, TypeScript, ESM, Node.js LTS(.nvmrc). 클라이언트는 Vite + Phaser, 백엔드는 PocketBase(docker-compose, `pocketbase/`). 운영 코드는 `src/`.
- tsconfig는 NodeNext + verbatimModuleSyntax. 상대 import는 `.js` 확장자, 타입 전용은 `import type`.
- 프레임워크를 들일 때는 lib·moduleResolution·JSX·테스트 환경을 그에 맞춰 바꾼다. 현재 설정을 억지로 유지하지 않는다.
- package-lock.json을 유지한다. 설치는 `npm install`, 재현 설치는 `npm ci`.

## 2. 폴더 구조

의존 방향은 `eslint.config.mjs`가 검사한다(7장). 화면 폴더끼리, 도메인 폴더끼리 서로 import하지 않는다.

### 2.1 `src/` 바로 아래 순수 모듈

여러 폴더가 쓰는 의존성 없는 순수 모듈. 어디서든 import할 수 있고, 서로 외에는 아무것도 import하지 않는다. 각 모듈이 맡은 일은 직접 구현하지 않고 그 모듈을 쓴다.

- `invariant.ts` `requireDefined`: 없으면 개발 오류인 조회. `=== undefined` 검사·throw 대신 쓴다. 고정 message와 바뀌는 subject를 나눠 넘기고 message에 템플릿 문자열을 넣지 않는다(성공 경로에서도 만들어진다).
- `range.ts` `clamp`·`getDistance`·`getFraction`·`getProgress`(0~1)·`lerp`·목록 순환·이동: 비율·보간을 직접 계산하지 않는다.
- `typeGuards.ts` `isRecord`·`isString`·`isBoolean`·`isFiniteNumber`·`isOneOf`: 외부 입력 파싱에 `typeof`를 직접 쓰지 않는다.
- `json.ts` `parseJson`(실패 시 `undefined`): `JSON.parse`를 try-catch로 감싸지 않는다.
- `httpStatus.ts` `HTTP_STATUS`: 상태 코드 숫자를 직접 쓰지 않는다(테스트 기대값은 외부 계약이라 숫자).
- `shallowEqual.ts` `isShallowEqual`(뺄 필드 지정): 필드를 `===`·`&&`로 나열해 비교하지 않는다.
- `changedRegions.ts` `filterChangedRegions`: 부분 갱신에 필드 비교 불리언 플래그를 만들지 않는다. 영역 표와 고르기 함수는 상태 모듈에 둔다. 영역은 상태 필드가 아니라 위젯 기준이며 위젯 하나의 남는 모양은 한 영역만 칠하고, 그 위젯이 읽는 값을 모두 적는다. 한 번 재생하는 연출(반짝임·팝)은 연출 영역으로 두고 첫 그림 포함 여부는 상태 모듈이 정한다. 영역 간 그리는 순서에 기대지 않는다.
- `time.ts` `msToSec`·`secToMs`: 초는 외부 API(YouTube)·초당 속도 설정 경계에서만, 변환에 `1000`을 직접 쓰지 않는다.
- `pbQuery.ts` `where`·`sort`·`select`(fields·expand)·`lt`·`gt`·`ne`·`like`·`anyOf`·`after`(keyset)·`backRelation`: 필터·정렬·fields·expand 문자열을 직접 쓰지 않는다.
- `pbSql.ts` `column`·`columns`·`columnAs`: 조인한 dbx 쿼리의 열·조건 이름을 직접 쓰지 않는다.
- `pbCollections.ts`: 컬렉션 spec(이름 + 조회에 쓰는 필드). 새 필드로 조회하면 여기에 추가한다.

### 2.2 순수·I/O 폴더

- `src/rhythm/`: 판정·점수·노트 위치 등 순수 게임 로직. 2.1만 import한다.
- `src/data/`: 곡·채보 타입과 런타임 검증. `rhythm/`, 2.1만 import한다.
- `src/backend/`: PocketBase 호출. `pocketbase` 패키지는 이 폴더와 `src/main.ts`에서만 import한다.
- `src/storage/`: 브라우저 로컬 저장소. `rhythm/`, `i18n/language.ts`, 2.1만 import한다.
- `src/audio/`: 재생·시간 소스. 문구를 만들지 않고 오류 종류 같은 값만 반환한다(번역은 `game/`).

### 2.3 `src/i18n/`

- `language.ts`: 지원 언어와 브라우저 언어 감지만 담은 순수 모듈, 어디서든 import 가능.
- `i18next` import와 인스턴스 생성은 `createI18n.ts`에서만. `src/main.ts`가 만들어 씬에 주입하고 씬은 `i18n` 타입만 import한다. 전역 기본 인스턴스 금지.
- 화면 문구는 `messages/`. `ko.ts`가 키 구조(`Messages`)의 기준이고 `ja.ts`·`en.ts`는 같은 타입을 만족한다.

### 2.4 `src/game/`

Phaser 씬과 UI. `backend/`·`createI18n.ts`를 직접 import하지 않고 `src/main.ts`에서 주입받는다.

- 화면 폴더(`main/`, `songSelect/`, `gameplay/`, `result/`, `settings/`, `credits/`, `editor/`, `profile/`): 바로 아래에 씬과 Controller만, 그리는 것(위젯·텍스처·연출·테마)과 그 자원 수명은 `view/`, Phaser 없는 판단·계산(상태 전이·정책·입력 해석·표시 데이터 집계·레이아웃·appearance)은 `state/`. `state/`는 Phaser·DOM·I/O를 쓰지 않고(주입된 I/O 객체의 메서드 호출, 실행 객체의 수명 관리 포함) Controller·씬·`view/`를 런타임 import하지 않는다. 스스로 시간을 진행하는 도메인 객체(`GameplaySession` 등)는 I/O가 아니다. 여러 층이 함께 쓰는 상태·표현 타입과 순수 입력 해석은 그 값을 만드는 `state/`·`ui/state/`가 소유하고, 타입 전용 역참조는 소유가 뒤집혔거나 순환일 때만 옮긴다.
- 공용: 씬 설정·경로·계정 같은 앱 공통은 `app/`, 천체는 `celestial/{view,state}/`, 그 밖은 `ui/state/`·`ui/view/{widgets,textures,input}/`. 다른 화면도 쓰게 되면 공용으로 옮기고, 이미 있는 공용 위젯(`ui/view/widgets/LoadingStar` 등)은 복사하지 않고 쓴다.

### 2.5 `pocketbase/`

서버 코드. 클라이언트 번들에 들어가지 않는다.

- `pb_migrations/`: 적용 시점 스냅샷이라 다른 파일을 import하지 않고 헬퍼·상수를 파일 안에 둔다.
- `pb_hooks/`: JSVM 핸들러는 바깥 스코프를 보지 못하므로 헬퍼·`require`를 핸들러 안에서 한다. 훅은 요청·이벤트 레코드를 `lib/`에 넘기고 응답만 만든다. 트랜잭션은 그 일을 맡은 쪽이 열고, `e.next()`를 함께 묶을 때만 훅이 연다.
- `lib/`: 훅이 쓰는 서버 로직(순수 TS). `src/data`·`src/rhythm`을 import할 수 있고, `npm run build:hooks`가 `pb_hooks/lib/<경로>.cjs`로 번들하면 훅이 `require`한다. 공용 모듈(`jsvm`, `pbQuery`, `originPolicy`)은 `lib/` 바로 아래.
- `lib/<도메인>/`(`achievement`, `session`, `profile`, `song`): `dto.ts` 요청 파싱·거절 코드·타입, `repository.ts` DB 읽기·쓰기(`read*`·`is*`·`has*`·`save*`·`delete*`, 없으면 거절 대신 `undefined`, dbx 함수 먼저·레코드 API 뒤), `service.ts` 판단과 흐름(repository 결과를 해석·거절하는 `load*`). 일이 여럿이면 `service/<일>.ts`.
- `seed/`: 로컬 개발용 시드.

## 3. Phaser 화면 (`src/game/`)

- 번역은 씬에서만 하고 위젯은 번역된 문자열을 받는다. 대문자 영어 게임 키워드(`PLAY`, `FULL COMBO`)는 번역하지 않는다.
- 클릭은 pointer up에서 실행한다. pointer down은 드래그·탐색 제스처에만.
- Phaser는 씬 인스턴스를 재사용한다. 상태는 `create`에서 다시 설정하고, 외부 리스너는 SHUTDOWN에서 해제하며 `close()`로 늦은 결과를 버린다.
- 판단은 `state/` 순수 함수만 한다. 판단은 의미를 정하는 일이다: 상태 전이, 게임·업무 규칙, 입력·I/O 결과(키 조합·상태·오류)의 의미, 여러 값을 묶은 조건의 의미, 표시 데이터 집계. 수명·늦은 결과·중복 요청 확인, 부수효과 실행, 받은 값으로 표현 고르기는 판단이 아니다. 조건문 유무나 줄 수가 아니라 규칙의 소유와 변경 이유로 가르고, 단순 비교를 옮기려고 래퍼 함수를 만들지 않는다.
- Controller: 화면 state를 단독 소유한다(단계가 있으면 phase union, 열림·닫힘뿐이면 생성자에서 열어 객체 수명으로). state가 정한 대로 부수효과를 순서대로 실행하고 외부 결과를 반영하며(늦은 결과·중복 요청·종료 확인 포함), 결과 종류별 작업을 잇는 `switch`와 자원 상태 `if`를 둘 수 있다. state가 바뀌면 직전·다음 state를 Screen에 넘긴다. I/O·시계는 Controller가 정의한 Ports interface, 표시·이동은 씬이 구현한 Screen interface로 주입받는다.
- 화면 state: 값 하나이고 상태 모듈의 전이 함수로만 바뀐다. 포인터 상태는 그 안의 hover union 하나, 버튼 눌림은 그 항목에 둔다. 숨기거나 닫는 전이에서 그 대상의 hover를 푼다.
- 씬: Phaser 객체, 입력·update 위임, 그리기. 그리기는 받은 값으로 표현 고르기(`switch`·`Record<Union, X>`), 값 하나로 정하는 가시성, 좌표·크기·알파·클리핑 계산, 애니메이션과 리소스 수명이다. 도메인 집계·검증·업무 규칙은 하지 않는다. 직전 state는 상태 모듈 함수에 넘기기만 한다.
- 위젯: 그릴 값만 받아 씬과 같은 범위로 그린다. 필드는 Phaser·DOM 객체, 생성 옵션, 트윈·텍스처·애니메이션 캐시이고 Phaser 객체의 현재 상태는 읽어도 된다. hover·포커스·눌림·선택 같은 화면 state 값이나 직전 state 캐시는 두지 않고, 포인터 이벤트는 컨트롤러에 전하기만 한다. 필드의 readonly·타입·이름이나 대입 위치만으로 위반을 판정하지 않는다.
- 여러 화면에 반복되는 UI(조작 안내 팝업 등)는 같은 규칙만 공용 순수 함수로 두고, 그 결과를 화면 메서드에 잇는 `switch`는 화면마다 둔다.

## 4. PocketBase 서버 (`pocketbase/`)

- dbx 쿼리는 행을 고르고 묶는 데(조인·조건·정렬·집계)만 쓴다. 자르기·형 변환·포맷은 읽은 뒤 코드에서. `pbQuery`의 `where`는 필터 문법이라 dbx에 넣지 않는다.
- 읽기: 고쳐 저장할 레코드나 id 한 건은 레코드 API(`findRecordById`·`findRecordsByFilter`), 레코드가 필요한데(rule 검사 등) 레코드 API로 표현할 수 없으면 `recordQuery`, 값만 읽으면 `app.db().select()` builder를 `selectRows`·`selectRow`로. SQL 문장 문자열 금지. 조건은 `dbx.hashExp`·`dbx.in`·`dbx.not`, dbx에 없는 것(`COLLATE`·`GLOB`·FTS `MATCH`·`LIKE ... ESCAPE`·OR 묶음)만 `dbx.exp`. 같은 조인·조건을 쓰는 조회는 같은 방식으로 쓰고 한 함수로 붙인다.
- 쓰기: 넣기·고치기는 `save`(id·autodate·검증·레코드 훅이 이 경로에서 돈다), 서버 전용 컬렉션 지우기는 `app.db().delete()`.
- 서버 전용 컬렉션은 API 규칙을 모두 `null`로 두고 훅으로만 쓴다. 커스텀 라우트는 `/api/dazbeat/…`, 오류 응답은 `{ status, code(snake_case), message }`.

## 5. 코딩 룰

### 5.1 우선순위

- Correctness > Simplicity > Readability > Testability > Reusability.
- Reusability는 결과다. 재사용·확장성을 위한 선행 추상화를 만들지 않는다. 같은 개념·규칙·변경 이유가 2곳 이상이면 차이를 인자·데이터로 표현해 공통화하고, 모양만 비슷한 코드나 공통화가 분기·옵션·콜백을 늘리는 경우는 중복을 둔다.
- 새 코드 판단 순서: 기존 함수로 가능한가 → 기존 모듈 책임에 맞는가 → 순수 함수로 가능한가.

### 5.2 타입

- strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes 유지. `// @ts-ignore` 금지, 이유를 적은 `// @ts-expect-error <reason>`만.
- `any` 대신 `unknown`과 좁히기. `enum` 대신 union.
- union 판별 필드는 `kind`(도메인이 정한 `Note.type`·`outcome`은 유지). `undefined`는 호출자가 이어 처리하는 파싱·조회 실패, `null`은 의도된 빈 값.

### 5.3 클래스 / 함수 / 모듈

#### Parse, don't validate.

- 검사로 알게 된 사실은 통과한 값의 타입에 남겨 아래 코드가 다시 묻지 않게 한다. 타입에 남길 수 없으면(배열 인덱스) 검사를 한 곳에만 둔다.
- 외부 입력(JSON·네트워크·저장소)은 단언하지 않고 로드 경계에서 파싱하며 실패도 그 경계에서 한다. 사용자 입력도 의미로 해석한 뒤 처리한다.

#### 잘못된 상태는 타입으로 표현할 수 없게 만든다.

- nullable·boolean 조합이나 초기화 전 `null` 대신 종류별 union과 생성 시점 확정 값.
- 여러 조건이 얽힌 표시(선택·hover·비활성)는 쓰는 곳마다 boolean 식으로 풀지 않고 한 곳에서 union 하나로 정해 분기한다.
- 배열 위치·순번에 의미를 싣지 않는다. 순서를 바꾸면 조용히 바뀌는 값(단계·심각도·배치)은 키나 필드로 명시한다.

#### Tell, don't ask.

- 종류·상태를 꺼내 바깥에서 분기하지 않고, 그 종류를 만드는 곳이 동작을 담는다. 동작이 의존할 수 없는 계층(프레임워크 표시)에 있으면 그 계층이 분기한다.

#### 상태 없는 로직은 함수로 쓴다.

- 클래스는 지속 상태·리소스 lifecycle·객체 identity가 있을 때만.
- 이름에 `*Manager`, `*Service`, `*Helper`, `*Util` 금지(계층 파일 이름 `service.ts`는 괜찮다). 책임이 여럿이면 분리한다.
- `interface`는 실제 복수 구현·테스트 대역·외부 시스템 경계에만.

#### 함수는 하나의 작업만 한다.

- 예외·빈 경우는 먼저 반환하고, 결과를 찾으면 바로 반환한다.
- 한 곳에서만 호출하는 함수는 인라인이 기본이다. 호출부의 분기·단계 하나를 통째로 맡아 한 줄 위임이 되고 이름이 동작을 설명할 때만 함수로 둔다. 몇 줄 변환을 감싸거나 흐름 중간만 떼어 낸 함수는 인라인한다.
- 인자 2~4개는 그대로 두고, 많을 때만 의미 있는 객체로 묶는다.
- 의미 있는 수치만 상수화한다(`0`, `1` 제외).

#### 의존성은 한 방향으로 유지한다.

- 도메인 로직과 화면 상태 전이는 프레임워크·I/O·저장소·DOM에 의존하지 않는다. 프레임워크 코드는 표시와 부수효과만.
- 순환 의존·전역 Singleton·전역 Event Bus 금지. 조립은 Composition Root에서.
- Named export만. default export와 `index.ts` barrel 금지.
- 파일 분리 기준은 라인 수가 아니라 독립적인 책임·변경 이유·테스트 이유.

#### mutable state의 source of truth는 하나만 둔다.

- 원본 데이터와 입력은 바꾸지 않고 새 값을 반환한다.
- 바뀐 게 없으면 아무것도 하지 않는다. 재계산·다시 그리기·I/O는 바뀐 대상에만 하고, 전이 함수는 바뀐 게 없으면 같은 참조를 반환한다.
- 늦게 올 수 있는 비동기 결과는 시작 시 만든 토큰과 `===`로 비교해 버린다.

#### 불필요한 일은 처음부터 하지 않는다.

- I/O: 요청 하나에서 같은 데이터를 다시 읽지 않고, 관계를 한 건씩 나눠 읽지 않고, 쓰지 않는 열·행을 읽지 않는다.
- 계산: hot path에서 반복 parse·전체 순회·대량 객체 생성을 하지 않고, 같은 입력의 같은 계산은 메모이제이션한다.
- 수명·무효화를 따로 관리하는 최적화(캐시·풀링)는 프로파일링으로 병목을 확인한 뒤에만.

### 5.4 Naming

- 인접 코드의 관례 우선. 포맷은 Prettier.
- 파일: 클래스 중심 `PascalCase.ts`, 함수 모듈 `camelCase.ts`. 변수/함수 `camelCase`, 클래스/타입 `PascalCase`, 전역 상수만 `UPPER_SNAKE_CASE`. Boolean은 `isX`·`hasX`·`canX`.
- 단위가 있는 값은 이름에 단위(`timeoutMs`, `widthPx`, `sizeBytes`). `time`·`offset`·`duration`·`size` 단독 금지. 같은 종류 값은 한 단위로 통일(시간은 ms).
- 벽시계 시각은 `…AtMs`, 곡 타임라인 위치는 `…TimeMs`.

### 5.5 오류 / 로그

- 복구 가능한 오류(사용자에게 표시)와 개발 오류(불변 조건 위반, throw)를 구분한다. 필수 데이터 누락은 optional chaining으로 숨기지 않고 `requireDefined`.
- Result 래퍼(`{ ok }`) 금지. 거절은 경계 모듈이 코드를 정한다: 해석은 `Invalid<Thing>Error`로 던지고 판단은 `kind` union으로 돌려주며, 상태는 코드별 표 한 곳, 메시지는 그 경계 모듈이 정하고 훅은 응답으로 바꾸기만 한다. 기본값·화면 상태로 계속 진행하는 해석만 `T | undefined`.
- 선택 리소스 실패는 경고 후 계속, 필수 리소스 실패는 중단. 빈 `catch` 금지.
- Promise는 await하거나 계약에 맞게 처리한다. fire-and-forget은 `void fn()`. 로그만 남기고 계속 가는 경우는 `.catch((error: unknown) => …)`, try-catch는 동기 호출이나 catch에서 흐름을 바꾸는(반환·중단·상태 전환) 경우에만.
- `console.log` 커밋 금지, `console.warn`/`console.error`만. throw·로그 메시지는 영어.

### 5.6 주석

- 코드로 설명되는 "무엇"은 쓰지 않고 "왜"만 한국어로 쓴다. 막연한 `// TODO` 금지, 구체적 조건을 적는다.

## 6. 변경 범위

- 모든 변경 라인은 요청과 직접 연결된다. 요청하지 않은 리팩터링·재편·스타일 변경·인접 코드 개선은 하지 않고, 리팩터링은 현재 변경이 기존 구조 때문에 불가능하거나 중복·오류를 만들 때만 최소로 한다.
- 내 변경으로 생긴 dead import/변수/함수는 제거하고, 기존 dead code는 삭제하지 않고 언급만 한다.
- 새 npm package는 직접 구현이 위험·복잡하거나 표준 라이브러리가 있을 때만, 이유·대체 가능성·runtime/dev 여부를 명시해 추가한다.
- 스킬 스크립트·스키마·훅 변경은 피처의 명시적 범위에 있을 때만.
- 사용자 지시 없이 commit/push/finalize하거나 다른 작업의 변경을 되돌리지 않는다.

## 7. 검증

- 명령: `npm test`(관련 테스트 `npm test -- tests/<folder>/<file>.test.ts`), `npm run typecheck`, `npm run lint`, `npm run format:check`.
- `eslint.config.mjs`는 2장의 의존 방향(`state/` → Controller·씬·`view/` 런타임 import 포함)과 정확히 판별되는 그리기 규칙(Phaser 파일의 변경 비교 함수 직접 사용, `state/` 타입 객체 필드 쓰기, 위젯의 `state/` 타입 가변 필드)만 검사한다. 이 문서의 해당 규칙을 바꾸면 함께 고치고, 판별할 수 없는 책임 판단은 리뷰로 본다.
- Vitest는 단발 실행. 피처의 unit targeted_test에 구체적인 테스트 경로를 명시한다.
- 테스트 skip·passWithNoTests·린트/타입 설정 완화로 게이트를 우회하지 않고, 테스트 없는 상태를 성공으로 치지 않는다.
- 테스트는 `tests/<src 하위 폴더>/<파일명>.test.ts`로 src 구조를 따르고, 흐름을 소유한 단위(Controller·Session·화면 상태 모듈·I/O·lifecycle 클래스·backend·서버)의 외부 관찰 가능한 동작을 검증한다. 순수 함수·헬퍼는 단독 테스트하지 않고 경계값도 그 흐름을 거쳐 검증한다. 프레임워크 렌더링은 테스트하지 않는다.
- 커버리지·private 상태·내부 호출 횟수를 위한 테스트는 만들지 않는다(외부 I/O 횟수가 명시적 계약이면 가능). 테스트를 위해 export하거나 운영 코드를 빼거나 추상화하지 않는다.
- `vi.mock` 금지. 대역은 직접 만든 객체, 시간은 값으로 주입한다. fake timer는 브라우저 타이머를 직접 쓰는 I/O 경계(`backend/`·`audio/`·`storage/`) 테스트에만.

## 8. 안전

- 비밀값은 `.env`에 두고 커밋하지 않는다. `.env` 변수 이름은 `.env.example`에 값 없이 기록하고, 서버 훅 변수(`DAZBEAT_`)는 docker-compose.yml에서 설정하되 비밀값은 `.env`에서 받아 넘긴다.
