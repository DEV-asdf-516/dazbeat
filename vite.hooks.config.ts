import { defineConfig } from 'vite';

// PocketBase JSVM(goja)이 pb_hooks 에서 require 하는 서버 번들: 결과 검증(verifyPlay.cjs),
// 세션 발급 한도 판정(sessionQuota.cjs), 훅 필터 조립(pbQuery.cjs), 곡 제목 검색 SQL 조립(songSearch.cjs),
// 채보 레코드 laneCount 일치 검사(chartRecord.cjs), Origin 허용 판단(originPolicy.cjs),
// 세션 발급 요청 파싱(sessionRequest.cjs), 업적 평가와 기록 반영(achievementSync.cjs),
// 프로필 요청 파싱, 기본 닉네임, 닉네임 중복 조회(profileRequest.cjs), SQL 행 읽기(jsvm.cjs).
// 기본 클라이언트 빌드와 분리한다.
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: {
        verifyPlay: 'pocketbase/verification/verifyPlay.ts',
        sessionQuota: 'pocketbase/verification/sessionQuota.ts',
        pbQuery: 'pocketbase/verification/pbQuery.ts',
        songSearch: 'pocketbase/verification/songSearch.ts',
        chartRecord: 'pocketbase/verification/chartRecord.ts',
        originPolicy: 'pocketbase/verification/originPolicy.ts',
        sessionRequest: 'pocketbase/verification/sessionRequest.ts',
        achievementSync: 'pocketbase/verification/achievementSync.ts',
        profileRequest: 'pocketbase/verification/profileRequest.ts',
        jsvm: 'pocketbase/verification/jsvm.ts',
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
