import { parseJson } from '../../../json.js';
import { isRecord } from '../../../typeGuards.js';

declare const __LOADING_MESSAGES__: Readonly<Record<string, string>>;
const messages = __LOADING_MESSAGES__;

function readSavedLanguage(): unknown {
  let text: string | null;
  try {
    text = localStorage.getItem('dazbeat:settings:v1');
  } catch {
    return undefined;
  }
  const settings = parseJson(text ?? '');
  return isRecord(settings) ? settings.language : undefined;
}

const language =
  [readSavedLanguage(), ...navigator.languages]
    .map((tag) => String(tag).split('-')[0]?.toLowerCase())
    .find((tag) => tag !== undefined && Object.hasOwn(messages, tag)) ?? 'en';
const message = messages[language] ?? '';
document.getElementById('loading-notice')?.replaceChildren(message);
document.getElementById('loading-stage')?.setAttribute('aria-label', message);
