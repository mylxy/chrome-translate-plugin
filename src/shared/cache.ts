import { normalizeCacheText } from "./text";
import type { CacheEntry, TargetLanguage, TranslationCache, TranslationResult } from "./types";

export const MAX_CACHE_ENTRIES = 100;

export function emptyCache(): TranslationCache {
  return { entries: [] };
}

export function createCacheKey(text: string, targetLanguage: TargetLanguage): string {
  return `${normalizeCacheText(text)}::${targetLanguage}`;
}

export function findCacheEntry(
  cache: TranslationCache,
  text: string,
  targetLanguage: TargetLanguage
): CacheEntry | undefined {
  const key = createCacheKey(text, targetLanguage);
  return cache.entries.find((entry) => entry.key === key);
}

export function addCacheEntry(
  cache: TranslationCache,
  text: string,
  targetLanguage: TargetLanguage,
  result: TranslationResult,
  createdAt: number = Date.now()
): TranslationCache {
  const key = createCacheKey(text, targetLanguage);
  const existingIndex = cache.entries.findIndex((entry) => entry.key === key);
  const createdAtForEntry = existingIndex >= 0 ? cache.entries[existingIndex]!.createdAt : createdAt;
  const nextEntry: CacheEntry = {
    key,
    createdAt: createdAtForEntry,
    sourceText: result.sourceText,
    translation: result.translation
  };
  if (result.phonetic !== undefined) {
    nextEntry.phonetic = result.phonetic;
  }

  if (existingIndex >= 0) {
    const nextEntries = [...cache.entries];
    nextEntries[existingIndex] = nextEntry;
    return { entries: nextEntries };
  }

  const nextEntries = [...cache.entries, nextEntry];
  return { entries: nextEntries.slice(Math.max(0, nextEntries.length - MAX_CACHE_ENTRIES)) };
}
