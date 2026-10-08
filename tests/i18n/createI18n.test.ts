import { describe, expect, it } from 'vitest';
import { createI18n } from '../../src/i18n/createI18n.js';

describe('createI18n', () => {
  it('translates in the given language right after creation', () => {
    expect(createI18n('ja').t('settings.title')).toBe('設定');
  });

  it('interpolates values without HTML escaping', () => {
    const i18n = createI18n('en');
    expect(i18n.t('youtubeError.withCode', { message: '<b>&', code: 2 })).toBe('<b>& (error 2)');
  });

  it('switches language', async () => {
    const i18n = createI18n('ko');
    await i18n.changeLanguage('en');
    expect(i18n.t('settings.rows.laneKey', { lane: 3 })).toBe('Lane 3 Key');
  });
});
