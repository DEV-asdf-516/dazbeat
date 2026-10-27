# TypeScript conventions

## 1. 기본 스택

- npm, TypeScript, ESM, Node.js LTS(.nvmrc) 기준이다.
- 클라이언트는 Vite + Phaser, 백엔드는 PocketBase(docker-compose, `pocketbase/`)다.
- 운영 코드는 src/에 둔다.
- tsconfig는 NodeNext + verbatimModuleSyntax 기반이다. 상대 경로 import는 런타임에 맞는 .js 확장자를 사용하고 타입 전용 import는 import type으로 쓴다.
- 브라우저/번들러 프레임워크를 도입할 때는 해당 프레임워크에 맞춰 lib, moduleResolution, JSX, 테스트 환경을 함께 변경한다. 현재 설정을 억지로 유지하지 않는다.
- package-lock.json을 유지한다. 의존성 설치는 npm install, 재현 가능한 설치는 npm ci를 사용한다.

## 2. 폴더 구조

### 2.1 `src/` 바로 아래 순수 모듈

여러 도메인 폴더가 import해야 하는 의존성 없는 순수 모듈은 `src/` 바로 아래에 두고, 어느 폴더에서든 import할 수 있다. 서로 외에는 다른 src 폴더·프레임워크·I/O를 import하지 않는다.

- `invariant.ts`: 불변 조건 검사(`requireDefined`). 조회 결과가 없으면 개발 오류인 곳은 직접 `=== undefined` 검사·throw를 쓰지 않고 이 함수를 쓴다. 메시지는 고정 문구 message와 바뀌는 값 subject로 나눠 넘기고, message에 템플릿 문자열을 넘기지 않는다(성공 경로에서도 문자열이 만들어진다).
- `range.ts`: 범위 산술(`clamp`, 거리 `getDistance`, 진행 비율 `getProgress`, 보간 `lerp`, 목록 순환·이동). 비율·보간을 직접 계산하지 않고 이 함수를 쓴다.
- `typeGuards.ts`: `unknown` 값 타입 가드(`isRecord`, `isString`, `isBoolean`, `isFiniteNumber`, 목록 소속 `isOneOf`). 외부 입력을 손으로 파싱할 때 `typeof` 검사를 직접 쓰지 않고 이 함수를 쓴다.
- `json.ts`: 실패를 기본값으로 대체하는 JSON 파싱(`parseJson`, 실패 시 `undefined`). `JSON.parse` 를 try-catch 로 직접 감싸지 않는다.
- `httpStatus.ts`: HTTP 상태 코드(`HTTP_STATUS`). 상태 코드 숫자를 직접 쓰지 않고 이 이름을 쓴다(테스트의 기대값은 외부 계약이라 숫자로 둔다).
- `shallowEqual.ts`: 객체 필드 비교(`isShallowEqual`, 뺄 필드 지정). 같은 두 객체의 필드를 `===` 와 `&&` 로 나열해 비교하지 않고 이 함수를 쓴다.
- `time.ts`: ms↔초 변환(`msToSec`, `secToMs`). 초는 외부 API(YouTube)·초당 속도 설정 경계에서만 쓰고, 변환에 `1000` 을 직접 쓰지 않는다.
- `pbQuery.ts`: PocketBase 필터·정렬·조회 필드 조립(`where`, `sort`, `fields`·`expand` 는 `select`, 비교 `lt`·`gt`·`ne`·`like`, `anyOf`, keyset `after`, 역방향 관계 `backRelation`). 필터·정렬·fields·expand 문자열을 직접 쓰지 않고 이 모듈로 만든다.
- `pbSql.ts`: raw SQL 조각(테이블 이름을 붙인 열 `column`·`columns`, 별칭 `columnAs`, 조인 `join`, 조건 `condition`과 그 비교 `notEqualTo`·`lessThan`·`greaterThan`·`likePattern`·`oneOf`). 이 모듈에 있는 것은 직접 쓰지 않고, 없는 것(`COLLATE`·`GLOB`·FTS `MATCH`·OR 묶음 등)만 raw로 쓴다.
- `pbCollections.ts`: 컬렉션 spec(이름 + 필터·정렬·조회에 쓰는 필드). 새 필드로 조회할 때 여기에 추가한다.

### 2.2 순수·I/O 폴더

