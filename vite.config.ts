import { readFile } from 'node:fs/promises';
import { build, defineConfig } from 'vite';
import { en } from './src/i18n/messages/en.js';
import { ja } from './src/i18n/messages/ja.js';
import { ko } from './src/i18n/messages/ko.js';

const LOADING_SHELL_CSS = 'src/game/boot/view/loadingShell.css';
const LOADING_NOTICE_SCRIPT = 'src/game/boot/view/loadingNotice.ts';

async function bundleLoadingNotice(): Promise<string> {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    define: {
      __LOADING_MESSAGES__: JSON.stringify({
        ko: ko.boot.loading,
        ja: ja.boot.loading,
        en: en.boot.loading,
      }),
    },
    build: {
      write: false,
      rolldownOptions: {
        input: LOADING_NOTICE_SCRIPT,
        output: { format: 'iife' },
      },
    },
  });
  const [chunk] = (Array.isArray(output) ? output : [output]).flatMap((result) =>
    'output' in result ? result.output : [],
  );
  if (chunk?.type !== 'chunk') {
    throw new Error(`Failed to bundle ${LOADING_NOTICE_SCRIPT}`);
  }
  return chunk.code;
}

// 로딩 화면은 번들 전에 그려지므로 스타일과 문구 스크립트를 index.html 에 인라인으로 넣는다.
export default defineConfig({
  // 내부망 기기가 IP 가 바뀌어도 접속하도록 PocketBase 를 같은 출처로 넘긴다.
  // Host 를 유지해야 출처 검사가 같은 호스트로 본다.
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: false,
      },
    },
  },
  plugins: [
    {
      name: 'loading-shell',
      transformIndexHtml: {
        order: 'pre',
        handler: async (html) => {
          const css = await readFile(LOADING_SHELL_CSS, 'utf8');
          const script = await bundleLoadingNotice();
          return html
            .replace('<!-- loading-shell-style -->', () => `<style>\n${css}</style>`)
            .replace('<!-- loading-notice-script -->', () => `<script>\n${script}</script>`);
        },
      },
    },
  ],
});
