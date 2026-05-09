import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCacheEntry, emptyCache } from "../shared/cache";
import { DeepSeekError } from "../shared/deepseek";
import type { TranslationCache, TranslationResult } from "../shared/types";
import { installChromeRuntimeMock, installChromeStorageMock, setChromeStorageError } from "../test/chromeMock";

const { requestDeepSeekTranslationMock } = vi.hoisted(() => ({
  requestDeepSeekTranslationMock: vi.fn()
}));

vi.mock("../shared/deepseek", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/deepseek")>();
  return {
    ...actual,
    requestDeepSeekTranslation: requestDeepSeekTranslationMock
  };
});

async function importBackground(): Promise<typeof import("./index")> {
  return import("./index");
}

describe("background translation handling", () => {
  beforeEach(() => {
    vi.resetModules();
    requestDeepSeekTranslationMock.mockReset();
    installChromeStorageMock();
    installChromeRuntimeMock();
  });

  it("returns missing-api-key when the API key is empty", async () => {
    const { handleTranslateSelection } = await importBackground();

    await expect(handleTranslateSelection("Learning")).resolves.toEqual({
      ok: false,
      code: "missing-api-key"
    });
    expect(requestDeepSeekTranslationMock).not.toHaveBeenCalled();
  });

  it("returns a cached result without calling DeepSeek", async () => {
    const cachedResult: TranslationResult = {
      sourceText: "Learning",
      phonetic: "/ˈlɜːrnɪŋ/",
      translation: "学习"
    };
    installChromeStorageMock({
      apiKey: "sk-test",
      targetLanguage: "zh-CN",
      translationCache: addCacheEntry(emptyCache(), "Learning", "zh-CN", cachedResult, 1)
    });
    installChromeRuntimeMock();
    const { handleTranslateSelection } = await importBackground();

    await expect(handleTranslateSelection(" learning ")).resolves.toEqual({
      ok: true,
      fromCache: true,
      result: {
        ...cachedResult,
        key: "learning::zh-CN",
        createdAt: 1
      }
    });
    expect(requestDeepSeekTranslationMock).not.toHaveBeenCalled();
  });

  it("calls DeepSeek on cache miss and stores a short phrase result", async () => {
    const storage = installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    installChromeRuntimeMock();
    const result: TranslationResult = {
      sourceText: "Learning curve",
      phonetic: "/ˈlɜːrnɪŋ kɜːrv/",
      translation: "学习曲线"
    };
    requestDeepSeekTranslationMock.mockResolvedValueOnce(result);
    const { handleTranslateSelection } = await importBackground();

    await expect(handleTranslateSelection("Learning curve")).resolves.toEqual({
      ok: true,
      fromCache: false,
      result
    });
    expect(requestDeepSeekTranslationMock).toHaveBeenCalledWith("sk-test", "Learning curve", "zh-CN");
    expect(storage.translationCache).toMatchObject({
      entries: [
        {
          key: "learning curve::zh-CN",
          sourceText: "Learning curve",
          phonetic: "/ˈlɜːrnɪŋ kɜːrv/",
          translation: "学习曲线"
        }
      ]
    });
  });

  it("merges concurrent short phrase cache writes with the latest stored cache", async () => {
    const storage = installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    installChromeRuntimeMock();
    const firstResult: TranslationResult = { sourceText: "Alpha", translation: "阿尔法" };
    const secondResult: TranslationResult = { sourceText: "Beta", translation: "贝塔" };
    let resolveFirst!: (result: TranslationResult) => void;
    let resolveSecond!: (result: TranslationResult) => void;
    requestDeepSeekTranslationMock
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecond = resolve;
      }));
    const { handleTranslateSelection } = await importBackground();

    const firstTranslation = handleTranslateSelection("Alpha");
    const secondTranslation = handleTranslateSelection("Beta");
    await vi.waitFor(() => {
      expect(requestDeepSeekTranslationMock).toHaveBeenCalledTimes(2);
    });
    resolveFirst(firstResult);
    await firstTranslation;
    resolveSecond(secondResult);
    await secondTranslation;

    const savedCache = storage.translationCache as TranslationCache;
    expect(savedCache.entries.map((entry) => entry.key).sort()).toEqual(["alpha::zh-CN", "beta::zh-CN"]);
  });

  it("preserves both entries when simultaneous cache writes reread the same stale snapshot", async () => {
    installChromeStorageMock();
    installChromeRuntimeMock();
    const stored = {
      apiKey: "sk-test",
      targetLanguage: "zh-CN",
      translationCache: emptyCache()
    };
    let cacheReadCount = 0;
    const localStorage = chrome.storage.local as unknown as {
      get: typeof chrome.storage.local.get;
      set: typeof chrome.storage.local.set;
    };
    localStorage.get = vi.fn((keys: string[] | string | Record<string, unknown> | null, callback?: (items: Record<string, unknown>) => void) => {
      if (!callback) return;

      const keyList = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : [];
      if (keys === null || keyList.includes("apiKey") || keyList.includes("targetLanguage")) {
        callback({ apiKey: stored.apiKey, targetLanguage: stored.targetLanguage });
        return;
      }

      if (keyList.includes("translationCache")) {
        cacheReadCount += 1;
        const snapshot: TranslationCache = {
          entries: stored.translationCache.entries.map((entry) => ({ ...entry }))
        };

        if (cacheReadCount <= 2) {
          callback({ translationCache: snapshot });
          return;
        }

        setTimeout(() => callback({ translationCache: snapshot }), 0);
      }
    }) as unknown as typeof chrome.storage.local.get;
    localStorage.set = vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      if (items.translationCache) {
        stored.translationCache = items.translationCache as TranslationCache;
      }
      callback?.();
    }) as unknown as typeof chrome.storage.local.set;

    const firstResult: TranslationResult = { sourceText: "Alpha", translation: "阿尔法" };
    const secondResult: TranslationResult = { sourceText: "Beta", translation: "贝塔" };
    let resolveFirst!: (result: TranslationResult) => void;
    let resolveSecond!: (result: TranslationResult) => void;
    requestDeepSeekTranslationMock
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecond = resolve;
      }));
    const { handleTranslateSelection } = await importBackground();

    const firstTranslation = handleTranslateSelection("Alpha");
    const secondTranslation = handleTranslateSelection("Beta");
    await vi.waitFor(() => {
      expect(requestDeepSeekTranslationMock).toHaveBeenCalledTimes(2);
    });
    resolveFirst(firstResult);
    resolveSecond(secondResult);
    await Promise.all([firstTranslation, secondTranslation]);

    expect(stored.translationCache.entries.map((entry) => entry.key).sort()).toEqual(["alpha::zh-CN", "beta::zh-CN"]);
  });

  it("does not save long sentence results to the translation cache", async () => {
    const storage = installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    installChromeRuntimeMock();
    const result: TranslationResult = {
      sourceText: "This is a longer sentence that should not be cached by the extension",
      translation: "这是一句不应该被扩展缓存的长句子"
    };
    requestDeepSeekTranslationMock.mockResolvedValueOnce(result);
    const { handleTranslateSelection } = await importBackground();

    await expect(handleTranslateSelection(result.sourceText)).resolves.toEqual({
      ok: true,
      fromCache: false,
      result
    });
    expect(storage.translationCache).toBeUndefined();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("returns a successful translation when saving a short phrase to cache fails", async () => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    installChromeRuntimeMock();
    setChromeStorageError("set", "cache write failed");
    const result: TranslationResult = { sourceText: "Learning", translation: "学习" };
    requestDeepSeekTranslationMock.mockResolvedValueOnce(result);
    const { handleTranslateSelection } = await importBackground();

    await expect(handleTranslateSelection("Learning")).resolves.toEqual({
      ok: true,
      fromCache: false,
      result
    });
  });

  it("continues cache writes after a previous queued cache write fails", async () => {
    const storage = installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    installChromeRuntimeMock();
    setChromeStorageError("set", "first cache write failed");
    const firstResult: TranslationResult = { sourceText: "Alpha", translation: "阿尔法" };
    const secondResult: TranslationResult = { sourceText: "Beta", translation: "贝塔" };
    requestDeepSeekTranslationMock.mockResolvedValueOnce(firstResult).mockResolvedValueOnce(secondResult);
    const { handleTranslateSelection } = await importBackground();

    await handleTranslateSelection("Alpha");
    await expect(handleTranslateSelection("Beta")).resolves.toEqual({
      ok: true,
      fromCache: false,
      result: secondResult
    });

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);
    expect((storage.translationCache as TranslationCache).entries.map((entry) => entry.key)).toContain("beta::zh-CN");
  });

  it.each([
    ["invalid-response" as const, "DeepSeek returned invalid JSON"],
    ["api-error" as const, "DeepSeek API failed"],
    ["network-error" as const, "DeepSeek request failed"]
  ])("maps DeepSeekError code %s to the same response code and message", async (code, message) => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    installChromeRuntimeMock();
    requestDeepSeekTranslationMock.mockRejectedValueOnce(new DeepSeekError(code, message));
    const { handleTranslateSelection } = await importBackground();

    await expect(handleTranslateSelection("Learning")).resolves.toEqual({
      ok: false,
      code,
      message
    });
  });

  it("maps unknown errors to a generic network-error response", async () => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    installChromeRuntimeMock();
    requestDeepSeekTranslationMock.mockRejectedValueOnce(new Error("socket closed"));
    const { handleTranslateSelection } = await importBackground();

    await expect(handleTranslateSelection("Learning")).resolves.toEqual({
      ok: false,
      code: "network-error",
      message: "翻译失败"
    });
  });

  it("registers an async runtime listener for translate-selection messages", async () => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    const runtime = installChromeRuntimeMock();
    const result: TranslationResult = { sourceText: "Learning", translation: "学习" };
    requestDeepSeekTranslationMock.mockResolvedValueOnce(result);

    await importBackground();

    const listener = runtime.listeners[0];
    expect(listener).toBeDefined();
    const sendResponse = vi.fn();
    const returnValue = listener!({ type: "translate-selection", text: "Learning" }, {}, sendResponse);

    expect(returnValue).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        fromCache: false,
        result
      });
    });
  });

  it("opens the options page for open-options runtime messages", async () => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    const runtime = installChromeRuntimeMock();
    const openOptionsPage = vi.fn();
    chrome.runtime.openOptionsPage = openOptionsPage;
    await importBackground();

    const listener = runtime.listeners[0];
    const sendResponse = vi.fn();

    expect(listener?.({ type: "open-options" }, {}, sendResponse)).toBe(false);
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(requestDeepSeekTranslationMock).not.toHaveBeenCalled();
  });

  it("ignores runtime messages that are not supported requests", async () => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    const runtime = installChromeRuntimeMock();
    await importBackground();

    const listener = runtime.listeners[0];
    const sendResponse = vi.fn();

    expect(listener?.({ type: "unknown-message" }, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(requestDeepSeekTranslationMock).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "translate-selection", 42, { type: "translate-selection" }, { type: "translate-selection", text: 42 }])(
    "ignores invalid runtime translate messages %#",
    async (message) => {
      installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
      const runtime = installChromeRuntimeMock();
      await importBackground();

      const listener = runtime.listeners[0];
      const sendResponse = vi.fn();

      expect(listener?.(message, {}, sendResponse)).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
      expect(requestDeepSeekTranslationMock).not.toHaveBeenCalled();
    }
  );

  it("sends a generic error response when the listener translation path fails", async () => {
    installChromeStorageMock();
    installChromeRuntimeMock();
    const { createTranslateSelectionListener } = await importBackground();
    const listener = createTranslateSelectionListener(async () => Promise.reject(new Error("boom")));

    const sendResponse = vi.fn();
    const returnValue = listener({ type: "translate-selection", text: "Learning" }, {}, sendResponse);

    expect(returnValue).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        code: "network-error",
        message: "翻译失败"
      });
    });
  });

  it("sends a generic error response when storage fails during runtime handling", async () => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    setChromeStorageError("get", "storage offline");
    const runtime = installChromeRuntimeMock();
    await importBackground();

    const listener = runtime.listeners[0];
    const sendResponse = vi.fn();
    const returnValue = listener?.({ type: "translate-selection", text: "Learning" }, {}, sendResponse);

    expect(returnValue).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        code: "network-error",
        message: "翻译失败"
      });
    });
  });
});
