import type { CacheEntry, ExtensionSettings, TranslationCache } from "./types";

const API_KEY = "apiKey";
const TARGET_LANGUAGE = "targetLanguage";
const TRANSLATION_CACHE = "translationCache";

function storageGet<T>(keys: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "Chrome storage operation failed"));
        return;
      }
      resolve(items as T);
    });
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "Chrome storage operation failed"));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "Chrome storage operation failed"));
        return;
      }
      resolve();
    });
  });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const items = await storageGet<Partial<ExtensionSettings>>([API_KEY, TARGET_LANGUAGE]);
  return {
    apiKey: typeof items.apiKey === "string" ? items.apiKey : "",
    targetLanguage: typeof items.targetLanguage === "string" ? items.targetLanguage : "zh-CN"
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await storageSet({
    [API_KEY]: settings.apiKey,
    [TARGET_LANGUAGE]: settings.targetLanguage
  });
}

export async function getTranslationCache(): Promise<TranslationCache> {
  const items = await storageGet<{ translationCache?: TranslationCache }>([TRANSLATION_CACHE]);
  if (!items.translationCache || !Array.isArray(items.translationCache.entries)) {
    return { entries: [] };
  }
  return {
    entries: items.translationCache.entries.flatMap((entry) => {
      const cleanEntry = cleanCacheEntry(entry);
      return cleanEntry ? [cleanEntry] : [];
    })
  };
}

export async function saveTranslationCache(cache: TranslationCache): Promise<void> {
  await storageSet({ [TRANSLATION_CACHE]: cache });
}

export async function clearTranslationCache(): Promise<void> {
  await storageRemove([TRANSLATION_CACHE]);
}

function cleanCacheEntry(entry: unknown): CacheEntry | undefined {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }

  const candidate = entry as Partial<Record<keyof CacheEntry, unknown>>;
  if (
    typeof candidate.key !== "string" ||
    typeof candidate.sourceText !== "string" ||
    typeof candidate.translation !== "string" ||
    typeof candidate.createdAt !== "number" ||
    !Number.isFinite(candidate.createdAt) ||
    (candidate.phonetic !== undefined && typeof candidate.phonetic !== "string")
  ) {
    return undefined;
  }

  const cleanEntry: CacheEntry = {
    key: candidate.key,
    sourceText: candidate.sourceText,
    translation: candidate.translation,
    createdAt: candidate.createdAt
  };

  if (typeof candidate.phonetic === "string") {
    cleanEntry.phonetic = candidate.phonetic;
  }

  return cleanEntry;
}