- `src/rhythm/`: 판정·점수·노트 위치 등 순수 게임 로직. `src/` 바로 아래 순수 모듈 외의 다른 src 폴더·프레임워크·I/O를 import하지 않는다.
- `src/data/`: 곡·채보 도메인 타입과 런타임 검증. `rhythm/`, `src/` 바로 아래 순수 모듈만 import한다.
- `src/backend/`: PocketBase 호출(인증, 곡·채보 로드). `pocketbase` 패키지는 이 폴더와 진입점(`src/main.ts`)에서만 import한다.
- `src/storage/`: 브라우저 로컬 저장소. `rhythm/`, `i18n/language.ts`, `src/` 바로 아래 순수 모듈만 import한다.
- `src/audio/`: 재생·시간 소스. 화면 문구를 만들지 않고 오류 종류 같은 값만 반환한다(번역은 `game/`에서).

### 2.3 `src/i18n/`

다국어(ko·ja·en).

- `language.ts`는 지원 언어와 브라우저 언어 감지만 담은 순수 모듈로, 어느 폴더에서든 import할 수 있다.
- `i18next` 런타임 import와 인스턴스 생성은 `createI18n.ts`에서만 한다. 인스턴스는 `src/main.ts`에서 만들어 씬에 주입하고, 씬은 `i18n` 타입만 import한다. i18next 전역 기본 인스턴스는 쓰지 않는다.
- 화면에 보이는 문구는 `messages/`에 둔다. `ko.ts`가 키 구조(`Messages`)의 기준이고 `ja.ts`·`en.ts`는 같은 타입을 만족해야 한다.

### 2.4 `src/game/`

Phaser 씬과 UI. `backend/`, `i18n/createI18n.ts`를 직접 import하지 않고, 필요한 데이터·함수·i18n 인스턴스는 `src/main.ts`에서 주입받는다.

- 화면(기능)별 폴더(`main/`, `songSelect/`, `gameplay/`, `result/`, `settings/`, `credits/`, `editor/`)에 씬과 그 화면 전용 상태·위젯을 함께 둔다.
- 여러 화면이 쓰는 것은 공용 위치에 둔다: Phaser 위젯·테마는 `ui/`, 천체 카탈로그·스프라이트는 `celestial/`, Phaser 에 의존하지 않는 앱 공통 모듈(씬 키·전이·계정 등)은 `game/` 바로 아래.
- 한 화면에서만 쓰던 것을 다른 화면도 쓰게 되면 공용 위치로 옮긴다. 다른 화면에 이미 있는 표시(로딩 별 `ui/LoadingStar` 등)는 상수·배치 코드를 복사하지 않고 공용 위젯을 쓴다. 화면 폴더끼리 서로 import하지 않는다.

### 2.5 `pocketbase/`

서버 코드. 클라이언트 번들에 포함되지 않는다.

- `pb_migrations/`: 스키마 마이그레이션. 적용 시점의 스냅샷이라 이후 바뀌지 않으므로, 다른 파일을 import하지 않고 필요한 헬퍼·상수도 파일 안에 둔다.
- `pb_hooks/`: 서버 훅. JSVM 핸들러는 바깥 스코프를 보지 못하므로 헬퍼·`require`를 핸들러 안에서 한다.
- `verification/`: 훅이 쓰는 서버 로직을 순수 TS로 둔다. `src/data`·`src/rhythm`을 import할 수 있고, `npm run build:hooks`가 `pb_hooks/lib/<name>.cjs`로 번들하면 훅이 그 파일을 `require`한다.
- `seed/`: 로컬 개발용 시드.

### 2.6 테스트

- 테스트는 `tests/<src 하위 폴더>/<파일명>.test.ts`로 src 구조를 따른다.

## 3. Phaser 화면 (`src/game/`)

### 3.1 씬 공통

- 번역은 씬에서만 하고, 위젯은 번역된 문자열을 받는다. 게임 키워드인 대문자 영어 라벨(`PLAY`, `FULL COMBO` 등)은 번역하지 않는다.
- 클릭은 pointer up에서 실행한다. pointer down은 드래그·탐색 같은 제스처에만 쓴다.
- Phaser는 씬 인스턴스를 재사용한다. 상태는 `create`에서 다시 설정하고, 외부 리스너는 SHUTDOWN에서 해제한다.

