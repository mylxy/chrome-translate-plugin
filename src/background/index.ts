import { addCacheEntry, findCacheEntry } from "../shared/cache";
import { DeepSeekError, requestDeepSeekTranslation } from "../shared/deepseek";
import { getSettings, getTranslationCache, saveTranslationCache } from "../shared/storage";
import { shouldCacheSelection } from "../shared/text";
import type { TranslateRequestMessage, TranslateResponse } from "../shared/types";

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
      await saveTranslationCache(addCacheEntry(cache, text, settings.targetLanguage, result));
    }

    return { ok: true, fromCache: false, result };
  } catch (error) {
    if (error instanceof DeepSeekError) {
      return { ok: false, code: error.code, message: error.message };
    }

    return { ok: false, code: "network-error", message: "翻译失败" };
  }
}

chrome.runtime.onMessage.addListener((message: TranslateRequestMessage, _sender, sendResponse) => {
  if (message.type !== "translate-selection") {
    return false;
  }

  handleTranslateSelection(message.text).then(sendResponse);
  return true;
});
