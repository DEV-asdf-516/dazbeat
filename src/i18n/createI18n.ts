import i18next from 'i18next';
import type { i18n } from 'i18next';
import type { Language } from './language.js';
import { en } from './messages/en.js';
import { ja } from './messages/ja.js';
import { ko } from './messages/ko.js';
import type { Messages } from './messages/ko.js';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Messages };
  }
}

export function createI18n(language: Language): i18n {
  const instance = i18next.createInstance();
  // 리소스를 번들에 포함하므로 동기 초기화하여 첫 씬부터 번역을 쓸 수 있게 한다.
  void instance.init({
    lng: language,
    fallbackLng: false,
    initAsync: false,
    resources: {
      ko: { translation: ko },
      ja: { translation: ja },
      en: { translation: en },
    },
    // Phaser 텍스트는 HTML이 아니므로 이스케이프하지 않는다.
    interpolation: { escapeValue: false },
  });
  return instance;
}
