import { registerHooks } from 'node:module';

// seed CLI 는 Node 타입 스트리핑으로 .ts 를 직접 실행하는데, src/ 는 런타임 기준 .js 지정자로
// 서로를 import 한다. 그 .js 가 없을 때만 같은 경로의 .ts 소스로 다시 해석한다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ERR_MODULE_NOT_FOUND' &&
        specifier.startsWith('.') &&
        specifier.endsWith('.js')
      ) {
        return nextResolve(`${specifier.slice(0, -'.js'.length)}.ts`, context);
      }
      throw error;
    }
  },
});
