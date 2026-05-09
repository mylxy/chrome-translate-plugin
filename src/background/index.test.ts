import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCacheEntry, emptyCache } from "../shared/cache";
import { DeepSeekError } from "../shared/deepseek";
import type { TranslateRequestMessage, TranslationResult } from "../shared/types";
import { installChromeStorageMock } from "../test/chromeMock";

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

type MessageListener = (
  message: TranslateRequestMessage | { type: string; text?: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | undefined;

function installChromeRuntimeMock(): { listeners: MessageListener[] } {
  const listeners: MessageListener[] = [];

  const currentChrome = globalThis.chrome as Partial<typeof chrome> | undefined;
  globalThis.chrome = {
    ...currentChrome,
    runtime: {
      ...(currentChrome?.runtime ?? {}),
      lastError: undefined,
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          listeners.push(listener);
        })
      }
    }
  } as unknown as typeof chrome;

  return { listeners };
}

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
});
