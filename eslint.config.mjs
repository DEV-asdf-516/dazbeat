import { dirname, posix, relative, resolve } from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import ts from 'typescript';

const ROOT = import.meta.dirname;
const SCREEN_FOLDERS = [
  'main',
  'songSelect',
  'gameplay',
  'result',
  'settings',
  'credits',
  'editor',
  'profile',
  'ranking',
  'boot',
];

// conventions.md 2장의 폴더 의존 방향. 경로를 실제 위치로 풀어 비교하므로 폴더를 옮겨도 그대로 맞는다.
function toArea(path) {
  const [top, second, third] = path.split('/');
  if (top === 'pocketbase') {
    return second === 'lib' ? 'pocketbase/lib' : null;
  }
  if (top !== 'src') {
    return null;
  }
  if (third === undefined) {
    return second === 'main.ts' ? 'entry' : 'root';
  }
  if (second === 'game' && SCREEN_FOLDERS.includes(third) && path.split('/').length > 3) {
    return `game/${third}`;
  }
  return second;
}

function getImportViolation(fromPath, targetPath, isTypeOnly) {
  const from = toArea(fromPath);
  const target = toArea(targetPath);
  // language.ts 는 지원 언어만 담은 순수 모듈이라 어느 폴더에서든 import 할 수 있다.
  if (from === null || target === null || targetPath === 'src/i18n/language.ts') {
    return null;
  }
  const allowed = {
    root: ['root'],
    rhythm: ['root', 'rhythm'],
    data: ['root', 'rhythm', 'data'],
    storage: ['root', 'rhythm', 'storage'],
    'pocketbase/lib': ['root', 'rhythm', 'data', 'pocketbase/lib'],
  }[from];
  if (allowed !== undefined && !allowed.includes(target)) {
    return `${from} must not import ${target}`;
  }
  const isGame = from === 'game' || from.startsWith('game/');
  if (isGame && (target === 'backend' || targetPath === 'src/i18n/createI18n.ts')) {
    return 'game receives backend and i18n instances from src/main.ts';
  }
  if (from.startsWith('game/') && target.startsWith('game/') && from !== target) {
    return 'screen folders must not import each other';
  }
  const isGameState = fromPath.startsWith('src/game/') && fromPath.split('/').includes('state');
  if (isGameState && !isTypeOnly && targetPath.startsWith('src/game/')) {
    const segments = targetPath.split('/');
    if (
      segments.includes('view') ||
      (segments.length === 4 && SCREEN_FOLDERS.includes(segments[2]))
    ) {
      return 'state modules must not import Controllers, Scenes or view modules at runtime';
    }
  }
  if (from === 'audio' && target === 'i18n') {
    return 'audio returns values and game translates them';
  }
  if (!isTypeOnly && targetPath.endsWith('/index.ts')) {
    return 'import modules directly instead of index barrels';
  }
  return null;
}

function getPackageViolation(fromPath, name, isTypeOnly) {
  const from = toArea(fromPath);
  if (from === null) {
    return null;
  }
  if (name === 'pocketbase' && from !== 'backend' && from !== 'entry') {
    return 'pocketbase is imported only by src/backend and src/main.ts';
  }
  if (name === 'i18next' && !isTypeOnly && fromPath !== 'src/i18n/createI18n.ts') {
    return 'i18next runtime is created only in src/i18n/createI18n.ts';
  }
  const isPure = ['root', 'rhythm', 'data', 'storage'].includes(from);
  if (isPure && ['phaser', 'pocketbase', 'i18next'].includes(name)) {
    return `${from} must not depend on ${name}`;
  }
  if (name === 'phaser' && from.startsWith('game') && fromPath.split('/').includes('state')) {
    return 'game state modules must not depend on phaser';
  }
  return null;
}

const importBoundaries = {
  meta: {
    type: 'problem',
    schema: [],
  },
  create(context) {
    const fromPath = relative(ROOT, context.filename).split('\\').join('/');
    const check = (node, source, isTypeOnly) => {
      if (typeof source !== 'string') {
        return;
      }
      const message = source.startsWith('.')
        ? getImportViolation(
            fromPath,
            posix.normalize(
              relative(ROOT, resolve(dirname(context.filename), source))
                .split('\\')
                .join('/')
                .replace(/\.js$/, '.ts'),
            ),
            isTypeOnly,
          )
        : getPackageViolation(fromPath, source.split('/')[0], isTypeOnly);
      if (message !== null) {
        context.report({
          node,
          message,
        });
      }
    };
    return {
      ImportDeclaration: (node) =>
        check(
          node,
          node.source.value,
          node.importKind === 'type' ||
            (node.specifiers.length > 0 &&
              node.specifiers.every((specifier) => specifier.importKind === 'type')),
        ),
      ExportNamedDeclaration: (node) => check(node, node.source?.value, node.exportKind === 'type'),
      ExportAllDeclaration: (node) => check(node, node.source.value, node.exportKind === 'type'),
      ImportExpression: (node) => check(node, node.source.value, false),
    };
  },
};

