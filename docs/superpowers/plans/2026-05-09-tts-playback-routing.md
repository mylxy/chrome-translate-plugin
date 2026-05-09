# TTS Playback Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复并加固翻译气泡播放按钮，让点击播放稳定调用 Chrome 扩展原生 TTS。

**Architecture:** 内容脚本只负责把“播放原文”动作发送给后台，不直接依赖网页环境中的 Web Speech API。后台 Service Worker 接收 `speak-source` 消息后调用 `chrome.tts.stop()` 和 `chrome.tts.speak()`，并通过 Manifest `tts` 权限启用浏览器原生语音能力。

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Vitest, jsdom, Chrome Runtime Messaging, Chrome TTS API.

---

## 文件结构

- Modify: `public/manifest.json` - 增加 `tts` 权限。
- Modify: `src/shared/types.ts` - 增加 `SpeakSourceMessage` 消息类型。
- Modify: `src/content/bubble.ts` - 气泡播放按钮支持外部播放回调。
- Modify: `src/content/index.ts` - 点击播放时发送 `speak-source` 消息。
- Modify: `src/background/index.ts` - 后台处理 `speak-source` 并调用 Chrome TTS。
- Modify: `src/content/bubble.test.ts` - 覆盖无 Web Speech API 但有播放回调时按钮可用。
- Modify: `src/content/index.test.ts` - 覆盖点击按钮会发送 `speak-source`。
- Modify: `src/background/index.test.ts` - 覆盖后台调用 `chrome.tts.speak`。

## 实现约定

- 播放文本使用翻译结果中的 `sourceText`。
- `speak-source` 的 `text` 必须是非空字符串。
- 后台调用 TTS 前先调用 `chrome.tts.stop()`，避免多次点击叠音。
- TTS 是辅助能力，调用失败时静默处理，不影响翻译气泡显示。
- 内容脚本仍保留气泡级播放回调接口，便于测试和未来替换播放实现。

---

### Task 1: 写播放路径回归测试

**Files:**
- Modify: `src/content/bubble.test.ts`
- Modify: `src/content/index.test.ts`
- Modify: `src/background/index.test.ts`

- [ ] **Step 1: 为气泡播放回调写失败测试**

在 `src/content/bubble.test.ts` 的 `describe("bubble renderer", ...)` 内追加：

```ts
it("uses a provided source playback handler when browser TTS is unavailable", () => {
  vi.stubGlobal("speechSynthesis", undefined);
  vi.stubGlobal("SpeechSynthesisUtterance", undefined);
  const speakSource = vi.fn();

  renderTranslationBubble({
    result: { sourceText: "Learning", translation: "学习" },
    position,
    speakSource,
  });

  const play = document.querySelector<HTMLButtonElement>(".dst-play");

  expect(play?.disabled).toBe(false);
  play?.click();
  expect(speakSource).toHaveBeenCalledWith("Learning");
});
```

- [ ] **Step 2: 为内容脚本消息发送写失败测试**

在 `src/content/index.test.ts` 的第一个成功翻译测试后追加：

```ts
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
```

- [ ] **Step 3: 为后台 Chrome TTS 写失败测试**

在 `src/background/index.test.ts` 的 open-options 消息测试后追加：

```ts
it("plays source text through Chrome TTS for speak-source runtime messages", async () => {
  installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN" });
  const runtime = installChromeRuntimeMock();
  chrome.tts = {
    stop: vi.fn(),
    speak: vi.fn()
  } as unknown as typeof chrome.tts;
  await importBackground();

  const listener = runtime.listeners[0];
  const sendResponse = vi.fn();

  expect(listener?.({ type: "speak-source", text: "Learning" }, {}, sendResponse)).toBe(false);
  expect(chrome.tts.stop).toHaveBeenCalledTimes(1);
  expect(chrome.tts.speak).toHaveBeenCalledWith("Learning", {
    enqueue: false,
    rate: 1
  });
  expect(sendResponse).not.toHaveBeenCalled();
  expect(requestDeepSeekTranslationMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: 运行测试确认红灯**

Run:

```bash
npm test -- src/content/bubble.test.ts src/content/index.test.ts src/background/index.test.ts
```

Expected: FAIL，失败点分别是播放按钮仍被禁用、没有发送 `speak-source`、后台没有调用 `chrome.tts.stop` 或 `chrome.tts.speak`。

---

### Task 2: 增加播放消息类型和 Manifest 权限

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `public/manifest.json`

- [ ] **Step 1: 增加 `SpeakSourceMessage` 类型**

在 `src/shared/types.ts` 中把消息类型更新为：

```ts
export interface TranslateRequestMessage {
  type: "translate-selection";
  text: string;
}

export interface OpenOptionsMessage {
  type: "open-options";
}

export interface SpeakSourceMessage {
  type: "speak-source";
  text: string;
}

