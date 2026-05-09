# Bubble UI Polish and TTS End Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正气泡自适应尺寸、加载按钮换行问题，并在 TTS 播放自然结束后自动恢复播放按钮状态。

**Architecture:** 气泡渲染继续集中在 `src/content/bubble.ts`，通过计算 CSS 变量控制动态 padding 和最小宽度，并用内部 loading dots 元素避免换行。后台在 `chrome.tts.speak` 的 `onEvent` 中向来源 tab 发送 `speaking-ended` 消息；内容脚本注册 runtime listener 接收该消息并恢复播放状态，同时在 cleanup 中移除监听器。

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Vitest, jsdom, Chrome TTS API, Chrome Runtime Messaging.

---

## 文件结构

- Modify: `src/content/bubble.ts` - 动态 padding、最小宽度、单行 loading dots。
- Modify: `src/content/bubble.test.ts` - 覆盖 padding、最小宽度、loading dots。
- Modify: `src/shared/types.ts` - 新增 `SpeakingEndedMessage`。
- Modify: `src/background/index.ts` - TTS `onEvent` 回传 `speaking-ended`。
- Modify: `src/background/index.test.ts` - 覆盖 `onEvent` 和回传消息。
- Modify: `src/content/index.ts` - 监听 `speaking-ended`，恢复播放状态并清理 listener。
- Modify: `src/content/index.test.ts` - 覆盖播放结束恢复和 cleanup。

## 实现约定

- 默认气泡最小宽度为 `180px`，字号更大时按 `fontSize * 12` 增长。
- 最小宽度不能超过 `position.maxWidth`。
- 气泡 padding 使用 CSS 变量 `--dst-padding-y` 和 `--dst-padding-x`。
- 加载按钮中的三个点放入 `.dst-loading-dots`，设置 `white-space: nowrap`。
- 后台只在有 `sender.tab.id` 时发送 `speaking-ended`；没有 tab id 时仍正常播放。
- 结束事件类型包括 `end`、`interrupted`、`cancelled`、`error`。

---

### Task 1: 气泡尺寸和加载点

**Files:**
- Modify: `src/content/bubble.ts`
- Modify: `src/content/bubble.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `src/content/bubble.test.ts`:

```ts
it("sets padding variables from the configured font size", () => {
  renderTranslationBubble({
    result: { sourceText: "Learning", translation: "学习" },
    position,
    bubbleFontSize: 20,
  });

  const bubble = document.querySelector<HTMLElement>(".dst-bubble");

  expect(bubble?.style.getPropertyValue("--dst-padding-y")).toBe("17px");
  expect(bubble?.style.getPropertyValue("--dst-padding-x")).toBe("20px");
});

it("uses a readable minimum width without exceeding the available max width", () => {
  renderTranslationBubble({
    result: { sourceText: "A", translation: "一个" },
    position,
    bubbleFontSize: 12,
  });

  const bubble = document.querySelector<HTMLElement>(".dst-bubble");

  expect(bubble?.style.getPropertyValue("--dst-min-width")).toBe("180px");
  expect(bubble?.style.minWidth).toBe("180px");
});

it("caps the readable minimum width at the available max width", () => {
  renderTranslationBubble({
    result: { sourceText: "A", translation: "一个" },
    position: { ...position, maxWidth: 84 },
    bubbleFontSize: 12,
  });

  const bubble = document.querySelector<HTMLElement>(".dst-bubble");

  expect(bubble?.style.getPropertyValue("--dst-min-width")).toBe("84px");
  expect(bubble?.style.minWidth).toBe("84px");
});

it("renders loading dots as a non-wrapping inline element", () => {
  renderLoadingBubble({
    sourceText: "Learning",
    position,
    bubbleFontSize: 12,
  });

  const dots = document.querySelector<HTMLElement>(".dst-loading-dots");

  expect(dots?.textContent).toBe("•••");
  expect(dots?.className).toContain("dst-loading-dots");
});
```

Update the existing narrow width test expectation:

```ts
expect(bubble?.style.getPropertyValue("--dst-min-width")).toBe("84px");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/content/bubble.test.ts
```

Expected: FAIL，失败点包含缺少 `--dst-padding-y`、默认最小宽度仍为 `150px`、找不到 `.dst-loading-dots`。

- [ ] **Step 3: 实现动态 padding 和最小宽度**

Modify `src/content/bubble.ts` in `ensureStyles()`:

```css
padding: var(--dst-padding-y) var(--dst-padding-x);
```

Add helper functions near `getBubbleFontSize()`:

```ts
function getBubblePadding(fontSize: number): { x: number; y: number } {
  return {
    x: Math.max(12, Math.round(fontSize)),
    y: Math.max(10, Math.round(fontSize * 0.85)),
  };
}