// conventions.md 3장의 씬·위젯 규칙. Phaser 를 import 하는 파일은 화면 state 를 비교하거나 따로 갖거나
// 고치지 않고, state 모듈이 비교해 돌려준 값으로 그리기만 한다.
const COMPARISON_NAMES = new Set(['isShallowEqual', 'filterChangedRegions']);

function isPhaserScene(node) {
  const { superClass } = node;
  return (
    superClass?.type === 'MemberExpression' &&
    superClass.object.type === 'Identifier' &&
    superClass.object.name === 'Phaser' &&
    superClass.property.type === 'Identifier' &&
    superClass.property.name === 'Scene'
  );
}

function getDeclarationFileNames(symbol) {
  return (symbol?.getDeclarations() ?? []).map((declaration) =>
    declaration.getSourceFile().fileName.split('\\').join('/'),
  );
}

// state 폴더가 선언한 타입의 값은 화면 state 다. union 은 구성원 중 하나라도 그러면 화면 state 다.
function isStateType(type) {
  const members = type.isUnion() ? type.types : [type];
  return members.some((member) =>
    getDeclarationFileNames(member.aliasSymbol ?? member.getSymbol()).some(
      (fileName) => fileName.includes('/state/') && !fileName.includes('/node_modules/'),
    ),
  );
}

const paintOnly = {
  meta: {
    type: 'problem',
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const hasPhaserImport = sourceCode.ast.body.some(
      (node) => node.type === 'ImportDeclaration' && node.source.value.split('/')[0] === 'phaser',
    );
    if (!hasPhaserImport) {
      return {};
    }
    const services = sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    const getType = (node) => checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
    const checkTarget = (node, target) => {
      if (target.type !== 'MemberExpression') {
        return;
      }
      for (let object = target.object; ; object = object.object) {
        if (isStateType(getType(object))) {
          context.report({
            node,
            message:
              'Do not write fields of screen state; return a new state from the state module.',
          });
          return;
        }
        if (object.type !== 'MemberExpression') {
          return;
        }
      }
    };
    const checkField = (node, isReadonly, typed) => {
      const classBody = sourceCode
        .getAncestors(node)
        .findLast((ancestor) => ancestor.type === 'ClassBody');
      if (
        classBody === undefined ||
        isPhaserScene(classBody.parent) ||
        isReadonly ||
        !isStateType(getType(typed))
      ) {
        return;
      }
      context.report({
        node,
        message: 'Widgets must not keep screen state values; draw from the values passed in.',
      });
    };
    return {
      CallExpression: (node) => {
        const name = getType(node.callee).getSymbol()?.getName();
        if (
          COMPARISON_NAMES.has(name) &&
          node.arguments.some((argument) => isStateType(getType(argument)))
        ) {
          context.report({
            node,
            message: `Compare state in the screen state module instead of calling ${name}.`,
          });
        }
      },
      PropertyDefinition: (node) => checkField(node, node.readonly === true, node.key),
      TSParameterProperty: (node) =>
        checkField(
          node,
          node.readonly,
          node.parameter.type === 'AssignmentPattern' ? node.parameter.left : node.parameter,
        ),
      AssignmentExpression: (node) => checkTarget(node, node.left),
      UpdateExpression: (node) => checkTarget(node, node.argument),
    };
  },
};

// conventions.md 5.4 이름 규칙과 5.5 테스트 선택 호출. 피처 러너의 빠른 검사(eslint.fast-check.config.mjs)도 같은 규칙을 쓴다.
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
    for (const property of pattern.properties) {
      if (property.type === 'RestElement') {
        collectBindings(property.argument, found);
      } else if (!property.shorthand) {
        collectBindings(property.value, found);
      }
    }
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

