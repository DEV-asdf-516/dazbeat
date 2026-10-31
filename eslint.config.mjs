import { dirname, posix, relative, resolve } from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

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
    const reportComparison = (node, name) => {
      if (COMPARISON_NAMES.has(name)) {
        context.report({
          node,
          message: `Compare state in the screen state module instead of importing ${name}.`,
        });
      }
    };
    return {
      ImportSpecifier: (node) =>
        reportComparison(
          node,
          node.imported.type === 'Identifier' ? node.imported.name : node.imported.value,
        ),
      ImportNamespaceSpecifier: (node) => {
        for (const variable of sourceCode.getDeclaredVariables(node)) {
          for (const { identifier } of variable.references) {
            const { parent } = identifier;
            if (
              parent.type === 'MemberExpression' &&
              parent.object === identifier &&
              parent.property.type === 'Identifier'
            ) {
              reportComparison(parent, parent.property.name);
            }
          }
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

// 같은 규칙 이름을 여러 블록에 두면 뒤 블록이 덮어쓰므로, 예외 파일마다 그 항목만 뺀 목록을 만든다.
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
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['class', 'interface', 'typeAlias'],
          format: null,
          custom: {
            regex: '(Manager|Service|Helper|Util|Utils)$',
            match: false,
          },
        },
      ],
    },
  },
  ...syntaxRuleBlocks(),
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', NO_VI_MOCK, NO_FAKE_TIMERS],
    },
  },
  {
    // 브라우저 타이머를 직접 쓰는 I/O 경계는 시간을 주입받지 않으므로 fake timer 로 검증한다.
    files: ['tests/backend/**/*.ts', 'tests/audio/**/*.ts', 'tests/storage/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', NO_VI_MOCK],
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
