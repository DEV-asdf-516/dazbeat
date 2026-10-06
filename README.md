# dazbee

프레임워크 선택 전의 TypeScript 개발 설정과 [feature-skill](https://github.com/DEV-asdf-516/feature-skill) 프로젝트 로컬 설치.

## 개발

Node.js 24 LTS를 권장한다(`nvm use`).

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
```

- TypeScript strict / NodeNext ESM, Vitest, 타입 기반 ESLint, Prettier 구성.
- src/와 tests/는 비어 있다. npm test는 테스트가 없으면 실패한다. 기능 구현 시 실제 동작 테스트를 추가한다.
- React/Next.js 등 프레임워크는 설치하지 않았다. 선택 후 TS 모듈 해석·DOM/JSX·테스트 환경을 맞춘다.
- 피처 worktree에서는 node_modules가 복사되지 않으므로 첫 테스트 전에 npm ci를 실행한다.

## feature 파이프라인

Claude Code에서 `피처: <구현 요청>`으로 사용한다. OpenCode도 프로젝트 .claude/skills를 자동 탐색하며, AGENTS.md에서 프로젝트 스킬 경로를 안내한다. 새 세션에서 프로젝트 스킬을 로드한다.

Git은 초기화만 되어 있다. **worktree를 만들기 전에 사용자가 최초 커밋을 승인·생성해야 한다.** 설치 과정에서 커밋·푸시·유료 모델 실행은 하지 않는다.

```bash
bash .claude/skills/feature/scripts/feature-run.sh --feature <id>
```

설정은 .claude/skills/feature/config.sh에서 수정한다.

| 역할      | CLI / 모델          | effort |
| --------- | ------------------- | ------ |
| 설계 수정 | Claude / opus       | medium |
| 명세 검증 | Codex / gpt-6.1-sol | medium |
| 구현      | Claude / opus       | medium |
| 코드 리뷰 | Codex / gpt-6.1-sol | high   |
| 수정      | Claude / sonnet     | high   |

Claude는 최신 모델 별칭, Codex는 설치 당시 로컬 설정에서 확인한 모델을 사용한다. CLI 로그인은 확인했지만 유료 모델 호출로 모델 접근 가능 여부를 검증하지는 않았다.

- TEST_CMD: npm test
- LINT_CMD: npm run typecheck && npm run lint && npm run format:check
- 명세 합의 2라운드, 구현 수정 1회, 테스트 재시도 1회.
- .claude/settings.json과 .codex/hooks.json에 보호 훅이 등록되어 있다. 이 훅은 해당 CLI에 적용되며 OpenCode 자체 훅은 아니다.
- DONE 뒤 원본 반영(finalize) 및 커밋은 별도 사용자 승인 대상이다.

## 업데이트

원본 저장소의 install.sh로 이 디렉터리에 재설치한다. 커스텀 config.sh/core_rules.md는 보존되고 .new 파일이 생기면 직접 병합한다. conventions.md 및 TS 설정은 프로젝트 파일로 유지한다.
