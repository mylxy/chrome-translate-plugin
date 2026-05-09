const HAN_RE = /\p{Script=Han}/u;
const LETTER_RE = /\p{L}/u;
const HAN_CHAR_RE = /\p{Script=Han}/gu;
const LETTER_OR_NUMBER_CHAR_RE = /[\p{L}\p{N}]/gu;

export const MAX_CACHE_TEXT_LENGTH = 48;
export const MAX_CACHE_WORD_COUNT = 5;

export function containsChinese(text: string): boolean {
  return HAN_RE.test(text);
}

export function normalizeSelection(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeCacheText(text: string): string {
  return normalizeSelection(text).toLocaleLowerCase("en-US");
}

export function isMeaningfulSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (normalized.length < 2) return false;
  return LETTER_RE.test(normalized);
}

function isMostlyChinese(text: string): boolean {
  const hanCount = text.match(HAN_CHAR_RE)?.length ?? 0;
  if (hanCount === 0) return false;

  const bodyCharacterCount = text.match(LETTER_OR_NUMBER_CHAR_RE)?.length ?? 0;
  if (bodyCharacterCount === 0) return false;

  return hanCount / bodyCharacterCount >= 0.5;
}

export function shouldIgnoreSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (!isMeaningfulSelection(normalized)) return true;
  return isMostlyChinese(normalized);
}

export function shouldCacheSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (shouldIgnoreSelection(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return normalized.length <= MAX_CACHE_TEXT_LENGTH && words.length <= MAX_CACHE_WORD_COUNT;
}
