import type { Language } from '../i18n/language.js';

export interface Notice {
  readonly id: string;
  readonly createdAtMs: number;
  readonly title: Readonly<Record<Language, string>>;
  readonly body: Readonly<Record<Language, string>>;
}
