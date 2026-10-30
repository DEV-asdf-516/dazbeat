import { defineConfig } from 'vite';

// PocketBase JSVM(goja)이 pb_hooks 에서 require 하는 서버 번들. 도메인 폴더의 dto, repository, service 중
// 훅이 직접 쓰는 것과 공용 모듈(pbQuery, originPolicy)을 진입점으로 둔다.
// 기본 클라이언트 빌드와 분리한다.
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: {
        pbQuery: 'pocketbase/lib/pbQuery.ts',
        originPolicy: 'pocketbase/lib/originPolicy.ts',
        'achievement/dto': 'pocketbase/lib/achievement/dto.ts',
        'achievement/service/grant': 'pocketbase/lib/achievement/service/grant.ts',
        'session/dto': 'pocketbase/lib/session/dto.ts',
        'session/service/issue': 'pocketbase/lib/session/service/issue.ts',
        'session/service/verify': 'pocketbase/lib/session/service/verify.ts',
        'session/service/submit': 'pocketbase/lib/session/service/submit.ts',
        'profile/dto': 'pocketbase/lib/profile/dto.ts',
        'profile/repository': 'pocketbase/lib/profile/repository.ts',
        'profile/service': 'pocketbase/lib/profile/service.ts',
        'song/dto': 'pocketbase/lib/song/dto.ts',
        'song/repository': 'pocketbase/lib/song/repository.ts',
        'song/service': 'pocketbase/lib/song/service.ts',
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
