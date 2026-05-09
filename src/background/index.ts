import { addCacheEntry, findCacheEntry } from "../shared/cache";
import { DeepSeekError, requestDeepSeekTranslation } from "../shared/deepseek";
import { getSettings, getTranslationCache, saveTranslationCache } from "../shared/storage";
import { shouldCacheSelection } from "../shared/text";
import type {
  OpenOptionsMessage,
  SpeakSourceMessage,
  StopSpeakingMessage,
  TargetLanguage,
  TranslateRequestMessage,
  TranslateResponse,
  TranslationResult,
} from "../shared/types";

const FIXED_TARGET_LANGUAGE: TargetLanguage = "zh-CN";
const TTS_DONE_EVENTS = new Set(["end", "interrupted", "cancelled", "error"]);
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
    const cached = findCacheEntry(cache, text, FIXED_TARGET_LANGUAGE);
    if (cached) {
      return { ok: true, fromCache: true, result: cached };
    }

    const result = await requestDeepSeekTranslation(apiKey, text, FIXED_TARGET_LANGUAGE);
    if (shouldCacheSelection(text)) {
      try {
        await enqueueCacheWrite(text, FIXED_TARGET_LANGUAGE, result);
      } catch {
        // Cache persistence is best effort; a translated result should still reach the user.
      }
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

function isOpenOptionsMessage(message: unknown): message is OpenOptionsMessage {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as Partial<OpenOptionsMessage>).type === "open-options"
  );
}

function isSpeakSourceMessage(message: unknown): message is SpeakSourceMessage {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as Partial<SpeakSourceMessage>).type === "speak-source" &&
    typeof (message as Partial<SpeakSourceMessage>).text === "string" &&
    (message as Partial<SpeakSourceMessage>).text!.trim().length > 0
  );
}

function isStopSpeakingMessage(message: unknown): message is StopSpeakingMessage {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as Partial<StopSpeakingMessage>).type === "stop-speaking"
  );
}

function openOptionsPage(): void {
  try {
    const maybePromise = chrome.runtime.openOptionsPage?.();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => undefined);
    }
  } catch {
    // Opening options is best effort from the background listener.
  }
}

function stopSpeaking(): void {
  try {
    chrome.tts?.stop?.();
  } catch {
    // Browser TTS stop is best effort from the background listener.
  }
}

function notifySpeakingEnded(tabId: number | undefined): void {
  if (typeof tabId !== "number") return;

  try {
    const maybePromise = chrome.tabs?.sendMessage?.(tabId, { type: "speaking-ended" });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => undefined);
    }
  } catch {
    // Speaking-ended notifications are best effort.
  }
}

function speakSourceText(text: string, tabId?: number): void {
  try {
    chrome.tts?.stop?.();
    chrome.tts?.speak?.(text, {
      enqueue: false,
      rate: 1,
      onEvent: (event) => {
        if (TTS_DONE_EVENTS.has(event.type)) {
          notifySpeakingEnded(tabId);
        }
      }
    });
  } catch {
    // Browser TTS is best effort from the background listener.
  }
}

export function createTranslateSelectionListener(
  translateSelection: (text: string) => Promise<TranslateResponse> = handleTranslateSelection
) {
  return (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: TranslateResponse) => void) => {
    if (isOpenOptionsMessage(message)) {
      openOptionsPage();
      return false;
    }

    if (isSpeakSourceMessage(message)) {
      speakSourceText(message.text, _sender.tab?.id);
      return false;
    }

    if (isStopSpeakingMessage(message)) {
      stopSpeaking();
      return false;
    }

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
