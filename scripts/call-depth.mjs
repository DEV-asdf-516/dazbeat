import path from 'node:path';
import ts from 'typescript';

// conventions.md 5.3: 진입 함수에서 동기 호출을 따라 내려가는 깊이는 MAX_CALL_DEPTH 이하.
// 함수 하나만 보는 ESLint 규칙으로는 파일을 넘는 사슬을 셀 수 없어 프로그램 전체 호출 그래프로 잰다.
const MAX_CALL_DEPTH = 7;
const ROOT = process.cwd();
const SCANNED_DIRS = ['src/', 'pocketbase/lib/'];
// src/ 바로 아래 순수 모듈(2.1)은 흐름의 단계가 아니라 계산 도구라 깊이에 넣지 않는다.
const ROOT_PURE_MODULE = /^src\/(?!main\.ts$)[^/]+\.ts$/;
// 같은 스택에서 바로 실행되는 콜백만 호출자에 이어 붙인다. 이벤트·Promise 콜백은 새 스택에서 시작한다.
const SYNC_CALLBACK_METHODS = new Set([
  'map',
  'filter',
  'forEach',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'reduce',
  'flatMap',
  'sort',
  'toSorted',
]);

const belowFlagIndex = process.argv.indexOf('--below');
const belowName = belowFlagIndex < 0 ? undefined : process.argv[belowFlagIndex + 1];
const isControllerShapeCheck = process.argv.includes('--controller-shape');
const CONTROLLER_FILE = /^src\/game\/.*Controller\.ts$/;

const relativePath = (fileName) => path.relative(ROOT, fileName).split(path.sep).join('/');
const isScanned = (fileName) => {
  const rel = relativePath(fileName);
  return SCANNED_DIRS.some((dir) => rel.startsWith(dir)) && !rel.endsWith('.d.ts');
};
const isCountedTarget = (fileName) =>
  isScanned(fileName) && !ROOT_PURE_MODULE.test(relativePath(fileName));