### 3.2 Controller

비동기 I/O·외부 리소스·늦은 결과가 섞인 화면 흐름은 `<화면>Controller`에 둔다. 동기 전이뿐이면 씬이 순수 상태 모듈을 직접 쓴다.

- Controller: Phaser 없이 화면 state를 단독 소유하고(단계가 있으면 phase union, 열림·닫힘뿐이면 생성자에서 열어 객체 수명으로 표현), 판단은 순수 모듈에 맡겨 순서·부수효과만 엮는다. I/O·시계는 deps, 표시·이동은 씬이 구현한 Screen interface로 주입받는다.
- 화면 state: hover 같은 포인터 상태도 화면 state에 둔다. 씬은 그 사본을 필드로 두지 않고, 현재·직전 state를 받아 다시 그린다.
- 씬: Phaser 객체와 입력·update 위임만 맡고, SHUTDOWN에서 `close()`로 늦은 결과를 버린다.

## 4. PocketBase 서버 (`pocketbase/`)

- 집계는 SQL로 읽는다. `pbQuery`의 `where`는 필터 문법이라 SQL에 넣지 않는다.
- SQL은 행을 고르고 묶는 데(조인·조건·정렬·집계)만 쓴다. 문자열 자르기·형 변환·포맷 같은 값 가공은 읽은 뒤 코드에서 한다.
- 서버 전용 컬렉션은 API 규칙을 모두 `null`로 두고 쓰기는 훅으로만 한다. 커스텀 라우트는 `/api/dazbeat/…`, 오류 응답은 `{ status, code(snake_case), message }`.

## 5. 코딩 룰

### 5.1 우선순위

- Correctness > Simplicity > Readability > Testability > Reusability.
- Reusability는 목표가 아니라 결과다. 재사용·확장성을 이유로 추상화를 미리 만들지 않는다. 같은 개념·규칙·변경 이유가 2곳 이상 반복되면 조금씩 다르게 복제하지 말고 차이를 인자나 데이터로 표현해 공통화한다. 모양만 비슷한 코드는 합치지 않고, 공통화가 분기·옵션·콜백을 늘려 읽기 어려워지면 중복을 둔다.
- 새 코드 판단 순서: 기존 함수로 가능한가 → 기존 모듈 책임에 맞는가 → 순수 함수로 가능한가.

### 5.2 타입

- strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes를 유지한다. `// @ts-ignore` 금지. 필요 시 이유를 적은 `// @ts-expect-error <reason>`만 허용한다.
- explicit any 대신 unknown과 타입 좁히기를 사용한다.
- `enum` 대신 union type을 쓴다.
- union 판별 필드는 `kind`(도메인이 정한 `Note.type`·`outcome`은 유지). `undefined`는 파싱·조회 실패, `null`은 의도된 빈 값.

### 5.3 클래스 / 함수 / 모듈

#### Parse, don't validate.

- 외부 입력(JSON·네트워크·저장소)은 타입 단언으로 믿지 않고, 로드 경계에서 유효한 타입으로 파싱한다. 실패도 사용 시점이 아니라 그 경계에서 한다.
- 사용자 입력도 먼저 의미로 해석한 뒤 처리한다.

#### 잘못된 상태는 타입으로 표현할 수 없게 만든다.

- nullable 필드·boolean 조합이나 초기화 전 `null` 대신 종류별 union, 생성 시점에 확정되는 값을 쓴다.
- 여러 조건이 얽혀 갈리는 표시(선택·hover·비활성 등)는 쓰는 곳마다 boolean 식으로 풀지 않고, 한 곳에서 union 하나로 정한 뒤 그 값으로 분기한다.
- 배열 위치나 순번에 의미를 싣지 않는다. 순서를 바꾸면 동작이 조용히 바뀌는 값(단계·심각도·특정 항목 배치 등)은 키나 필드로 데이터에 명시한다.

#### Tell, don't ask.

- 객체든 값이든 종류·상태를 꺼내 바깥에서 분기하지 않고, 그 종류를 만드는 곳이 동작을 담게 해 요청한다.
- 동작이 그 모듈이 의존할 수 없는 계층(프레임워크 표시 등)에 있으면 그 계층이 분기한다.

#### 상태 없는 로직은 함수로 쓴다.

