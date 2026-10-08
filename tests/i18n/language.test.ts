import { describe, expect, it } from 'vitest';
import { LANGUAGES, detectLanguage, parseLanguage } from '../../src/i18n/language.js';

describe('detectLanguage', () => {
  it.each([
    [['ko-KR'], 'ko'],
    [['ja'], 'ja'],
    [['EN-us'], 'en'],
    [['fr-FR', 'ja-JP', 'ko'], 'ja'],
  ])('picks the first supported language from %j', (preferred, expected) => {
    expect(detectLanguage(preferred)).toBe(expected);
  });

  it.each([[[]], [['fr', 'de-DE']], [['']]])('falls back to English for %j', (preferred) => {
    expect(detectLanguage(preferred)).toBe('en');
  });
});

describe('parseLanguage', () => {
  it.each(LANGUAGES)('accepts %s', (language) => {
    expect(parseLanguage(language)).toBe(language);
  });

  it.each([['KO'], ['fr'], [''], [null], [undefined], [1]])('rejects %j', (value) => {
    expect(parseLanguage(value)).toBeUndefined();
  });
});