const locationOf = (node) => {
  const sourceFile = node.getSourceFile();
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${relativePath(sourceFile.fileName)}:${line + 1}`;
};

const isFunctionNode = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessor(node) ||
  ts.isSetAccessor(node);

// 자리에 넣는 이름 없는 함수는 그 자리의 이름으로 보인다.
const slotNames = new Map();

function functionLabel(node) {
  const parent = node.parent;
  let name;
  if (node.name !== undefined && ts.isIdentifier(node.name)) {
    name = node.name.text;
  } else if (ts.isConstructorDeclaration(node)) {
    name = 'constructor';
  } else if (
    (ts.isVariableDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertyAssignment(parent)) &&
    ts.isIdentifier(parent.name)
  ) {
    name = parent.name.text;
  } else if (slotNames.has(node)) {
    name = slotNames.get(node);
  } else {
    return undefined;
  }
  let owner = parent;
  while (owner !== undefined && !ts.isClassLike(owner) && !ts.isSourceFile(owner)) {
    owner = owner.parent;
  }
  const className =
    owner !== undefined && ts.isClassLike(owner) && owner.name !== undefined
      ? `${owner.name.text}.`
      : '';
  return `${className}${name} (${locationOf(node)})`;
}

function functionOfDeclaration(declaration) {
  if (declaration === undefined) {
    return undefined;
  }
  if (isFunctionNode(declaration)) {
    return declaration;
  }
  const initializer = declaration.initializer;
  if (
    initializer !== undefined &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
  ) {
    return initializer;
  }
  return undefined;
}

const configFile = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
const program = ts.createProgram(config.fileNames.filter(isScanned), config.options);
const checker = program.getTypeChecker();
const scannedFiles = program.getSourceFiles().filter((file) => isScanned(file.fileName));

function symbolAt(location) {
  const symbol = checker.getSymbolAtLocation(location);
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}
const calleeLocation = (call) =>
  ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
const constructorOf = (expression) => {
  const declaration = symbolAt(expression)?.declarations?.[0];
  return declaration !== undefined && ts.isClassLike(declaration)
    ? declaration.members.find(ts.isConstructorDeclaration)
    : undefined;
};

const isParameterProperty = (declaration) =>
  ts.isParameter(declaration) &&
  (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.ParameterPropertyModifier) !== 0;
// 자리: 다른 곳에서 정한 함수가 들어가는 선언.
const isSlot = (declaration) =>
  declaration !== undefined &&
  (ts.isMethodSignature(declaration) ||
    ts.isPropertySignature(declaration) ||
    (ts.isMethodDeclaration(declaration) &&
      (declaration.body === undefined ||
        (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Abstract) !== 0)) ||
    (ts.isPropertyDeclaration(declaration) && functionOfDeclaration(declaration) === undefined) ||
    ts.isParameter(declaration));
// 일반 매개변수를 직접 부르는 호출은 이름 없는 콜백(새 스택)이라 별칭으로만 쓴다.
const isCallableSlot = (declaration) =>
  isSlot(declaration) && (!ts.isParameter(declaration) || isParameterProperty(declaration));
const hasBody = (fn) => fn !== undefined && fn.body !== undefined && !isSlot(fn);

// 자리 → { fns: 구현 함수, aliases: 구현을 함께 쓰는 다른 자리, unresolved: 해석하지 못한 넣는 식 위치 }
const slots = new Map();
const slotOf = (declaration) => {
  if (!slots.has(declaration)) {
    slots.set(declaration, { fns: new Set(), aliases: new Set(), unresolved: [] });
  }
  return slots.get(declaration);
};
const addMember = (slot, declaration) => {
  const fn = functionOfDeclaration(declaration);
  if (fn !== undefined) {
    slot.fns.add(fn);
  } else if (isSlot(declaration)) {
    slot.aliases.add(declaration);
  }
};
const followedNodes = new Map();
const isFirstFollow = (slotDeclaration, node) => {
  if (!followedNodes.has(slotDeclaration)) {
    followedNodes.set(slotDeclaration, new Set());
  }
  const followed = followedNodes.get(slotDeclaration);
  if (followed.has(node)) {
    return false;
  }
  followed.add(node);
  return true;
};
let followCount = 0;
const pendingParameterSources = [];
const pendingCallReturns = [];

function addReturns(slotDeclaration, fn) {
  if (!isFirstFollow(slotDeclaration, fn)) {
    return;
  }
  followCount++;
  if (!ts.isBlock(fn.body)) {
    addSource(slotDeclaration, fn.body);
    return;
  }
  const walk = (node) => {
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      addSource(slotDeclaration, node.expression);
    } else if (!isFunctionNode(node)) {
      ts.forEachChild(node, walk);
    }
  };
  ts.forEachChild(fn.body, walk);
}

function addSource(slotDeclaration, source) {
  let expression = source;
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression;
  }
  if (
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'undefined')
  ) {
    return;
  }
  const slot = slotOf(slotDeclaration);
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    if (functionLabel(expression) === undefined) {
      slotNames.set(
        expression,
        slotDeclaration.name !== undefined && ts.isIdentifier(slotDeclaration.name)
          ? slotDeclaration.name.text
          : 'slot',
      );
    }
    slot.fns.add(expression);
    return;
  }
  if (ts.isConditionalExpression(expression)) {
    addSource(slotDeclaration, expression.whenTrue);
    addSource(slotDeclaration, expression.whenFalse);
    return;
  }
  if (
    ts.isBinaryExpression(expression) &&
    (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expression.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    addSource(slotDeclaration, expression.left);
    addSource(slotDeclaration, expression.right);
    return;
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'bind'
  ) {
    addSource(slotDeclaration, expression.expression.expression);
    return;
  }
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
    const location = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
    let isResolved = false;
    for (const declaration of symbolAt(location)?.declarations ?? []) {
      if (functionOfDeclaration(declaration) !== undefined || isSlot(declaration)) {
        addMember(slot, declaration);
        isResolved = true;
      } else if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
        if (isFirstFollow(slotDeclaration, declaration)) {
          addSource(slotDeclaration, declaration.initializer);
        }
        isResolved = true;
      } else if (
        ts.isBindingElement(declaration) &&
        ts.isObjectBindingPattern(declaration.parent)
      ) {
        const property = checker.getPropertyOfType(
          checker.getTypeAtLocation(declaration.parent),
          (declaration.propertyName ?? declaration.name).getText(),
        );
        for (const propertyDeclaration of property?.declarations ?? []) {
          addMember(slot, propertyDeclaration);
          isResolved = true;
        }
      }
    }
    if (!isResolved) {
      slot.unresolved.push(locationOf(expression));
    }
    return;
  }
  if (ts.isCallExpression(expression)) {
    const signatureDeclaration = checker.getResolvedSignature(expression)?.declaration;
    if (signatureDeclaration !== undefined && hasBody(signatureDeclaration)) {
      addReturns(slotDeclaration, signatureDeclaration);
      return;
    }
    const calleeSlots = (symbolAt(calleeLocation(expression))?.declarations ?? []).filter(
      isCallableSlot,
    );
    if (calleeSlots.length > 0) {
      calleeSlots.forEach((calleeSlot) => pendingCallReturns.push([slotDeclaration, calleeSlot]));
      return;
    }
  }
  slot.unresolved.push(locationOf(expression));
}

// 구조적 구현: 자리를 가진 타입이 기대되는 곳에 넣은 값의 같은 이름 멤버.
function addStructuralImplementations(expression) {
  const contextualType = checker.getContextualType(expression);
  if (contextualType === undefined) {
    return;
  }
  const sourceType = checker.getTypeAtLocation(expression);
  const sourceTypes = (sourceType.isUnion() ? sourceType.types : [sourceType]).filter(
    (type) => (type.flags & ts.TypeFlags.Object) !== 0,
  );
  if (sourceTypes.length === 0) {
    return;
  }
  for (const targetType of contextualType.isUnion() ? contextualType.types : [contextualType]) {
    if (
      (targetType.flags & ts.TypeFlags.Object) === 0 ||
      !(targetType.getSymbol()?.declarations ?? []).some((declaration) =>
        isScanned(declaration.getSourceFile().fileName),
      )
    ) {
      continue;
    }
    for (const property of checker.getPropertiesOfType(targetType)) {
      const slotDeclarations = (property.declarations ?? []).filter(
        (declaration) =>
          isSlot(declaration) &&
          !ts.isParameter(declaration) &&
          isScanned(declaration.getSourceFile().fileName),
      );
      for (const type of slotDeclarations.length === 0 ? [] : sourceTypes) {
        for (const member of checker.getPropertyOfType(type, property.name)?.declarations ?? []) {
          if (!slotDeclarations.includes(member)) {
            slotDeclarations.forEach((declaration) => addMember(slotOf(declaration), member));
          }
        }
      }
    }
  }
}

const isValuePosition = (node) => {
  const parent = node.parent;
  if (parent === undefined) {
    return false;
  }
  return (
    ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
      parent.arguments?.includes(node) === true) ||
    (ts.isPropertyAssignment(parent) && parent.initializer === node) ||
    ts.isShorthandPropertyAssignment(parent) ||
    (ts.isVariableDeclaration(parent) &&
      parent.initializer === node &&
      parent.type !== undefined) ||
    (ts.isPropertyDeclaration(parent) && parent.initializer === node) ||
    ts.isReturnStatement(parent) ||
    (ts.isArrowFunction(parent) && parent.body === node) ||
    (ts.isBinaryExpression(parent) &&
      parent.right === node &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
  );
};

function addHeritageImplementations(classNode) {
  for (const clause of classNode.heritageClauses ?? []) {
    for (const typeNode of clause.types) {
      const heritageType = checker.getTypeAtLocation(typeNode);
      for (const member of classNode.members) {
        if (
          member.name === undefined ||
          !ts.isIdentifier(member.name) ||
          !(
            ts.isMethodDeclaration(member) ||
            ts.isGetAccessor(member) ||
            ts.isPropertyDeclaration(member)
          )
        ) {
          continue;
        }
        const property = checker.getPropertyOfType(heritageType, member.name.text);
        for (const declaration of property?.declarations ?? []) {
          if (declaration === member || !isSlot(declaration) || ts.isParameter(declaration)) {
            continue;
          }
          if (ts.isPropertyDeclaration(member) && member.initializer !== undefined) {
            addSource(declaration, member.initializer);
          } else if (isSlot(member)) {
            // 추상 메서드·초기값 없는 속성은 구현이 아니라 자리라, 아래 클래스의 구현이 위 자리로 이어지게 별칭으로 잇는다.
            slotOf(declaration).aliases.add(member);
          } else {
            slotOf(declaration).fns.add(member);
          }
        }
      }
    }
  }
}

function addObjectLiteralImplementations(objectLiteral) {
  const contextualType = checker.getContextualType(objectLiteral);
  if (contextualType === undefined) {
    return;
  }
  const contextualTypes = contextualType.isUnion() ? contextualType.types : [contextualType];
  for (const property of objectLiteral.properties) {
    if (
      property.name === undefined ||
      !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ) {
      continue;
    }
    const name = property.name.text;
    const slotDeclarations = contextualTypes
      .flatMap((type) => checker.getPropertyOfType(type, name)?.declarations ?? [])
      .filter(
        (declaration) =>
          declaration !== property && isSlot(declaration) && !ts.isParameter(declaration),
      );
    for (const declaration of slotDeclarations) {
      if (ts.isPropertyAssignment(property)) {
        addSource(declaration, property.initializer);
      } else if (ts.isMethodDeclaration(property) || ts.isGetAccessor(property)) {
        slotOf(declaration).fns.add(property);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        const valueSymbol = checker.getShorthandAssignmentValueSymbol(property);
        (valueSymbol?.declarations ?? []).forEach((valueDeclaration) =>
          addMember(slotOf(declaration), valueDeclaration),
        );
      }
    }
  }
}

function addArgumentSources(call) {
  const declaration = ts.isNewExpression(call)
    ? constructorOf(call.expression)
    : checker.getResolvedSignature(call)?.declaration;
  if (declaration?.parameters === undefined) {
    return;
  }
  for (const [index, argument] of call.arguments.entries()) {
    const parameter = declaration.parameters[index];
    if (parameter !== undefined && parameter.dotDotDotToken === undefined) {
      pendingParameterSources.push([parameter, argument]);
    }
  }
}

// ① 구현·넣는 곳·호출·new 인자 모으기
for (const sourceFile of scannedFiles) {
  const visit = (node) => {
    if (ts.isExpression(node) && isValuePosition(node)) {
      addStructuralImplementations(node);
    }
    if (ts.isClassLike(node)) {
      addHeritageImplementations(node);
    }
    if (ts.isObjectLiteralExpression(node)) {
      addObjectLiteralImplementations(node);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left)
    ) {
      const declaration = symbolAt(node.left.name)?.declarations?.[0];
      if (isSlot(declaration)) {
        addSource(declaration, node.right);
      }
    }
    if (
      ts.isPropertyDeclaration(node) &&
      node.initializer !== undefined &&
      functionOfDeclaration(node) === undefined &&
      !ts.isObjectLiteralExpression(node.initializer)
    ) {
      addSource(node, node.initializer);
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments !== undefined) {
      addArgumentSources(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

// ② 매개변수 인자는 매개변수 속성이거나 다른 자리의 별칭으로 쓰이는 매개변수만 넣는 식으로 본다.
{
  const relevantParameters = new Set(
    pendingParameterSources.map(([parameter]) => parameter).filter(isParameterProperty),
  );
  const handled = new Set();
  let isChanged = true;
  while (isChanged) {
    isChanged = false;
    for (const slot of slots.values()) {
      for (const alias of slot.aliases) {
        if (ts.isParameter(alias) && !relevantParameters.has(alias)) {
          relevantParameters.add(alias);
          isChanged = true;
        }
      }
    }
    for (const [index, [parameter, argument]] of pendingParameterSources.entries()) {
      if (!handled.has(index) && relevantParameters.has(parameter)) {
        handled.add(index);
        addSource(parameter, argument);
        isChanged = true;
      }
    }
  }
}

function collectImplementations(declaration, seen, result) {
  if (seen.has(declaration)) {
    return result;
  }
  seen.add(declaration);
  const slot = slots.get(declaration);
  if (slot !== undefined) {
    slot.fns.forEach((fn) => result.add(fn));
    slot.aliases.forEach((alias) => collectImplementations(alias, seen, result));
  }
  return result;
}

// ③ 호출 가능한 자리를 거쳐 돌려받는 함수. 구현이 더 늘지 않을 때까지.
for (let previousCount = -1; previousCount !== followCount;) {
  previousCount = followCount;
  for (const [slotDeclaration, calleeSlot] of pendingCallReturns) {
    collectImplementations(calleeSlot, new Set(), new Set()).forEach(
      (fn) => fn.body !== undefined && addReturns(slotDeclaration, fn),
    );
  }
}

const implementationCache = new Map();
const implementationsOf = (declaration) => {
  if (!implementationCache.has(declaration)) {
    implementationCache.set(declaration, collectImplementations(declaration, new Set(), new Set()));
  }
  return implementationCache.get(declaration);
};

// ④ 그래프
const calledSlots = new Set();
function calleesOf(call) {
  if (ts.isNewExpression(call)) {
    const constructor = constructorOf(call.expression);
    return constructor === undefined ? [] : [{ fn: constructor }];
  }
  const signatureDeclaration = checker.getResolvedSignature(call)?.declaration;
  if (
    signatureDeclaration !== undefined &&
    isFunctionNode(signatureDeclaration) &&
    hasBody(signatureDeclaration)
  ) {
    return [{ fn: signatureDeclaration }];
  }
  const declarations = symbolAt(calleeLocation(call))?.declarations ?? [];
  const fn = declarations.map(functionOfDeclaration).find(hasBody);
  if (fn !== undefined) {
    return [{ fn }];
  }
  return declarations.filter(isCallableSlot).flatMap((declaration) => {
    calledSlots.add(declaration);
    const implementations = implementationsOf(declaration);
    return [...implementations].map((implementation) => ({
      fn: implementation,
      implementationCount: implementations.size,
    }));
  });
}

const gettersOf = (access) =>
  (symbolAt(access.name)?.declarations ?? []).flatMap((declaration) => {
    if (ts.isGetAccessor(declaration)) {
      return [{ fn: declaration }];
    }
    if (!isCallableSlot(declaration)) {
      return [];
    }
    const implementations = implementationsOf(declaration);
    return [...implementations].filter(ts.isGetAccessor).map((getter) => ({
      fn: getter,
      implementationCount: implementations.size,
    }));
  });

function isSyncCallback(node) {
  const parent = node.parent;
  if (
    !ts.isCallExpression(parent) ||
    !parent.arguments.includes(node) ||
    !ts.isPropertyAccessExpression(parent.expression)
  ) {
    return false;
  }
  const callee = parent.expression;
  return (
    SYNC_CALLBACK_METHODS.has(callee.name.text) ||
    (callee.name.text === 'from' &&
      parent.arguments[1] === node &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'Array' &&
      isGlobalLibrarySymbol(symbolAt(callee.expression)))
  );
}
// 다른 객체의 from(dbx 쿼리 빌더 등)이나 소스가 선언한 Array 는 매핑 함수를 바로 부른다고 볼 수 없다.
const isGlobalLibrarySymbol = (symbol) =>
  symbol?.valueDeclaration !== undefined &&
  program.isSourceFileDefaultLibrary(symbol.valueDeclaration.getSourceFile());

const SHORT_CIRCUIT = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);
// 정상적으로 끝나면 반드시 await 를 지난 식·문인가. 놓치지 않도록 확실할 때만 true.
function awaitsAlways(node) {
  if (node === undefined || isFunctionNode(node) || ts.isClassLike(node)) {
    return false;
  }
  if (ts.isAwaitExpression(node)) {
    return true;
  }
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
    return true;
  }
  if (ts.isConditionalExpression(node)) {
    return (
      awaitsAlways(node.condition) || (awaitsAlways(node.whenTrue) && awaitsAlways(node.whenFalse))
    );
  }
  if (ts.isBinaryExpression(node) && SHORT_CIRCUIT.has(node.operatorToken.kind)) {
    return awaitsAlways(node.left);
  }
  if (ts.isIfStatement(node)) {
    return (
      awaitsAlways(node.expression) ||
      (awaitsAlways(node.thenStatement) && awaitsAlways(node.elseStatement))
    );
  }
  if (ts.isWhileStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
    return awaitsAlways(node.expression);
  }
  if (ts.isForStatement(node)) {
    return awaitsAlways(node.initializer) || awaitsAlways(node.condition);
  }
  if (ts.isSwitchStatement(node)) {
    return awaitsAlways(node.expression);
  }
  // catch 는 try 블록의 await 앞에서 동기로 던져도 돈다.
  if (ts.isTryStatement(node)) {
    return (
      (awaitsAlways(node.tryBlock) &&
        (node.catchClause === undefined ||
          awaitsAlways(node.catchClause.block) ||
          endsAbruptly(node.catchClause.block))) ||
      awaitsAlways(node.finallyBlock)
    );
  }
  if (ts.isDoStatement(node) || ts.isLabeledStatement(node)) {
    return false;
  }
  if (
    (ts.isCallExpression(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) &&
    node.questionDotToken !== undefined
  ) {
    return awaitsAlways(node.expression);
  }
  return ts.forEachChild(node, (child) => awaitsAlways(child) || undefined) === true;
}
// 정상적으로 끝날 수 없는 문인가. 모르면 false.
function endsAbruptly(node) {
  if (node === undefined) {
    return false;
  }
  if (
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isBreakStatement(node) ||
    ts.isContinueStatement(node)
  ) {
    return true;
  }
  if (ts.isBlock(node)) {
    return node.statements.some(endsAbruptly);
  }
  if (ts.isIfStatement(node)) {
    return endsAbruptly(node.thenStatement) && endsAbruptly(node.elseStatement);
  }
  return false;
}
// child 보다 먼저 반드시 평가되는 형제.
function earlierSiblings(parent, child) {
  if (ts.isConditionalExpression(parent)) {
    return child === parent.condition ? [] : [parent.condition];
  }
  if (ts.isIfStatement(parent)) {
    return child === parent.expression ? [] : [parent.expression];
  }
  if (ts.isBinaryExpression(parent) && SHORT_CIRCUIT.has(parent.operatorToken.kind)) {
    return child === parent.right ? [parent.left] : [];
  }
  // 증가식은 위치상 몸체 앞이지만 첫 반복에서는 몸체 뒤에 돈다.
  if (ts.isForStatement(parent)) {
    if (child === parent.initializer) {
      return [];
    }
    return child === parent.condition
      ? [parent.initializer]
      : [parent.initializer, parent.condition];
  }
  if (
    ts.isTryStatement(parent) ||
    ts.isCatchClause(parent) ||
    ts.isDoStatement(parent) ||
    ts.isCaseBlock(parent) ||
    ts.isLabeledStatement(parent)
  ) {
    return [];
  }
  const earlier = [];
  ts.forEachChild(parent, (sibling) => {
    if (sibling.end <= child.pos) {
      earlier.push(sibling);
    }
  });
  return earlier;
}
function isAfterAwait(node, fn) {
  if (fn.body === undefined) {
    return false;
  }
  if (
    (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
    (awaitsAlways(node.expression) || (node.arguments ?? []).some(awaitsAlways))
  ) {
    return true;
  }
  if (ts.isPropertyAccessExpression(node) && awaitsAlways(node.expression)) {
    return true;
  }
  for (let child = node; child !== fn.body; child = child.parent) {
    const parent = child.parent;
    if (
      ts.isForOfStatement(parent) &&
      parent.awaitModifier !== undefined &&
      child === parent.statement
    ) {
      return true;
    }
    if (earlierSiblings(parent, child).some(awaitsAlways)) {
      return true;
    }
  }
  return false;
}
const isAsync = (fn) =>
  fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) === true;

const nodeIds = new Map();
const labels = [];
const callees = [];
// 간선마다 거친 자리의 구현 수(표시용). 같은 간선이 여러 자리를 거치면 가장 많은 것.
const edgeImplementationCounts = new Map();
const idOf = (node) => {
  if (!nodeIds.has(node)) {
    const label = functionLabel(node);
    if (label === undefined) {
      return undefined;
    }
    nodeIds.set(node, labels.length);
    labels.push(label);
    callees.push(new Set());
  }
  return nodeIds.get(node);
};
// await 뒤는 Promise 콜백처럼 새 스택이라 그 함수의 이어 실행 진입으로 센다.
const continuationIds = new Map();
const continuationIdOf = (fn) => {
  if (!continuationIds.has(fn)) {
    continuationIds.set(fn, labels.length);
    labels.push(functionLabel(fn).replace(' (', ' after await ('));
    callees.push(new Set());
  }
  return continuationIds.get(fn);
};
const addEdge = (caller, { fn, implementationCount = 1 }) => {
  if (!isCountedTarget(fn.getSourceFile().fileName)) {
    return;
  }
  const calleeId = idOf(fn);
  if (calleeId === undefined || calleeId === caller) {
    return;
  }
  callees[caller].add(calleeId);
  const key = `${caller}>${calleeId}`;
  edgeImplementationCounts.set(
    key,
    Math.max(edgeImplementationCounts.get(key) ?? 1, implementationCount),
  );
};

for (const sourceFile of scannedFiles) {
  // owner: 이 자리를 실행하는 라벨 있는 함수. 동기 콜백은 바깥 것을 이어받는다.
  const visit = (node, caller, owner) => {
    let current = caller;
    let currentOwner = owner;
    if (isFunctionNode(node)) {
      const id = idOf(node);
      if (id !== undefined) {
        current = id;
        currentOwner = node;
      } else if (!isSyncCallback(node)) {
        current = undefined;
        currentOwner = undefined;
      }
    }
    const edgeSource = () =>
      currentOwner !== undefined && isAsync(currentOwner) && isAfterAwait(node, currentOwner)
        ? continuationIdOf(currentOwner)
        : current;
    if (current !== undefined && (ts.isCallExpression(node) || ts.isNewExpression(node))) {
      const source = edgeSource();
      calleesOf(node).forEach((callee) => addEdge(source, callee));
    }
    // getter는 값을 읽을 때 실행된다. 값을 읽지 않는 단순 대입의 왼쪽만 뺀다.
    if (
      current !== undefined &&
      ts.isPropertyAccessExpression(node) &&
      !(
        ts.isBinaryExpression(node.parent) &&
        node.parent.left === node &&
        node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
      )
    ) {
      const getters = gettersOf(node);
      if (getters.length > 0) {
        const source = edgeSource();
        getters.forEach((getter) => addEdge(source, getter));
      }
    }
    ts.forEachChild(node, (child) => visit(child, current, currentOwner));
  };
  visit(sourceFile, undefined, undefined);
}

// 재귀는 깊이를 무한히 늘리므로 강한 연결 요소 하나를 한 단계로 접는다.
const componentOf = new Array(labels.length).fill(-1);
{
  const order = new Array(labels.length).fill(-1);
  const low = new Array(labels.length).fill(0);
  const onStack = new Array(labels.length).fill(false);
  const stack = [];
  let nextOrder = 0;
  let componentCount = 0;
  const connect = (id) => {
    order[id] = low[id] = nextOrder++;
    stack.push(id);
    onStack[id] = true;
    for (const callee of callees[id]) {
      if (order[callee] < 0) {
        connect(callee);
        low[id] = Math.min(low[id], low[callee]);
      } else if (onStack[callee]) {
        low[id] = Math.min(low[id], order[callee]);
      }
    }
    if (low[id] === order[id]) {
      let member;
      do {
        member = stack.pop();
        onStack[member] = false;
        componentOf[member] = componentCount;
      } while (member !== id);
      componentCount++;
    }
  };
  labels.forEach((_, id) => order[id] < 0 && connect(id));
}

// conventions.md 3장 Controller 문장: 공개 메서드는 apply 를 한 번 넘게 부르지 않고 공개끼리 부르지 않으며 도우미는 apply 에 닿지 않는다.
// 역할은 이름이 아니라 접근 제한자·그래프 호출자·Screen 그리기 호출 모양으로 정한다.
function findControllerShapeViolations() {
  // 끝난 경로가 없음을 나타낸다.
  const NO_PATH = -Infinity;
  const functionOfId = [];
  nodeIds.forEach((id, fn) => (functionOfId[id] = fn));
  continuationIds.forEach((id, fn) => (functionOfId[id] = fn));
  const callers = labels.map(() => new Set());
  callees.forEach((set, id) => set.forEach((callee) => callers[callee].add(id)));
  const classOf = (node) => {
    for (let ancestor = node.parent; ancestor !== undefined; ancestor = ancestor.parent) {
      if (ts.isClassDeclaration(ancestor)) {
        return ancestor;
      }
    }
    return undefined;
  };
  const isPublicMember = (fn) => {
    if (ts.isConstructorDeclaration(fn)) {
      return true;
    }
    const member = ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) ? fn.parent : fn;
    return (
      (ts.isMethodDeclaration(member) ||
        ts.isPropertyDeclaration(member) ||
        ts.isGetAccessor(member) ||
        ts.isSetAccessor(member)) &&
      (ts.getCombinedModifierFlags(member) &
        (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) ===
        0 &&
      !ts.isPrivateIdentifier(member.name)
    );
  };
  // 3장 "state가 바뀌면 직전·다음 state를 Screen에 넘긴다": (previous: T | null, next: T) 모양의 interface 호출.
  const isScreenDraw = (call) => {
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) {
      return false;
    }
    const declaration = symbolAt(call.expression.name)?.declarations?.[0];
    let parameters = [];
    if (declaration !== undefined && ts.isMethodSignature(declaration)) {
      parameters = declaration.parameters;
    } else if (
      declaration !== undefined &&
      ts.isPropertySignature(declaration) &&
      declaration.type !== undefined &&
      ts.isFunctionTypeNode(declaration.type)
    ) {
      parameters = declaration.type.parameters;
    }
    if (parameters.length !== 2) {
      return false;
    }
    const [previousType, nextType] = parameters.map((parameter) =>
      checker.getTypeAtLocation(parameter),
    );
    return (
      previousType.isUnion() &&
      previousType.types.some((type) => (type.flags & ts.TypeFlags.Null) !== 0) &&
      checker.typeToString(checker.getNonNullableType(previousType)) ===
        checker.typeToString(nextType)
    );
  };
  const isInPart = (call, fn, part) =>
    (isAsync(fn) && isAfterAwait(call, fn)) === (part === 'continuation');
  // 함수 몸체의 호출식·new. 새 스택에서 도는 중첩 함수는 빼고 동기 배열 콜백은 넣는다.
  const forEachOwnCall = (fn, visit) => {
    const walk = (node) => {
      if (node !== fn && isFunctionNode(node) && !isSyncCallback(node)) {
        return;
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        visit(node);
      }
      ts.forEachChild(node, walk);
    };
    if (fn.body !== undefined) {
      walk(fn.body);
    }
  };

  const findClassViolations = (cls) => {
    const isClassFunction = (fn) => classOf(fn) === cls && nodeIds.has(fn);
    const roles = new Map();
    const roleOf = (fn) => {
      if (!roles.has(fn)) {
        const callerIds = [...callers[nodeIds.get(fn)]];
        let role = 'helper';
        if (
          isPublicMember(fn) ||
          callerIds.length === 0 ||
          callerIds.some((caller) => classOf(functionOfId[caller]) !== cls)
        ) {
          role = 'public';
        } else {
          forEachOwnCall(fn, (call) => {
            if (isScreenDraw(call)) {
              role = 'apply';
            }
          });
        }
        roles.set(fn, role);
      }
      return roles.get(fn);
    };
    const sameClassCallees = (call) =>
      calleesOf(call)
        .map(({ fn }) => fn)
        .filter(isClassFunction);
    // 다른 모듈을 거쳐 같은 호출 안에서 다시 들어오는 이 클래스 함수. 만난 곳 너머로는 가지 않는다.
    const reenteredFunctions = (call) => {
      const reentered = new Set();
      for (const { fn } of calleesOf(call)) {
        if (classOf(fn) === cls || !nodeIds.has(fn)) {
          continue;
        }
        const seen = new Set();
        const pending = [nodeIds.get(fn)];
        while (pending.length > 0) {
          const id = pending.pop();
          if (seen.has(id)) {
            continue;
          }
          seen.add(id);
          for (const callee of callees[id]) {
            if (classOf(functionOfId[callee]) === cls) {
              reentered.add(functionOfId[callee]);
            } else {
              pending.push(callee);
            }
          }
        }
      }
      return reentered;
    };
    const counts = { sync: new Map(), continuation: new Map() };
    const counting = { sync: new Set(), continuation: new Set() };
    const callValue = (call) => {
      if (isScreenDraw(call)) {
        return 1;
      }
      let value = 0;
      for (const fn of [...sameClassCallees(call), ...reenteredFunctions(call)]) {
        value += roleOf(fn) === 'apply' ? 1 : countApplies(fn, 'sync');
      }
      return value;
    };
    // 실행 경로마다 apply 수를 세어 가장 큰 값. passed 는 정상으로 지난 경로, ended 는 return·throw 로 끝난 경로.
    const countApplies = (fn, part) => {
      if (counts[part].has(fn)) {
        return counts[part].get(fn);
      }
      if (counting[part].has(fn)) {
        return 0;
      }
      counting[part].add(fn);
      // broken 은 break·continue 로 가장 가까운 switch·반복문을 빠져나간 경로다.
      const plain = (value) => ({ passed: value, ended: NO_PATH, broken: NO_PATH });
      const sequence = (results) => {
        let passed = 0;
        let ended = NO_PATH;
        let broken = NO_PATH;
        for (const result of results) {
          if (passed === NO_PATH) {
            break;
          }
          ended = Math.max(ended, passed + result.ended);
          broken = Math.max(broken, passed + result.broken);
          passed += result.passed;
        }
        return { passed, ended, broken };
      };
      const largest = (result) => Math.max(result.passed, result.ended, result.broken, 0);
      // 여러 번 돌 수 있는 몸체는 두 번으로 센다.
      const repeated = (value) => (value > 0 ? 2 * value : 0);
      const visit = (node) => {
        if (node === undefined) {
          return plain(0);
        }
        if (node !== fn && isFunctionNode(node)) {
          return isSyncCallback(node) ? plain(repeated(largest(visit(node.body)))) : plain(0);
        }
        if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
          return { passed: NO_PATH, ended: largest(visit(node.expression)), broken: NO_PATH };
        }
        if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
          return { passed: NO_PATH, ended: NO_PATH, broken: 0 };
        }
        if (ts.isBlock(node)) {
          return sequence(node.statements.map(visit));
        }
        if (ts.isIfStatement(node)) {
          const condition = visit(node.expression);
          const whenTrue = visit(node.thenStatement);
          const whenFalse = visit(node.elseStatement);
          return {
            passed: condition.passed + Math.max(whenTrue.passed, whenFalse.passed),
            ended: Math.max(
              condition.ended,
              condition.passed + Math.max(whenTrue.ended, whenFalse.ended),
            ),
            broken: condition.passed + Math.max(whenTrue.broken, whenFalse.broken),
          };
        }
        if (ts.isConditionalExpression(node)) {
          return plain(
            visit(node.condition).passed +
              Math.max(visit(node.whenTrue).passed, visit(node.whenFalse).passed),
          );
        }
        if (ts.isSwitchStatement(node)) {
          const subject = visit(node.expression);
          // default 가 없으면 어느 case 에도 맞지 않고 지나는 경로가 있다.
          let passed = node.caseBlock.clauses.some(ts.isDefaultClause) ? NO_PATH : 0;
          let ended = NO_PATH;
          // break 없이 끝난 case 는 다음 case 로 이어지므로 그 경로의 수를 다음 case 에 얹는다.
          let fallen = NO_PATH;
          for (const clause of node.caseBlock.clauses) {
            const result = sequence(clause.statements.map(visit));
            const entered = Math.max(0, fallen);
            ended = Math.max(ended, entered + result.ended);
            passed = Math.max(passed, entered + result.broken);
            fallen = entered + result.passed;
          }
          passed = Math.max(passed, fallen);
          return {
            passed: passed === NO_PATH ? NO_PATH : subject.passed + passed,
            ended: subject.passed + ended,
            broken: NO_PATH,
          };
        }
        if (ts.isIterationStatement(node, false)) {
          let head = 0;
          ts.forEachChild(node, (child) => {
            if (child !== node.statement) {
              head += Math.max(0, visit(child).passed);
            }
          });
          const body = visit(node.statement);
          return {
            passed: head + repeated(largest(body)),
            ended: body.ended === NO_PATH ? NO_PATH : head + 2 * body.ended,
            broken: NO_PATH,
          };
        }
        if (ts.isTryStatement(node)) {
          // try 블록 어느 지점에서든 catch 로 갈 수 있다.
          const attempt = visit(node.tryBlock);
          const recovery =
            node.catchClause === undefined
              ? { passed: NO_PATH, ended: NO_PATH, broken: NO_PATH }
              : visit(node.catchClause.block);
          const cleanup = visit(node.finallyBlock);
          const attemptMost = largest(attempt);
          const passed = Math.max(attempt.passed, attemptMost + recovery.passed);
          const ended = Math.max(attempt.ended, attemptMost + recovery.ended);
          const broken = Math.max(attempt.broken, attemptMost + recovery.broken);
          return {
            passed: passed === NO_PATH ? NO_PATH : passed + cleanup.passed,
            ended: ended === NO_PATH ? NO_PATH : ended + cleanup.passed,
            broken: broken === NO_PATH ? NO_PATH : broken + cleanup.passed,
          };
        }
        const children = [];
        ts.forEachChild(node, (child) => children.push(visit(child)));
        const result = sequence(children);
        if (
          (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
          isInPart(node, fn, part) &&
          result.passed !== NO_PATH
        ) {
          return {
            passed: result.passed + callValue(node),
            ended: result.ended,
            broken: result.broken,
          };
        }
        return result;
      };
      const value = largest(visit(fn.body));
      counting[part].delete(fn);
      counts[part].set(fn, value);
      return value;
    };

    const violations = [];
    const nameOf = (fn) => labels[nodeIds.get(fn)].split(' (')[0].split('.').pop();
    for (const fn of nodeIds.keys()) {
      if (classOf(fn) !== cls) {
        continue;
      }
      const role = roleOf(fn);
      for (const part of isAsync(fn) ? ['sync', 'continuation'] : ['sync']) {
        const publicNames = new Set();
        const applyNames = new Set();
        forEachOwnCall(fn, (call) => {
          if (!isInPart(call, fn, part)) {
            return;
          }
          for (const callee of sameClassCallees(call)) {
            if (callee !== fn && roleOf(callee) === 'public') {
              publicNames.add(nameOf(callee));
            } else if (callee !== fn && roleOf(callee) === 'apply') {
              applyNames.add(nameOf(callee));
            }
          }
        });
        const count = countApplies(fn, part);
        const label =
          part === 'sync'
            ? labels[nodeIds.get(fn)]
            : labels[nodeIds.get(fn)].replace(' (', ' after await (');
        if ((part === 'continuation' || role === 'public') && count > 1) {
          violations.push(`${label} calls apply ${count} times on one path`);
        } else if (part === 'sync' && role === 'apply' && applyNames.size > 0) {
          violations.push(`${label} apply calls apply ${[...applyNames].join(', ')}`);
        } else if (part === 'sync' && role === 'helper' && count > 0) {
          violations.push(`${label} helper reaches apply`);
        }
        if (publicNames.size > 0) {
          violations.push(`${label} calls public ${[...publicNames].join(', ')}`);
        }
      }
    }
    // 이름 없는 콜백은 역할 없는 새 진입이라 경로마다 apply 수만 본다.
    const visitCallback = (node) => {
      if (
        isFunctionNode(node) &&
        !nodeIds.has(node) &&
        !isSyncCallback(node) &&
        classOf(node) === cls
      ) {
        const count = countApplies(node, 'sync');
        if (count > 1) {
          violations.push(
            `${cls.name.text} <callback> (${locationOf(node)}) calls apply ${count} times on one path`,
          );
        }
      }
      ts.forEachChild(node, visitCallback);
    };
    visitCallback(cls);
    return violations;
  };

  return scannedFiles
    .filter((file) => CONTROLLER_FILE.test(relativePath(file.fileName)))
    .flatMap((file) => file.statements.filter(ts.isClassDeclaration))
    .flatMap(findClassViolations);
}

const deepest = new Array(labels.length);
const deepestFrom = (id) => {
  if (deepest[id] === undefined) {
    let best = { depth: 0, next: undefined };
    for (const callee of callees[id]) {
      if (componentOf[callee] !== componentOf[id]) {
        const depth = deepestFrom(callee).depth + 1;
        if (depth > best.depth) {
          best = { depth, next: callee };
        }
      }
    }
    deepest[id] = best;
  }
  return deepest[id];
};

// 구현 둘 이상 표시는 인자 없는 실행의 위반 사슬에만 붙인다.
const printChain = (start, isMarked) => {
  for (
    let caller = start, id = deepestFrom(start).next, level = 1;
    id !== undefined;
    caller = id, id = deepestFrom(id).next, level++
  ) {
    const implementationCount = edgeImplementationCounts.get(`${caller}>${id}`);
    const mark =
      isMarked && caller !== start && implementationCount > 1
        ? ` (deepest of ${implementationCount} implementations)`
        : '';
    process.stdout.write(`${'  '.repeat(level)}${labels[id]}${mark}\n`);
  }
};

if (isControllerShapeCheck) {
  const violations = findControllerShapeViolations();
  violations.forEach((violation) => process.stdout.write(`controller shape: ${violation}\n`));
  if (violations.length > 0) {
    process.stdout.write(`${violations.length} controller shape violation(s)\n`);
    process.exitCode = 1;
  }
} else if (belowName !== undefined) {
  const matches = labels.map((_, id) => id).filter((id) => labels[id].split(' (')[0] === belowName);
  for (const id of matches) {
    process.stdout.write(`below ${deepestFrom(id).depth}: ${labels[id]}\n`);
    printChain(id, false);
  }
  if (matches.length === 0) {
    process.stdout.write(`no function named ${belowName}\n`);
    process.exitCode = 1;
  }
} else {
  const called = new Set();
  callees.forEach((set, id) =>
    set.forEach((callee) => componentOf[callee] !== componentOf[id] && called.add(callee)),
  );
  const violations = labels
    .map((_, id) => id)
    .filter((id) => !called.has(id) && deepestFrom(id).depth > MAX_CALL_DEPTH)
    .sort((a, b) => deepestFrom(b).depth - deepestFrom(a).depth);

  for (const entry of violations) {
    process.stdout.write(
      `\ncall depth ${deepestFrom(entry).depth} > ${MAX_CALL_DEPTH}: ${labels[entry]}\n`,
    );
    printChain(entry, true);
  }
  if (violations.length > 0) {
    process.stdout.write(
      `\n${violations.length} entry function(s) exceed call depth ${MAX_CALL_DEPTH}\n`,
    );
    process.exitCode = 1;
  }

  // 따라갈 수 없는 식으로 넣은 자리는 검사가 사슬을 놓치므로 드러낸다.
  for (const [declaration, slot] of slots) {
    if (
      slot.unresolved.length > 0 &&
      calledSlots.has(declaration) &&
      isScanned(declaration.getSourceFile().fileName)
    ) {
      process.stdout.write(
        `unresolved call target ${locationOf(declaration)} ${declaration.name.getText()}: ${slot.unresolved.join(', ')}\n`,
      );
      process.exitCode = 1;
    }
  }
}
