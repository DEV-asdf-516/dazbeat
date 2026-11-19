#!/usr/bin/env bash
# feature 러너의 FAST_CHECK_CMD 가 리뷰 전에 부른다. 종료 코드는 그 계약을 따른다: 0 위반 없음, 1 규칙 위반, 그 외 실행 오류.
# ESLint 는 위반을 1, 설정·실행 실패를 2 로 내므로 그대로 넘기고, 검사를 시작하지 못한 경우만 여기서 구분한다.
set -u

root="${FAST_CHECK_ROOT:-$(git rev-parse --show-toplevel)}" || exit 2
cd "$root" || exit 2

eslint="node_modules/.bin/eslint"
if [ ! -x "$eslint" ]; then
  echo "convention-check: $eslint not found in $root; run npm ci" >&2
  exit 127
fi

targets=()
if [ -n "${FAST_CHECK_CHANGED_FILES:-}" ]; then
  if [ ! -r "$FAST_CHECK_CHANGED_FILES" ]; then
    echo "convention-check: cannot read FAST_CHECK_CHANGED_FILES=$FAST_CHECK_CHANGED_FILES" >&2
    exit 2
  fi
  while IFS= read -r path || [ -n "$path" ]; do
    case "$path" in
      *.ts) [ ! -f "$path" ] || targets+=("$path") ;;
    esac
  done < "$FAST_CHECK_CHANGED_FILES"
  if [ "${#targets[@]}" -eq 0 ]; then
    echo "convention-check: no changed TypeScript files"
    exit 0
  fi
else
  targets=(.)
fi

"$eslint" --config eslint.fast-check.config.mjs --no-inline-config --no-warn-ignored --max-warnings 0 -- "${targets[@]}"