export type RuntimeMessage = TranslateRequestMessage | OpenOptionsMessage | SpeakSourceMessage;
```

- [ ] **Step 2: 增加 Chrome TTS 权限**

把 `public/manifest.json` 的权限改为：

```json
"permissions": ["storage", "tts"]
```

- [ ] **Step 3: 运行类型检查**

Run:

```bash
npm run check
```

Expected: PASS。

---

### Task 3: 内容脚本发送播放请求

**Files:**
- Modify: `src/content/bubble.ts`
- Modify: `src/content/index.ts`

- [ ] **Step 1: 让气泡支持外部播放回调**

在 `src/content/bubble.ts` 中更新 `RenderTranslationInput`：

```ts
interface RenderTranslationInput {
  result: TranslationResult;
  position: BubblePosition;
  speakSource?: (sourceText: string) => void | Promise<void>;
}
```

把播放按钮逻辑更新为：

```ts
play.disabled = !input.speakSource && !canSpeakSourceText();
play.textContent = "▶";
play.addEventListener("click", () => {
  if (input.speakSource) {
    void Promise.resolve(input.speakSource(input.result.sourceText)).catch(() => undefined);
    return;
  }

  speakSourceText(input.result.sourceText);
});
```

- [ ] **Step 2: 内容脚本发送 `speak-source` 消息**

在 `src/content/index.ts` 中增加：

```ts
function speakSource(sourceText: string): void {
  try {
    const maybePromise = chrome.runtime.sendMessage({
      type: "speak-source",
      text: sourceText,
    });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => undefined);
    }
  } catch {
    // Text-to-speech is best effort from the content script.
  }
}
```

把成功渲染翻译气泡的调用改为：

```ts
renderTranslationBubble({ result: response.result, position, speakSource });
```

- [ ] **Step 3: 运行内容脚本相关测试**

Run:

```bash
npm test -- src/content/bubble.test.ts src/content/index.test.ts
```

Expected: PASS。

---

### Task 4: 后台调用 Chrome TTS

**Files:**
- Modify: `src/background/index.ts`

- [ ] **Step 1: 引入播放消息类型**

在 `src/background/index.ts` 的类型导入中加入：

```ts
SpeakSourceMessage,
```

- [ ] **Step 2: 增加消息守卫和播放函数**

在 open-options 消息守卫后加入：

```ts
function isSpeakSourceMessage(message: unknown): message is SpeakSourceMessage {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as Partial<SpeakSourceMessage>).type === "speak-source" &&
    typeof (message as Partial<SpeakSourceMessage>).text === "string" &&
    (message as Partial<SpeakSourceMessage>).text!.trim().length > 0
  );
}
```

在 `openOptionsPage` 后加入：

```ts
function speakSourceText(text: string): void {
  try {
    chrome.tts?.stop?.();
    chrome.tts?.speak?.(text, {
      enqueue: false,
      rate: 1
    });
  } catch {
    // Browser TTS is best effort from the background listener.
  }
}
```

- [ ] **Step 3: 在 runtime listener 中处理播放消息**

在 `createTranslateSelectionListener` 中、翻译消息判断之前加入：

```ts
if (isSpeakSourceMessage(message)) {
  speakSourceText(message.text);
  return false;
}
```

- [ ] **Step 4: 运行后台测试**

Run:

```bash
npm test -- src/background/index.test.ts
```

Expected: PASS。

---

### Task 5: 全量验证和提交

**Files:**
- Modify: `public/manifest.json`
- Modify: `src/shared/types.ts`
- Modify: `src/content/bubble.ts`
- Modify: `src/content/index.ts`
- Modify: `src/background/index.ts`
- Modify: `src/content/bubble.test.ts`
- Modify: `src/content/index.test.ts`
- Modify: `src/background/index.test.ts`

- [ ] **Step 1: 全量自动验证**

Run:

```bash
npm run check
npm test
npm run build
```

Expected: `check` 通过，全部 Vitest 测试通过，生产构建退出码为 0。

- [ ] **Step 2: 检查 content bundle 没有残留相对导入**

Run:

```bash
rg "^import | from \"\\./| from './" dist/assets/content.js
```

Expected: 无输出，命令退出码为 1。

- [ ] **Step 3: 手动验收**

Manual checks:

```text
1. 运行 npm run build。
2. 在 chrome://extensions 重新加载 dist/。
3. 打开普通网页，选中英文单词或短语。
4. 气泡显示原文、播放按钮、音标和译文。
5. 点击播放按钮，浏览器朗读原文。
6. 连续点击播放按钮时，新的朗读会停止旧朗读后重新开始。
```

- [ ] **Step 4: 提交修复**

```bash
git add public/manifest.json src/shared/types.ts src/content/bubble.ts src/content/index.ts src/background/index.ts src/content/bubble.test.ts src/content/index.test.ts src/background/index.test.ts
git commit -m "fix: route playback through extension tts"
```

---

## 计划自查

- 设计覆盖：覆盖播放按钮无响应、内容脚本和后台消息边界、Chrome TTS 权限、TTS 不影响翻译主流程、自动化和手动验收。
- 占位扫描：没有 TBD、TODO 或“以后补充”类占位。
- 类型一致性：播放消息统一使用 `SpeakSourceMessage`、`type: "speak-source"` 和 `text` 字段；后台和内容脚本命名统一为 `speakSource` / `speakSourceText`。
