import ts from 'typescript';
import tseslint from 'typescript-eslint';

// 피처 리뷰에서 반복된 conventions.md 위반만 따로 검사한다. 기존 코드에 위반이 남아 있어
// eslint.config.mjs 에 넣으면 npm run lint 가 깨지므로, 변경 파일만 보는 빠른 검사(scripts/convention-check.sh)가 쓴다.

const BOOLEAN_NAME = /^(is|has|can)[A-Z0-9]|^(IS|HAS|CAN)_/;
const BARE_UNIT_NAMES = new Set(['time', 'offset', 'duration', 'size']);
// PocketBase 컬렉션과 API 응답이 이름을 정한 필드. 그 값을 받는 타입 필드도 같은 이름을 쓴다.
const SCHEMA_BOOLEAN_FIELDS = new Set(['cleared', 'retired', 'available']);

// 타입 서명의 매개변수 이름은 값을 묶지 않으므로 실제 함수만 본다.
const FUNCTION_SELECTOR = 'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression';

// 이 코드가 이름을 정한 선언만 모은다. 객체 리터럴의 키와 이름을 바꾸지 않은 구조 분해는
// 값을 받는 쪽(외부 API 옵션 등)이 이름을 정하므로 뺀다.
function collectBindings(pattern, found = []) {
  if (pattern === null) {
    return found;
  }
  if (pattern.type === 'Identifier') {
    found.push(pattern);
  } else if (pattern.type === 'AssignmentPattern') {
    collectBindings(pattern.left, found);
  } else if (pattern.type === 'RestElement') {
    collectBindings(pattern.argument, found);
  } else if (pattern.type === 'TSParameterProperty') {
    collectBindings(pattern.parameter, found);
  } else if (pattern.type === 'ArrayPattern') {
    pattern.elements.forEach((element) => collectBindings(element, found));
  } else if (pattern.type === 'ObjectPattern') {
    pattern.properties.forEach((property) => {
      if (property.type === 'RestElement') {
        collectBindings(property.argument, found);
      } else if (!property.shorthand) {
        collectBindings(property.value, found);
      }
    });
  }
  return found;
}

function isFunctionValue(node) {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

function declaredNames(visit) {
  const visitParams = (node) =>
    node.params.forEach((param) =>
      collectBindings(param).forEach((id) => visit(id, 'value', undefined)),
    );
  const visitMember = (node) => {
    if (node.computed || node.key.type !== 'Identifier') {
      return;
    }
    if (node.type === 'MethodDefinition' || node.type === 'TSMethodSignature') {
      if (node.kind === 'method' && node.override !== true) {
        visit(node.key, 'function', node);
      } else if (node.kind === 'get') {
        visit(node.key, 'getter', node);
      }
      return;
    }
    visit(node.key, isFunctionValue(node.value) ? 'function' : 'value', node);
  };
  return {
    VariableDeclarator: (node) => {
      if (node.id.type === 'Identifier' && isFunctionValue(node.init)) {
        visit(node.id, 'function', node);
        return;
      }
      collectBindings(node.id).forEach((id) => visit(id, 'value', node));
    },
    FunctionDeclaration: (node) => {
      if (node.id !== null) {
        visit(node.id, 'function', node);
      }
    },
    [FUNCTION_SELECTOR]: visitParams,
    'MethodDefinition, TSMethodSignature, PropertyDefinition, TSPropertySignature': visitMember,
  };
}

function isBoolean(type) {
  const members = (type.isUnion() ? type.types : [type]).filter(
    (member) => (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0,
  );
  return (
    members.length > 0 && members.every((member) => (member.flags & ts.TypeFlags.BooleanLike) !== 0)
  );
}

const booleanName = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      value:
        "Boolean '{{name}}' must be named isX, hasX or canX (conventions.md 5.4: 이 코드가 이름을 정하는 Boolean 값은 `isX`·`hasX`·`canX`).",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    const getType = (node) => checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
    return declaredNames((id, kind, owner) => {
      if (BOOLEAN_NAME.test(id.name)) {
        return;
      }
      if (owner?.type === 'TSPropertySignature' && SCHEMA_BOOLEAN_FIELDS.has(id.name)) {
        return;
      }
      // 함수 이름은 보지 않는다. 동작하고 결과를 알려 주는 함수(handleKey, commit)와 조회 함수를 타입으로 가를 수 없다.
      if (isBoolean(getType(kind === 'getter' ? owner : id))) {
        context.report({
          node: id,
          messageId: 'value',
          data: { name: id.name },
        });
      }
    });
  },
};

const bareUnitName = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      bare: "'{{name}}' alone is not allowed; put the unit or meaning in the name, as in timeoutMs, widthPx or sizeBytes (conventions.md 5.4: `time`·`offset`·`duration`·`size` 단독 금지).",
    },
  },
  create(context) {
    return declaredNames((id) => {
      // 그라디언트 정지점 [offset, color] 같은 단위 없는 비율은 대상이 아닌데 단위 유무를 타입으로 알 수 없어, 튜플을 푼 이름은 보지 않는다.
      if (BARE_UNIT_NAMES.has(id.name) && id.parent.type !== 'ArrayPattern') {
        context.report({
          node: id,
          messageId: 'bare',
          data: { name: id.name },
        });
      }
    });
  },
};

// 테스트에서 arr[i]?.resolve() 나 arr[i]?.() 처럼 결과를 버리는 선택 호출은 대상이 없어도 조용히 지나간다.
const requiredTestCall = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      skipped:
        'This call is skipped silently when the element is missing; read it with requireDefined first (conventions.md 5.5: 필수 데이터 누락은 optional chaining으로 숨기지 않고 `requireDefined`).',
    },
  },
  create(context) {
    return {
      'ExpressionStatement > ChainExpression > CallExpression, ExpressionStatement > AwaitExpression > ChainExpression > CallExpression':
        (node) => {
          const { callee } = node;
          const element = node.optional ? callee : callee.optional && callee.object;
          if (
            callee.type === 'MemberExpression' &&
            element.type === 'MemberExpression' &&
            element.computed
          ) {
            context.report({
              node,
              messageId: 'skipped',
            });
          }
        },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.agent-work/**',
      '.claude/**',
      '.codex/**',
      'pocketbase/pb_hooks/lib/**',
      'pocketbase/pb_data/**',
      // 위반 예시라 tests/lint/conventionCheck.test.ts 가 직접 검사한다.
      'tests/lint/fixtures/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      dazbeat: {
        rules: {
          'boolean-name': booleanName,
          'bare-unit-name': bareUnitName,
          'required-test-call': requiredTestCall,
        },
      },
    },
    rules: {
      'dazbeat/boolean-name': 'error',
      'dazbeat/bare-unit-name': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'dazbeat/required-test-call': 'error',
    },
  },
  {
    // PocketBase JSVM 이 정한 이름(getBool, offset, time)을 그대로 옮긴 타입 선언이다.
    files: ['pocketbase/lib/jsvm.ts'],
    rules: {
      'dazbeat/boolean-name': 'off',
      'dazbeat/bare-unit-name': 'off',
    },
  },
);