function getBubbleMinWidth(fontSize: number, maxWidth: number): number {
  return Math.min(Math.max(180, fontSize * 12), maxWidth);
}
```

Update `createBubble()`:

```ts
const fontSize = getBubbleFontSize(bubbleFontSize);
const padding = getBubblePadding(fontSize);
const minWidth = `${getBubbleMinWidth(fontSize, position.maxWidth)}px`;
```

Set variables:

```ts
bubble.style.setProperty("--dst-padding-y", `${padding.y}px`);
bubble.style.setProperty("--dst-padding-x", `${padding.x}px`);
```

- [ ] **Step 4: 实现单行 loading dots**

Modify `ensureStyles()`:

```css
#deepseek-selection-translate-bubble .dst-control {
  display: grid;
  place-items: center;
  white-space: nowrap;
}

#deepseek-selection-translate-bubble .dst-loading-dots {
  display: inline-block;
  white-space: nowrap;
  line-height: 1;
}
```

Modify `renderLoadingBubble()`:

```ts
const loading = createControl("翻译中", "");
const dots = document.createElement("span");
dots.className = "dst-loading-dots";
dots.textContent = "•••";
loading.append(dots);
loading.disabled = true;
```

- [ ] **Step 5: 运行气泡测试**

Run:

```bash
npm test -- src/content/bubble.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交气泡细节**

```bash
git add src/content/bubble.ts src/content/bubble.test.ts
git commit -m "fix: polish bubble sizing and loading dots"
```

---

### Task 2: 后台回传 TTS 结束事件

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/background/index.ts`
- Modify: `src/background/index.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `src/background/index.test.ts`:

```ts
it("notifies the source tab when Chrome TTS ends", async () => {
  installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 12 });
  const runtime = installChromeRuntimeMock();
  const sendMessage = vi.fn();
  chrome.tabs = { sendMessage } as unknown as typeof chrome.tabs;
  chrome.tts = {
    stop: vi.fn(),
    speak: vi.fn()
  } as unknown as typeof chrome.tts;
  await importBackground();

  const listener = runtime.listeners[0];
  listener?.({ type: "speak-source", text: "Learning" }, { tab: { id: 7 } } as chrome.runtime.MessageSender, vi.fn());
  const options = vi.mocked(chrome.tts.speak).mock.calls[0]?.[1];
  options?.onEvent?.({ type: "end", charIndex: 8 });

  expect(sendMessage).toHaveBeenCalledWith(7, { type: "speaking-ended" });
});

it.each(["interrupted", "cancelled", "error"] as const)(
  "notifies the source tab when Chrome TTS emits %s",
  async (eventType) => {
    installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 12 });
    const runtime = installChromeRuntimeMock();
    const sendMessage = vi.fn();
    chrome.tabs = { sendMessage } as unknown as typeof chrome.tabs;
    chrome.tts = {
      stop: vi.fn(),
      speak: vi.fn()
    } as unknown as typeof chrome.tts;
    await importBackground();

    const listener = runtime.listeners[0];
    listener?.({ type: "speak-source", text: "Learning" }, { tab: { id: 7 } } as chrome.runtime.MessageSender, vi.fn());
    const options = vi.mocked(chrome.tts.speak).mock.calls[0]?.[1];
    options?.onEvent?.({ type: eventType, charIndex: 0 });

    expect(sendMessage).toHaveBeenCalledWith(7, { type: "speaking-ended" });
  }
);

it("does not throw when Chrome TTS ends without a source tab id", async () => {
  installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 12 });
  const runtime = installChromeRuntimeMock();
  const sendMessage = vi.fn();
  chrome.tabs = { sendMessage } as unknown as typeof chrome.tabs;
  chrome.tts = {
    stop: vi.fn(),
    speak: vi.fn()
  } as unknown as typeof chrome.tts;
  await importBackground();

  const listener = runtime.listeners[0];
  listener?.({ type: "speak-source", text: "Learning" }, {}, vi.fn());
  const options = vi.mocked(chrome.tts.speak).mock.calls[0]?.[1];

  expect(() => options?.onEvent?.({ type: "end", charIndex: 8 })).not.toThrow();
  expect(sendMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/background/index.test.ts
```

