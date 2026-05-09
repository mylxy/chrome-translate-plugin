import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { TranslateResponse } from "../shared/types";

const BUBBLE_SELECTOR = "#deepseek-selection-translate-bubble";

type SendMessageMock = Mock<(message: unknown) => Promise<TranslateResponse>>;

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

function installChrome(sendMessage: SendMessageMock, openOptionsPage = vi.fn()) {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage,
      openOptionsPage,
    },
  });

  return { openOptionsPage };
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

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toBe("翻译中...");
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

  it("renders setup guidance for a missing API key and opens options from the setup button", async () => {
    const openOptionsPage = vi.fn();
    installChrome(sendMessage, openOptionsPage);
    await importContentScript();
    sendMessage.mockResolvedValue({ ok: false, code: "missing-api-key" });

    selectText("Configure me");
    await flushDebounce();
    await Promise.resolve();

    expect(document.querySelector(BUBBLE_SELECTOR)?.textContent).toContain(
      "请先配置 DeepSeek API Key",
    );
    document.querySelector<HTMLButtonElement>(".dst-open-options")?.click();

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
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
});