- 클래스는 **지속 상태, 리소스 lifecycle, 객체 identity**가 있을 때만 쓴다.
- `*Manager`, `*Service`, `*Helper`, `*Util` 같은 범용 이름은 쓰지 않는다. 책임이 여러 개면 분리한다.
- 구현체가 하나면 불필요한 `interface`를 만들지 않는다. 실제 복수 구현, 테스트 대역, 외부 시스템 경계에만 둔다.

#### 함수는 하나의 작업만 한다.

- 의미 없는 미세 분리는 하지 않는다.
- 다른 파일에서 쓰지 않고 한 곳에서만 호출하는 단독 함수는 호출부에 인라인하는 것을 기본으로 한다. 단, 호출부의 분기 하나나 처리 단계 하나를 통째로 맡아 호출부가 한 줄로 위임하고 이름이 그 동작을 설명하면 함수로 둔다. 몇 줄짜리 변환·조건을 감싸기만 하거나 흐름의 중간 일부만 떼어 낸 함수는 인라인한다.
- 인자가 많을 때만 의미 있는 객체로 묶는다. 2~4개 정도는 그대로 둔다.
- 의미 있는 수치만 상수화한다. `0`, `1` 같은 단순 값은 제외한다.

#### 의존성은 한 방향으로 유지한다.

- 도메인 로직은 프레임워크, I/O, 저장소, DOM에 의존하지 않는다.
- 화면 상태의 전이도 프레임워크 밖 순수 함수로 둔다. 프레임워크 코드는 표시와 부수효과만 맡는다.
- 순환 의존, 전역 Singleton, 전역 Event Bus를 금지한다. 객체 조립은 Composition Root에서 한다.
- Named export만 사용한다. default export와 `index.ts` barrel은 쓰지 않고 직접 import한다.
- 파일은 라인 수가 아니라 **독립적인 책임·변경 이유·테스트 이유**를 기준으로 분리한다.

#### mutable state의 source of truth는 하나만 둔다.

- 외부 원본 데이터와 함수 입력은 변경하지 않고 새 값을 반환한다.
- 바뀐 게 없으면 아무것도 하지 않는다. 재계산·다시 그리기·I/O는 입력이 바뀔 때, 바뀐 대상에만 한다. 상태 전이 함수는 바뀐 게 없으면 같은 참조를 반환한다.
- 늦게 올 수 있는 비동기 결과는 시작 시 만든 토큰과 `===`로 비교해 지난 결과를 버린다.

#### 불필요한 일은 처음부터 하지 않는다.

- I/O: 요청 하나에서 같은 데이터를 다시 읽지 않고, 관계를 한 건씩 나눠 읽지 않으며, 쓰지 않는 열·행을 읽지 않는다.
- 계산: hot path에서 반복 parse·전체 순회·대량 객체 생성을 하지 않는다. 같은 입력으로 같은 계산을 반복하면 메모이제이션한다.
- 캐시·풀링처럼 수명과 무효화를 따로 관리해야 하는 최적화만 프로파일링으로 병목을 확인한 뒤 한다.

### 5.4 Naming

- 명명·파일 구조는 인접 코드의 관례를 우선한다. 포맷은 Prettier에 맡긴다.
- 파일: 클래스 중심은 `PascalCase.ts`, 함수 모듈은 `camelCase.ts`.
- 변수/함수 `camelCase`, 클래스/타입 `PascalCase`, 전역 상수만 `UPPER_SNAKE_CASE`.
- Boolean은 `isX`, `hasX`, `canX` 형태로 쓴다.
- 단위가 있는 값은 이름에 단위를 붙인다 (`timeoutMs`, `widthPx`, `sizeBytes`). `time`, `offset`, `duration`, `size` 단독 사용 금지.
- 같은 종류의 값은 코드베이스 전체에서 한 단위로 통일한다 (시간은 ms 등). 단위 혼용 금지.
- 시각은 벽시계면 `…AtMs`, 곡 타임라인 위치면 `…TimeMs`로 구분한다.

### 5.5 오류 / 로그

