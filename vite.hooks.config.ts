import { defineConfig } from 'vite';

// PocketBase JSVM(goja)이 pb_hooks 에서 require 하는 서버 검증 번들. 기본 클라이언트 빌드와 분리한다.
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: 'pocketbase/verification/verifyPlay.ts',
      formats: ['cjs'],
      fileName: () => 'verifyPlay.cjs',
    },
    outDir: 'pocketbase/pb_hooks/lib',
    emptyOutDir: true,
    target: 'es2017',
    minify: false,
  },
});
