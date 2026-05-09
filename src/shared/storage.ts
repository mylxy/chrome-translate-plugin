import type { ExtensionSettings, TranslationCache } from "./types";

const API_KEY = "apiKey";
const TARGET_LANGUAGE = "targetLanguage";
const TRANSLATION_CACHE = "translationCache";

function storageGet<T>(keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items as T));
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
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
  return items.translationCache;
}

export async function saveTranslationCache(cache: TranslationCache): Promise<void> {
  await storageSet({ [TRANSLATION_CACHE]: cache });
}

export async function clearTranslationCache(): Promise<void> {
  await storageRemove([TRANSLATION_CACHE]);
}