- 복구 가능한 오류(사용자에게 표시)와 개발 오류(불변 조건 위반)를 구분한다. 후자는 throw한다.
- Result 래퍼(`{ ok }`)는 쓰지 않는다. 필수 입력 파싱은 `Invalid<Thing>Error` throw, 기본값으로 대체 가능한 입력은 `T | undefined` 반환.
- 빈 `catch` 금지. 필수 데이터 누락은 optional chaining으로 숨기지 않고 명시적으로 검증·throw한다(`requireDefined`).
- 선택 리소스 실패는 경고 후 계속하고, 필수 리소스 실패는 진행을 중단한다.
- 비동기 실패를 묵살하지 않는다. Promise는 await 또는 계약에 맞는 오류 처리를 한다. 의도적 fire-and-forget은 `void fn()`으로 표시한다.
- 실패를 로그로만 남기고 계속 진행하는 Promise는 `await`를 try-catch로 감싸지 않고 `.catch((error: unknown) => …)`를 붙인다. try-catch는 동기 호출이나, catch에서 흐름을 바꾸는 경우(반환·중단·상태 전환)에 쓴다.
- `console.log` 커밋 금지. `console.warn`/`console.error`만 진단 목적으로 허용한다.
- throw·로그 메시지는 영어로 쓴다.

### 5.6 주석

- 코드로 명확하게 설명되는 동작은 주석을 달지 않는다.
- 주석은 "무엇"이 아니라 **"왜"**를 설명한다. 막연한 `// TODO` 금지, 구체적 조건을 적는다.
- 주석은 한국어로 쓴다.

## 6. 변경 범위

- 모든 변경 라인은 요청 사항과 직접 연결되어야 한다. 요청하지 않은 리팩터링·폴더 재편·스타일 일괄 변경·인접 코드 "개선"은 하지 않는다. 리팩터링은 현재 변경이 기존 구조 때문에 불가능하거나 중복·오류를 만들 때만 최소 범위로 하고, 그 외는 별도 작업으로 분리한다.
- 내 변경으로 생긴 dead import/변수/함수는 제거한다. 기존 unrelated dead code는 삭제하지 않고 언급만 한다.
- 새 npm package는 직접 구현이 위험/복잡하거나 표준 라이브러리가 있을 때만 추가하고, 이유·대체 가능성·runtime/dev 여부를 명시한다.
- 스킬 스크립트·스키마·훅 변경은 피처의 명시적 범위에 포함된 경우에만 한다.
- 사용자 지시 없이 commit/push/finalize하거나 다른 작업의 변경을 되돌리지 않는다.

## 7. 검증

### 7.1 명령

- 전체 테스트: npm test. 관련 테스트: npm test -- tests/<folder>/<file>.test.ts.
- 타입 검사: npm run typecheck. 린트: npm run lint. 포맷 검사: npm run format:check.
- Vitest는 단발 실행한다. 피처의 unit targeted_test에 해당 기능의 구체적인 테스트 경로를 명시한다.
- 테스트 없는 상태를 성공으로 처리하지 않는다. 테스트 skip, passWithNoTests, 린트/타입 설정 완화로 게이트를 우회하지 않는다.

### 7.2 테스트 작성

- 테스트는 외부 관찰 가능한 합의 동작을 검증한다. 커버리지 숫자·private 상태·내부 호출 횟수만을 위한 테스트는 만들지 않는다. 외부 I/O 횟수가 명시적 계약이면 검증할 수 있다.
- 테스트 대상은 흐름을 소유한 단위다(Controller·Session·화면 상태 모듈·I/O·lifecycle 클래스·backend·서버). 순수 함수·헬퍼 모듈은 단독 테스트하지 않고, 경계값(window ±1, 빈 입력, 최대/최소)도 그 흐름을 거쳐 검증한다.
- 프레임워크 렌더링 자체는 Unit Test하지 않는다.
- 테스트를 위해 export하거나 운영 함수를 따로 빼거나 Production 코드를 추상화하지 않는다. 테스트는 모듈이 공개하는 함수나 클래스 동작을 거쳐 검증한다.
- `vi.mock`은 쓰지 않는다. 대역은 직접 만든 객체로, 시간은 fake timer 대신 값으로 주입한다.

## 8. 안전

- 비밀값은 .env에 보관하고 커밋하지 않는다. `.env`로 읽는 변수는 이름을 .env.example에 값 없이 기록하고, 서버 훅 변수(`DAZBEAT_`)는 docker-compose.yml에서 설정하되 비밀값이면 `.env`에서 받아 넘긴다.
