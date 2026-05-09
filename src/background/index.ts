import { addCacheEntry, findCacheEntry } from "../shared/cache";
import { DeepSeekError, requestDeepSeekTranslation } from "../shared/deepseek";
import { getSettings, getTranslationCache, saveTranslationCache } from "../shared/storage";
import { shouldCacheSelection } from "../shared/text";
import type { TargetLanguage, TranslateRequestMessage, TranslateResponse, TranslationResult } from "../shared/types";

let cacheWriteQueue: Promise<void> = Promise.resolve();

function enqueueCacheWrite(text: string, targetLanguage: TargetLanguage, result: TranslationResult): Promise<void> {
  cacheWriteQueue = cacheWriteQueue.catch(() => undefined).then(async () => {
    const latestCache = await getTranslationCache();
    await saveTranslationCache(addCacheEntry(latestCache, text, targetLanguage, result));
  });
  return cacheWriteQueue;
}

export async function handleTranslateSelection(text: string): Promise<TranslateResponse> {
  try {
    const settings = await getSettings();
    const apiKey = settings.apiKey.trim();

    if (!apiKey) {
      return { ok: false, code: "missing-api-key" };
    }

    const cache = await getTranslationCache();
    const cached = findCacheEntry(cache, text, settings.targetLanguage);
    if (cached) {
      return { ok: true, fromCache: true, result: cached };
    }

    const result = await requestDeepSeekTranslation(apiKey, text, settings.targetLanguage);
    if (shouldCacheSelection(text)) {
      await enqueueCacheWrite(text, settings.targetLanguage, result);
    }

    return { ok: true, fromCache: false, result };
  } catch (error) {
    if (error instanceof DeepSeekError) {
      return { ok: false, code: error.code, message: error.message };
    }

    return { ok: false, code: "network-error", message: "翻译失败" };
  }
}

function isTranslateRequestMessage(message: unknown): message is TranslateRequestMessage {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as Partial<TranslateRequestMessage>).type === "translate-selection" &&
    typeof (message as Partial<TranslateRequestMessage>).text === "string"
  );
}

export function createTranslateSelectionListener(
  translateSelection: (text: string) => Promise<TranslateResponse> = handleTranslateSelection
) {
  return (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: TranslateResponse) => void) => {
    if (!isTranslateRequestMessage(message)) {
      return false;
    }

    translateSelection(message.text).then(sendResponse, () => {
      sendResponse({ ok: false, code: "network-error", message: "翻译失败" });
    });
    return true;
  };
}

chrome.runtime.onMessage.addListener(createTranslateSelectionListener());
