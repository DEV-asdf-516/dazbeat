import { defineConfig } from 'vite';

// PocketBase JSVM(goja)이 pb_hooks 에서 require 하는 서버 번들: 결과 검증(verifyPlay.cjs)과
// 세션 발급 한도 판정(sessionQuota.cjs). 기본 클라이언트 빌드와 분리한다.
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: {
        verifyPlay: 'pocketbase/verification/verifyPlay.ts',
        sessionQuota: 'pocketbase/verification/sessionQuota.ts',
      },
      formats: ['cjs'],
      fileName: (_format, entryName) => `${entryName}.cjs`,
    },
    outDir: 'pocketbase/pb_hooks/lib',
    emptyOutDir: true,
    target: 'es2017',
    minify: false,
  },
});
