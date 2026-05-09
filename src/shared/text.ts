const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const LETTER_OR_NUMBER_RE = /[\p{L}\p{N}]/u;

export function containsChinese(text: string): boolean {
  return CJK_RE.test(text);
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
  return LETTER_OR_NUMBER_RE.test(normalized);
}

export function shouldIgnoreSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (!isMeaningfulSelection(normalized)) return true;
  return containsChinese(normalized);
}

export function shouldCacheSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (shouldIgnoreSelection(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return normalized.length <= 48 && words.length <= 5;
}
