# dazbee TypeScript conventions

## 기본 스택

- npm, TypeScript strict, ESM, Node.js 24 LTS 기준이다. React/Next.js 등 제품 프레임워크는 아직 결정하지 않았다.
- 운영 코드는 src/, 별도 테스트는 tests/ 또는 src/**/*.test.ts에 둔다.
- 현재 tsconfig는 NodeNext 기반이다. 상대 경로 import는 런타임에 맞는 .js 확장자를 사용하고 타입 전용 import는 import type으로 쓴다.
- 브라우저/번들러 프레임워크를 도입할 때는 해당 프레임워크에 맞춰 lib, moduleResolution, JSX, 테스트 환경을 함께 변경한다. 현재 설정을 억지로 유지하지 않는다.
- package-lock.json을 유지한다. 의존성 설치는 npm install, 재현 가능한 설치는 npm ci를 사용한다.

## 타입과 구현

- strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes를 유지한다.
- explicit any 대신 unknown과 타입 좁히기를 사용한다. 외부 입력은 타입 단언만으로 신뢰하지 않는다.
- 기존 모듈·타입·함수를 먼저 재사용한다. 요구에 없는 책임 경계·공용 helper·의존성·fallback·retry는 추가하지 않는다.
- 비동기 실패를 묵살하지 않는다. Promise는 await 또는 계약에 맞는 오류 처리를 한다.
- 명명·파일 구조는 인접 코드의 관례를 우선한다. 포맷은 Prettier에 맡긴다.

## 검증

- 전체 테스트: npm test. 관련 테스트: npm test -- tests/<feature>.test.ts.
- 타입 검사: npm run typecheck. 린트: npm run lint. 포맷 검사: npm run format:check.
- Vitest는 단발 실행한다. 피처의 unit targeted_test에 해당 기능의 구체적인 테스트 경로를 명시한다.
- 테스트는 외부 관찰 가능한 합의 동작을 검증한다. 커버리지 숫자·private 상태·내부 호출 횟수만을 위한 테스트는 만들지 않는다. 외부 I/O 횟수가 명시적 계약이면 검증할 수 있다.
- 테스트 없는 상태를 성공으로 처리하지 않는다. 테스트 skip, passWithNoTests, 린트/타입 설정 완화로 게이트를 우회하지 않는다.

## 안전

- 비밀값은 .env에 보관하고 커밋하지 않는다. 공유할 변수 이름은 .env.example에 값 없이 기록한다.
- 스킬 스크립트·스키마·훅 변경은 피처의 명시적 범위에 포함된 경우에만 한다.
- 사용자 지시 없이 commit/push/finalize하거나 다른 작업의 변경을 되돌리지 않는다.