export const booleanName = {
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

export const bareUnitName = {
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

const LITERAL_FLAGS =
  ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral;

// 닫혔는지는 타입으로 알 수 없어, 늘어날 union 은 eslint-disable 에 이유를 적어 switch 로 둔다.
export const twoWaySwitch = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      twoWay:
        'Branch on a two-value union with if-else or a ternary (conventions.md 5.3: 뜻이 두 값으로 닫힌 union(있음과 없음, 머묾과 떠남)은 `switch` 대신 if-else나 삼항). If the union will grow, disable this line with the reason.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    return {
      SwitchStatement(node) {
        const type = checker.getTypeAtLocation(
          services.esTreeNodeToTSNodeMap.get(node.discriminant),
        );
        if (
          type.isUnion() &&
          type.types.length === 2 &&
          type.types.every((member) => (member.flags & LITERAL_FLAGS) !== 0)
        ) {
          context.report({
            node: node.discriminant,
            messageId: 'twoWay',
          });
        }
      },
    };
  },
};

// 테스트에서 arr[i]?.resolve() 나 arr[i]?.() 처럼 결과를 버리는 선택 호출은 대상이 없어도 조용히 지나간다.
export const requiredTestCall = {
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

// dbx.exp 는 builder 로 못 만드는 조건 하나만 담는다. 묶기·IN·BETWEEN 은 dbx 함수로 쓰고,
// COLLATE 를 붙인 IN·BETWEEN 은 dbx 가 열 이름째 인용하므로 문자열로 둔다.
// 상관 EXISTS 서브쿼리는 builder 로 만들 수 없어 조건 하나로 친다.
const DBX_EXP = "CallExpression[callee.property.name='exp']";
const EXISTS_SUBQUERY = '[quasis.0.value.raw=/^EXISTS \\(/]';
const SQL_IN_DBX_EXP =
  '/\\bOR\\b|(?<!BETWEEN \\{:\\w+\\} )\\bAND\\b|(?<!COLLATE NOCASE )\\b(IN \\(|BETWEEN\\b)/i';

// 같은 규칙 이름을 여러 블록에 두면 뒤 블록이 덮어쓰므로, 예외 파일마다 그 항목만 뺀 목록을 만든다.
const FOR_EACH_BLOCK_RULE = {
  selector:
    "CallExpression[callee.property.name='forEach'] > :matches(ArrowFunctionExpression, FunctionExpression)[body.type='BlockStatement']",
  message: 'Use for...of when the forEach callback needs a block body.',
};

const SYNTAX_RULES = [
  {
    selector: 'ExportDefaultDeclaration',
    message: 'Use named exports only.',
    exempt: ['*.config.ts'],
  },
  {
    selector: 'TSEnumDeclaration',
    message: 'Use a union type instead of enum.',
  },
  {
    // no-nested-ternary 는 콜백 안으로 숨은 중첩을 보지 못한다.
    selector: 'ConditionalExpression :function ConditionalExpression',
    message:
      'Split the outer ternary into branches instead of nesting a ternary inside its callback.',
  },
  {
    selector:
      "CallExpression[callee.name='clamp'][arguments.length=3][arguments.0.type!='Identifier'][arguments.1.value=0][arguments.2.value=1]",
    message: 'Use getProgress from range.ts for a 0..1 ratio.',
    exempt: ['src/range.ts'],
  },
  {
    selector:
      "BinaryExpression[operator='/'][left.type='BinaryExpression'][left.operator='-'][right.type='BinaryExpression'][right.operator='-']",
    message: 'Use getFraction or getProgress from range.ts for a ratio.',
    exempt: ['src/range.ts'],
  },
  {
    selector: "CallExpression[callee.name='requireDefined'][arguments.1.type='TemplateLiteral']",
    message: 'Pass the changing value as the subject argument, not in a template message.',
  },
  {
    selector:
      "TryStatement > BlockStatement CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
    message: 'Use parseJson from json.ts instead of wrapping JSON.parse in try-catch.',
    exempt: ['src/json.ts'],
  },
  {
    selector:
      "BinaryExpression[operator='/'][right.type='Literal'][right.value=1000], BinaryExpression[operator='*'][right.type='Literal'][right.value=1000][left.name=/Sec/]",
    message: 'Use msToSec or secToMs from time.ts.',
    exempt: ['src/time.ts'],
  },
  {
    selector:
      "IfStatement[test.operator='==='][test.left.type='Identifier'][test.right.type='Identifier'][test.right.name='undefined'] > BlockStatement.consequent[body.length=1] > ThrowStatement > NewExpression[callee.name='Error']",
    message: 'Use requireDefined from invariant.ts.',
    exempt: ['src/invariant.ts'],
  },
  {
    selector:
      "NewExpression[callee.name=/Error$/] > Literal[value=/[가-힣]/], NewExpression[callee.name=/Error$/] > TemplateLiteral > TemplateElement[value.raw=/[가-힣]/], CallExpression[callee.object.name='console'] > Literal[value=/[가-힣]/]",
    message: 'Write throw and log messages in English.',
  },
  {
    selector:
      "CallExpression[callee.object.property.name='add'][callee.property.name=/^(graphics|circle|arc|ellipse|star|polygon|triangle|line|curve|isobox|isotriangle|grid)$/], CallExpression[callee.property.name=/^(setRounded|setStrokeStyle)$/] CallExpression[callee.object.property.name='add'][callee.property.name='rectangle']",
    message:
      'Bake Graphics and path Shapes into a texture instead of adding them to the display list.',
  },
  {
    selector: [
      `${DBX_EXP} > TemplateLiteral:first-child:not(${EXISTS_SUBQUERY}) > TemplateElement[value.raw=${SQL_IN_DBX_EXP}]`,
      `${DBX_EXP} > Literal:first-child[value=${SQL_IN_DBX_EXP}]`,
      `${DBX_EXP} > BinaryExpression:first-child :matches(TemplateElement[value.raw=${SQL_IN_DBX_EXP}], Literal[value=${SQL_IN_DBX_EXP}])`,
    ].join(', '),
    message:
      'Combine conditions with dbx.and, dbx.or, dbx.in or dbx.between; keep dbx.exp for one condition the builder cannot express.',
  },
  FOR_EACH_BLOCK_RULE,
];

const NO_VI_MOCK = {
  object: 'vi',
  property: 'mock',
  message: 'Pass a hand-written double instead of vi.mock.',
};
const NO_FAKE_TIMERS = {
  object: 'vi',
  property: 'useFakeTimers',
  message: 'Inject time as a value instead of fake timers.',
};
const NO_SKIPPED_TESTS = ['describe', 'it', 'test'].flatMap((object) =>
  ['skip', 'skipIf', 'runIf', 'only', 'todo'].map((property) => ({
    object,
    property,
    message: 'Run every test; do not skip, focus or leave tests as todo.',
  })),
);

// state/ 와 순수 모듈은 DOM·I/O·시계를 직접 쓰지 않고 Controller 가 주입한 값으로 계산한다.
const PURE_MODULE_FILES = [
  'src/*.ts',
  'src/rhythm/**/*.ts',
  'src/data/**/*.ts',
  'src/i18n/language.ts',
  'src/game/**/state/**/*.ts',
];
const PURE_MODULE_GLOBAL_MESSAGE =
  'State and pure modules must not use DOM, I/O or the clock; receive values from the caller.';
const PURE_MODULE_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'fetch',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'performance',
].map((name) => ({
  name,
  message: PURE_MODULE_GLOBAL_MESSAGE,
}));

