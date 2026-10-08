export type Language = 'ko' | 'ja' | 'en';

export const LANGUAGES: readonly Language[] = ['ko', 'ja', 'en'];

// 언어 이름은 현재 UI 언어와 무관하게 각 언어로 표기해야 선택할 수 있다.
export const LANGUAGE_NAMES: Record<Language, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
};

const FALLBACK_LANGUAGE: Language = 'en';

export function parseLanguage(value: unknown): Language | undefined {
  return LANGUAGES.find((language) => language === value);
}

/** 브라우저 선호 언어 목록(`navigator.languages`)에서 지원 언어를 고른다. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const language = parseLanguage(tag.split('-')[0]?.toLowerCase());
    if (language !== undefined) {
      return language;
    }
  }
  return FALLBACK_LANGUAGE;
}
