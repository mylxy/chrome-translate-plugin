import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { ExtensionSettings, TranslateResponse } from "../shared/types";

const BUBBLE_SELECTOR = "#deepseek-selection-translate-bubble";

type SendMessageMock = Mock<(message: unknown) => Promise<TranslateResponse>>;
const runtimeListeners: Array<(message: unknown) => void> = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function setViewport(width = 800, height = 600): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

function installChrome(
  sendMessage: SendMessageMock,
  settings: ExtensionSettings = { apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 12 },
) {
  runtimeListeners.length = 0;
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) => {
          runtimeListeners.push(listener);
        }),
        removeListener: vi.fn((listener: (message: unknown) => void) => {
          const index = runtimeListeners.indexOf(listener);
          if (index >= 0) runtimeListeners.splice(index, 1);
        }),
      },
    },
    storage: {
      local: {
        get: vi.fn((keys: string[], callback: (items: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            result[key] = settings[key as keyof ExtensionSettings];
          }
          callback(result);
        }),
      },
    },
  });
}

function selectText(
  text: string,
  rect = { top: 100, bottom: 120, left: 200, width: 80, height: 20 },
) {
  const range = {
    getBoundingClientRect: vi.fn(() => rect),
  } as unknown as Range;
  const selection = {
    isCollapsed: false,
    rangeCount: 1,
    toString: vi.fn(() => text),
    getRangeAt: vi.fn(() => range),
  } as unknown as Selection;

  vi.spyOn(window, "getSelection").mockReturnValue(selection);
  document.dispatchEvent(new Event("selectionchange"));

  return { range, selection };
}

async function importContentScript() {
  vi.resetModules();
  await import("./index");
}

async function flushDebounce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(220);
  await Promise.resolve();
}