// 서버 lib 의 export 함수 이름은 파일 종류마다 정한 동사로 시작한다.
const LIB_FUNCTION_VERBS = {
  service: [
    'apply',
    'check',
    'consume',
    'decide',
    'delete',
    'evaluate',
    'fill',
    'get',
    'grant',
    'issue',
    'load',
    'pick',
    'record',
    'verify',
  ],
  repository: ['build', 'delete', 'find', 'has', 'is', 'parse', 'read', 'save'],
};
const ROLE_SUFFIX = '(Manager|Service|Helper|Util|Utils)$';

const NO_ROLE_SUFFIX_NAMES = {
  selector: ['class', 'interface', 'typeAlias'],
  format: null,
  custom: {
    regex: ROLE_SUFFIX,
    match: false,
  },
};

// UPPER_SNAKE_CASE 는 전역 상수만 쓴다. 이름을 바꾸지 않은 구조 분해는 값을 준 쪽이 이름을 정한다.
// PascalCase 가 ITEM 같은 대문자 한 단어도 통과시키므로 정규식으로 따로 막는다.
const VARIABLE_NAMES = [
  {
    selector: 'variable',
    modifiers: ['global', 'const'],
    format: null,
  },
  {
    selector: 'variable',
    modifiers: ['destructured'],
    format: null,
  },
  {
    selector: 'variable',
    format: ['camelCase', 'PascalCase'],
    leadingUnderscore: 'allow',
    custom: {
      regex: '^[A-Z][A-Z0-9]+$',
      match: false,
    },
  },
];