Expected: FAIL，失败点包含 `chrome.tts.speak` options 没有 `onEvent` 或没有发送 `speaking-ended`。

- [ ] **Step 3: 增加消息类型**

Modify `src/shared/types.ts`:

```ts
export interface SpeakingEndedMessage {
  type: "speaking-ended";
}
```

Add `SpeakingEndedMessage` to `RuntimeMessage`.

- [ ] **Step 4: 实现 TTS 事件回传**

Modify `src/background/index.ts`.

Add:

```ts
const TTS_DONE_EVENTS = new Set(["end", "interrupted", "cancelled", "error"]);

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
```

Change `speakSourceText` signature:

```ts
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
```

Update listener:

```ts
if (isSpeakSourceMessage(message)) {
  speakSourceText(message.text, _sender.tab?.id);
  return false;
}
```

- [ ] **Step 5: 运行后台测试**

Run:

```bash
npm test -- src/background/index.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交后台 TTS 结束事件**

```bash
git add src/shared/types.ts src/background/index.ts src/background/index.test.ts
git commit -m "fix: notify content when tts ends"
```

---

### Task 3: 内容脚本恢复播放按钮

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/content/index.test.ts`

- [ ] **Step 1: 写失败测试**

Update `installChrome()` in `src/content/index.test.ts` to include runtime listener storage:

```ts
const runtimeListeners: Array<(message: unknown) => void> = [];

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
```

Add tests:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/content/index.test.ts
```

Expected: FAIL，失败点包含没有注册 runtime message listener，或收到 `speaking-ended` 后按钮仍是暂停。

- [ ] **Step 3: 增加消息判断和处理**

Modify `src/content/index.ts`.

Add:

```ts
function isSpeakingEndedMessage(message: unknown): message is { type: "speaking-ended" } {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "speaking-ended"
  );
}

function handleRuntimeMessage(message: unknown): void {
  if (!isSpeakingEndedMessage(message) || !isSpeaking) {
    return;
  }

  isSpeaking = false;
  rerenderCurrentTranslation();
}
```

In `install()` add:

```ts
chrome.runtime.onMessage?.addListener?.(handleRuntimeMessage);
```

In cleanup add:

```ts
chrome.runtime.onMessage?.removeListener?.(handleRuntimeMessage);
```

- [ ] **Step 4: 运行内容脚本测试**

Run:

```bash
npm test -- src/content/index.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交内容脚本结束状态**

```bash
git add src/content/index.ts src/content/index.test.ts
git commit -m "fix: restore play state when tts ends"
```

---

### Task 4: 全量验证

**Files:**
- No code changes expected unless verification finds a defect.

- [ ] **Step 1: 运行类型检查、测试和构建**

Run:

```bash
npm run check
npm test
npm run build
```

Expected: `check` 退出码为 0，全部 Vitest 测试通过，生产构建退出码为 0。

- [ ] **Step 2: 检查构建产物**

Run:

```bash
test -f dist/manifest.json
test -f dist/assets/background.js
test -f dist/assets/content.js
test -f dist/src/options/index.html
```

Expected: 四个命令退出码均为 0。

- [ ] **Step 3: 手动验收**

Manual checks:

```text
1. 运行 npm run build。
2. 在 chrome://extensions 重新加载 dist/。
3. 默认 12px 字号下选中短词，确认气泡不会过窄。
4. 调大字号后重新选中短词，确认边距随字号变舒展。
5. 翻译加载时确认三个点始终横向一行显示。
6. 点击播放后按钮变成暂停。
7. 等语音自然结束后，按钮自动恢复播放状态。
8. 点击暂停停止播放后，按钮也恢复播放状态。
```

- [ ] **Step 4: 提交计划文档**

```bash
git add docs/superpowers/plans/2026-05-09-bubble-ui-polish-tts-end.md
git commit -m "docs: plan bubble polish and tts end handling"
```

---

## 计划自查

- 设计覆盖：Task 1 覆盖动态边距、最小宽度和加载点单行；Task 2 覆盖后台 TTS 结束事件回传；Task 3 覆盖内容脚本恢复播放按钮和 cleanup；Task 4 覆盖全量验证和手动验收。
- 占位扫描：计划没有 TBD、待定、稍后实现、补充测试等占位表达。
- 类型一致性：新增消息统一命名为 `SpeakingEndedMessage`，运行时消息类型统一为 `speaking-ended`。