describe("content selection translation flow", () => {
  let sendMessage: SendMessageMock;

  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    setViewport();
    sendMessage = vi.fn<(message: unknown) => Promise<TranslateResponse>>();
    installChrome(sendMessage);
    await importContentScript();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows loading, sends an English selection, and renders the resolved translation", async () => {
    const response = deferred<TranslateResponse>();
    sendMessage.mockReturnValue(response.promise);

    selectText("Hello world");
    await flushDebounce();

    expect(document.querySelector(".dst-source")?.textContent).toBe("Hello world");
    expect(document.querySelector(".dst-control")?.textContent).toBe("•••");
    expect(document.querySelector(".dst-translation-placeholder")).not.toBeNull();
    expect(sendMessage).toHaveBeenCalledWith({
      type: "translate-selection",
      text: "Hello world",
    });

    response.resolve({
      ok: true,
      fromCache: false,
      result: {
        sourceText: "Hello world",
        translation: "你好，世界",
      },
    });
    await Promise.resolve();

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toContain(
      "你好，世界",
    );
  });

  it("applies the saved bubble font size to the loading and translated bubble", async () => {
    sendMessage.mockResolvedValueOnce({
      ok: true,
      fromCache: false,
      result: { sourceText: "Hello world", translation: "你好，世界" },
    });
    installChrome(sendMessage, { apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 18 });
    await importContentScript();

    selectText("Hello world");
    await flushDebounce();
    await Promise.resolve();

    expect(document.querySelector<HTMLElement>(BUBBLE_SELECTOR)?.style.getPropertyValue("--dst-font-size")).toBe("18px");
  });

  it("asks the background to play the source text when the play button is clicked", async () => {
    sendMessage
      .mockResolvedValueOnce({
        ok: true,
        fromCache: false,
        result: {
          sourceText: "Hello world",
          translation: "你好，世界",
        },
      })
      .mockResolvedValueOnce(undefined as unknown as TranslateResponse);

    selectText("Hello world");
    await flushDebounce();
    await Promise.resolve();

    document.querySelector<HTMLButtonElement>(".dst-play")?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({
      type: "speak-source",
      text: "Hello world",
    });
  });

  it("toggles playback between speak-source and stop-speaking messages", async () => {
    sendMessage
      .mockResolvedValueOnce({
        ok: true,
        fromCache: false,
        result: {
          sourceText: "Hello world",
          translation: "你好，世界",
        },
      })
      .mockResolvedValueOnce(undefined as unknown as TranslateResponse)
      .mockResolvedValueOnce(undefined as unknown as TranslateResponse);

    selectText("Hello world");
    await flushDebounce();
    await Promise.resolve();

    document.querySelector<HTMLButtonElement>(".dst-control")?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({ type: "speak-source", text: "Hello world" });
    expect(document.querySelector(".dst-control")?.textContent).toBe("Ⅱ");

    document.querySelector<HTMLButtonElement>(".dst-control")?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({ type: "stop-speaking" });
    expect(document.querySelector(".dst-control")?.textContent).toBe("▶");
  });

  it("restores the play button when the background reports speaking ended", async () => {
    sendMessage
      .mockResolvedValueOnce({
        ok: true,
        fromCache: false,
        result: { sourceText: "Hello world", translation: "你好，世界" },
      })
      .mockResolvedValueOnce(undefined as unknown as TranslateResponse);

    selectText("Hello world");
    await flushDebounce();
    await Promise.resolve();

    document.querySelector<HTMLButtonElement>(".dst-control")?.click();
    await Promise.resolve();
    expect(document.querySelector(".dst-control")?.textContent).toBe("Ⅱ");

    runtimeListeners[0]?.({ type: "speaking-ended" });

    expect(document.querySelector(".dst-control")?.textContent).toBe("▶");
  });

  it("removes the background message listener during content cleanup", async () => {
    expect(runtimeListeners).toHaveLength(1);

    await importContentScript();

    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
    expect(runtimeListeners).toHaveLength(1);
  });

  it("does not send before the debounce delay elapses", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      fromCache: false,
      result: { sourceText: "Hello world", translation: "你好，世界" },
    });

    selectText("Hello world");
    await vi.advanceTimersByTimeAsync(219);
    await Promise.resolve();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector(".dst-source")?.textContent).toBe("Hello world");
    expect(document.querySelector(".dst-control")?.textContent).toBe("•••");
  });

  it("only translates the last selection after consecutive selection changes", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      fromCache: false,
      result: { sourceText: "Second selection", translation: "第二个" },
    });

    selectText("First selection");
    await vi.advanceTimersByTimeAsync(100);
    selectText("Second selection");
    await flushDebounce();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "translate-selection",
      text: "Second selection",
    });
  });

  it("hides the bubble and skips messaging for Chinese selections", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      fromCache: false,
      result: { sourceText: "Hello world", translation: "你好，世界" },
    });
    selectText("Hello world");
    await flushDebounce();
    await Promise.resolve();
    expect(document.querySelector(BUBBLE_SELECTOR)).not.toBeNull();

    sendMessage.mockClear();
    selectText("这是一段中文");
    await flushDebounce();

    expect(document.querySelector(BUBBLE_SELECTOR)).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("renders setup guidance for a missing API key and asks the background to open options", async () => {
    sendMessage
      .mockResolvedValueOnce({ ok: false, code: "missing-api-key" })
      .mockResolvedValueOnce(undefined as unknown as TranslateResponse);

    selectText("Configure me");
    await flushDebounce();
    await Promise.resolve();

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toContain(
      "请先配置 DeepSeek API Key",
    );
    document.querySelector<HTMLButtonElement>(".dst-open-options")?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({ type: "open-options" });
  });

  it.each(["   ", "..."])(
    "hides the bubble and skips messaging for meaningless selection %#",
    async (text) => {
      selectText(text);
      await flushDebounce();

      expect(document.querySelector(BUBBLE_SELECTOR)).toBeNull();
      expect(sendMessage).not.toHaveBeenCalled();
    },
  );

  it("hides and skips messaging when the selection rect has zero width and zero height", async () => {
    selectText("Invisible text", {
      top: 100,
      bottom: 100,
      left: 200,
      width: 0,
      height: 0,
    });
    await flushDebounce();

    expect(document.querySelector(BUBBLE_SELECTOR)).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("allows a single zero rect dimension when the other dimension is usable", async () => {
    const response = deferred<TranslateResponse>();
    sendMessage.mockReturnValue(response.promise);

    selectText("Tall caret selection", {
      top: 100,
      bottom: 120,
      left: 200,
      width: 0,
      height: 20,
    });
    await flushDebounce();

    expect(sendMessage).toHaveBeenCalledWith({
      type: "translate-selection",
      text: "Tall caret selection",
    });
    expect(document.querySelector(".dst-source")?.textContent).toBe("Tall caret selection");
    expect(document.querySelector(".dst-control")?.textContent).toBe("•••");
  });

  it("renders a failure message when sendMessage rejects", async () => {
    sendMessage.mockRejectedValue(new Error("boom"));

    selectText("Network failure");
    await flushDebounce();
    await Promise.resolve();

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toBe(
      "翻译失败，请重新选择文本",
    );
  });

  it("renders a failure message for non-setup error responses", async () => {
    sendMessage.mockResolvedValue({
      ok: false,
      code: "network-error",
      message: "failed",
    });

    selectText("Server failure");
    await flushDebounce();
    await Promise.resolve();

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toBe(
      "翻译失败，请重新选择文本",
    );
  });

  it("closes the bubble on Escape", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      fromCache: false,
      result: { sourceText: "Close me", translation: "关闭我" },
    });

    selectText("Close me");
    await flushDebounce();
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector(BUBBLE_SELECTOR)).toBeNull();
  });

  it("cancels a pending debounced selection on Escape", async () => {
    selectText("Pending selection");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushDebounce();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector(BUBBLE_SELECTOR)).toBeNull();
  });

  it("cancels a pending debounced selection on outside mousedown", async () => {
    selectText("Pending selection");

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushDebounce();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector(BUBBLE_SELECTOR)).toBeNull();
  });

  it("closes on outside mousedown but keeps the bubble for internal mousedown", async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      fromCache: false,
      result: { sourceText: "Keep me", translation: "保留我" },
    });

    selectText("Keep me");
    await flushDebounce();
    await Promise.resolve();
    const bubble = document.querySelector<HTMLElement>(BUBBLE_SELECTOR);

    bubble?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.querySelector(BUBBLE_SELECTOR)).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.querySelector(BUBBLE_SELECTOR)).toBeNull();
  });

  it("does not let a stale response replace the latest translation", async () => {
    const first = deferred<TranslateResponse>();
    const second = deferred<TranslateResponse>();
    sendMessage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    selectText("First selection");
    await flushDebounce();
    selectText("Second selection");
    await flushDebounce();

    second.resolve({
      ok: true,
      fromCache: false,
      result: { sourceText: "Second selection", translation: "第二个" },
    });
    await Promise.resolve();

    first.resolve({
      ok: true,
      fromCache: false,
      result: { sourceText: "First selection", translation: "第一个" },
    });
    await Promise.resolve();

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toContain("第二个");
    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).not.toContain("第一个");
  });

  it("invalidates an in-flight response as soon as the selection changes", async () => {
    const first = deferred<TranslateResponse>();
    const second = deferred<TranslateResponse>();
    sendMessage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    selectText("First selection");
    await flushDebounce();
    selectText("Second selection");

    first.resolve({
      ok: true,
      fromCache: false,
      result: { sourceText: "First selection", translation: "第一个" },
    });
    await Promise.resolve();

    expect(document.querySelector(".dst-source")?.textContent).toBe("Second selection");
    expect(document.querySelector(".dst-control")?.textContent).toBe("•••");

    await flushDebounce();
    second.resolve({
      ok: true,
      fromCache: false,
      result: { sourceText: "Second selection", translation: "第二个" },
    });
    await Promise.resolve();

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toContain("第二个");
    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).not.toContain("第一个");
  });
});