function libVerbBlock(files, verbs) {
  // naming-convention 은 이름마다 가장 구체적인 항목 하나만 보므로, 함수 이름의 역할 접미사 금지도 이 정규식에 넣는다.
  const verbName = {
    regex: `^(?!.*${ROLE_SUFFIX})(${verbs.join('|')})[A-Z]`,
    match: true,
  };
  return {
    files,
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        NO_ROLE_SUFFIX_NAMES,
        ...VARIABLE_NAMES,
        {
          selector: 'function',
          modifiers: ['exported'],
          format: null,
          custom: verbName,
        },
        {
          selector: 'variable',
          types: ['function'],
          modifiers: ['exported'],
          format: null,
          custom: verbName,
        },
      ],
    },
  };
}

function syntaxRuleBlocks() {
  const exemptFiles = [...new Set(SYNTAX_RULES.flatMap(({ exempt = [] }) => exempt))];
  const blockFor = (files, skipped) => ({
    files,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...SYNTAX_RULES.filter(
          ({ exempt = [] }) => !exempt.some((file) => skipped.includes(file)),
        ).map(({ selector, message }) => ({
          selector,
          message,
        })),
      ],
    },
  });
  return [blockFor(['**/*.ts'], []), ...exemptFiles.map((file) => blockFor([file], [file]))];
}

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
      // paint-only 규칙의 위반 예시라 tests/lint/paintOnlyRule.test.ts 가 직접 검사한다.
      'tests/lint/fixtures/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      dazbeat: {
        rules: {
          'import-boundaries': importBoundaries,
          'paint-only': paintOnly,
          'boolean-name': booleanName,
          'bare-unit-name': bareUnitName,
          'required-test-call': requiredTestCall,
          'two-way-switch': twoWaySwitch,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-nested-ternary': 'error',
      'no-console': [
        'error',
        {
          allow: ['warn', 'error'],
        },
      ],
      'dazbeat/import-boundaries': 'error',
      'dazbeat/paint-only': 'error',
      'dazbeat/boolean-name': 'error',
      'dazbeat/bare-unit-name': 'error',
      'dazbeat/two-way-switch': 'error',
      '@typescript-eslint/naming-convention': ['error', NO_ROLE_SUFFIX_NAMES, ...VARIABLE_NAMES],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
    },
  },
  ...syntaxRuleBlocks(),
  {
    files: PURE_MODULE_FILES,
    ignores: ['src/main.ts'],
    rules: {
      'no-restricted-globals': ['error', ...PURE_MODULE_GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: PURE_MODULE_GLOBAL_MESSAGE,
        },
      ],
    },
  },
  libVerbBlock(
    ['pocketbase/lib/*/service.ts', 'pocketbase/lib/*/service/*.ts'],
    LIB_FUNCTION_VERBS.service,
  ),
  libVerbBlock(['pocketbase/lib/*/repository.ts'], LIB_FUNCTION_VERBS.repository),
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', NO_VI_MOCK, NO_FAKE_TIMERS, ...NO_SKIPPED_TESTS],
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
  {
    // 브라우저 타이머를 직접 쓰는 I/O 경계는 시간을 주입받지 않으므로 fake timer 로 검증한다.
    files: ['tests/backend/**/*.ts', 'tests/audio/**/*.ts', 'tests/storage/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', NO_VI_MOCK, ...NO_SKIPPED_TESTS],
    },
  },
  {
    files: ['pocketbase/pb_migrations/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration, CallExpression[callee.name='require']",
          message: 'Migrations are snapshots and keep their helpers inside the file.',
        },
      ],
    },
  },
  {
    files: ['pocketbase/pb_hooks/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Program > VariableDeclaration CallExpression[callee.name='require']",
          message: 'JSVM handlers cannot see the outer scope; require inside the handler.',
        },
        {
          selector: [
            "CallExpression[callee.name='routerAdd'][arguments.1.type='Literal']:not([arguments.1.value=/^\\/api\\/dazbeat\\//])",
            "CallExpression[callee.name='routerAdd'][arguments.1.type='TemplateLiteral']:not([arguments.1.quasis.0.value.raw=/^\\/api\\/dazbeat\\//])",
          ].join(', '),
          message: 'Add custom routes under /api/dazbeat/.',
        },
        FOR_EACH_BLOCK_RULE,
      ],
    },
  },
  prettier,
  {
    // eslint-config-prettier 가 끄는 규칙을 다시 켠다. Prettier 는 첫 키 앞에 줄바꿈이 있으면
    // 객체를 여러 줄로 유지하므로(objectWrap: preserve) 두 도구가 충돌하지 않는다.
    files: ['**/*.ts'],
    rules: {
      'object-curly-newline': [
        'error',
        {
          ObjectExpression: { minProperties: 2, consistent: true },
        },
      ],
      'object-property-newline': 'error',
    },
  },
);
