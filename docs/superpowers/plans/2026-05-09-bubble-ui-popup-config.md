# Bubble UI and Popup Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化划词翻译气泡 UI 和配置入口，让选中文本后立即显示原文和加载占位，并通过插件 popup 配置 DeepSeek Key 与气泡字号。

**Architecture:** 共享存储新增 `bubbleFontSize`，内容脚本每次选区读取最新设置并把字号传给气泡渲染。气泡渲染拆出加载态与完成态，右侧固定按钮位承载加载、播放、暂停状态。配置页迁移为 `action.default_popup` 使用的紧凑 popup，后台固定目标语言为中文并新增停止朗读消息。

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Vite, Vitest, jsdom, Chrome Storage API, Chrome Runtime Messaging, Chrome TTS API.

---

## 文件结构

- Modify: `public/manifest.json` - 增加 `action.default_popup`，让插件图标打开 popup。
- Modify: `src/shared/types.ts` - 增加 `bubbleFontSize` 设置和 `StopSpeakingMessage`。
- Modify: `src/shared/storage.ts` - 读取、保存并规范化 `bubbleFontSize`。
- Modify: `src/shared/storage.test.ts` - 覆盖字号默认值、保存和边界值。
- Modify: `src/options/index.html` - 改成 popup 配置 UI，只保留 API Key、字号、保存按钮。
- Modify: `src/options/index.ts` - 移除目标语言和清空缓存主流程，保存 API Key 与字号。
- Modify: `src/options/index.test.ts` - 覆盖 popup 配置行为。
- Modify: `src/options/styles.css` - 改成紧凑 popup 样式。
- Modify: `src/background/index.ts` - 固定翻译目标语言为 `zh-CN`，处理 `stop-speaking`。
- Modify: `src/background/index.test.ts` - 覆盖固定中文目标语言和停止朗读消息。
- Modify: `src/content/bubble.ts` - 增加加载态、占位、紧凑网格、字号变量、播放/暂停按钮状态。
- Modify: `src/content/bubble.test.ts` - 覆盖加载态、字号和播放/暂停 UI。
- Modify: `src/content/index.ts` - 选中后立即渲染加载态，翻译返回后更新完成态，管理播放/暂停消息。
- Modify: `src/content/index.test.ts` - 覆盖立即显示原文、字号读取、播放停止切换。
- Modify: `README.md` - 更新配置入口和固定中文目标语言说明。

## 实现约定

- 字号设置 key 为 `bubbleFontSize`，默认值 `12`，范围 `12` 到 `20`。
- 目标语言固定为 `zh-CN`；旧存储中的 `targetLanguage` 继续可读，但后台翻译请求不再使用它。
- 气泡加载态右侧按钮位显示 `•••`，完成态显示播放按钮。
- 播放中按钮显示 `Ⅱ`，再次点击发送 `stop-speaking` 并切回播放图标。
- 暂停按钮行为定义为停止当前朗读，不保留语音进度。
- popup HTML 继续复用 `src/options/index.html`，并在 manifest 中作为 `action.default_popup`。

---

### Task 1: 设置类型和存储字号

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/storage.ts`
- Modify: `src/shared/storage.test.ts`

- [ ] **Step 1: 写失败测试**

Modify `src/shared/storage.test.ts`:

```ts
it("returns default settings with a 12px bubble font size when storage is empty", async () => {
  await expect(getSettings()).resolves.toEqual({
    apiKey: "",
    targetLanguage: "zh-CN",
    bubbleFontSize: 12
  });
});

it("saves and reads the bubble font size", async () => {
  await saveSettings({ apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 16 });

  await expect(getSettings()).resolves.toEqual({
    apiKey: "sk-test",
    targetLanguage: "zh-CN",
    bubbleFontSize: 16
  });
});

it.each([
  ["too small", 8],
  ["too large", 48],
  ["not finite", Number.POSITIVE_INFINITY]
])("falls back to 12px when stored bubble font size is %s", async (_label, bubbleFontSize) => {
  installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize });

  await expect(getSettings()).resolves.toEqual({
    apiKey: "sk-test",
    targetLanguage: "zh-CN",
    bubbleFontSize: 12
  });
});
```

Update existing `getSettings()` and `saveSettings()` expectations in this file so every settings object includes `bubbleFontSize`.

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/shared/storage.test.ts
```

Expected: FAIL，失败点包含 `bubbleFontSize` 缺失或 `saveSettings` 类型不匹配。

- [ ] **Step 3: 更新类型**

Modify `src/shared/types.ts`:

```ts
export interface ExtensionSettings {
  apiKey: string;
  targetLanguage: TargetLanguage;
  bubbleFontSize: number;
}
```

- [ ] **Step 4: 更新存储实现**

Modify `src/shared/storage.ts`:

```ts
const API_KEY = "apiKey";
const TARGET_LANGUAGE = "targetLanguage";
const BUBBLE_FONT_SIZE = "bubbleFontSize";
const TRANSLATION_CACHE = "translationCache";
const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const DEFAULT_BUBBLE_FONT_SIZE = 12;
const MIN_BUBBLE_FONT_SIZE = 12;
const MAX_BUBBLE_FONT_SIZE = 20;

function cleanBubbleFontSize(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < MIN_BUBBLE_FONT_SIZE ||
    value > MAX_BUBBLE_FONT_SIZE
  ) {
    return DEFAULT_BUBBLE_FONT_SIZE;
  }

  return Math.round(value);
}

export async function getSettings(): Promise<ExtensionSettings> {
  const items = await storageGet<Partial<ExtensionSettings>>([API_KEY, TARGET_LANGUAGE, BUBBLE_FONT_SIZE]);
  return {
    apiKey: typeof items.apiKey === "string" ? items.apiKey : "",
    targetLanguage: typeof items.targetLanguage === "string" ? items.targetLanguage : DEFAULT_TARGET_LANGUAGE,
    bubbleFontSize: cleanBubbleFontSize(items.bubbleFontSize)
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await storageSet({
    [API_KEY]: settings.apiKey,
    [TARGET_LANGUAGE]: DEFAULT_TARGET_LANGUAGE,
    [BUBBLE_FONT_SIZE]: cleanBubbleFontSize(settings.bubbleFontSize)
  });
}
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npm test -- src/shared/storage.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交设置存储**

```bash
git add src/shared/types.ts src/shared/storage.ts src/shared/storage.test.ts
git commit -m "feat: store bubble font size setting"
```

---

### Task 2: Popup 配置入口

**Files:**
- Modify: `public/manifest.json`
- Modify: `src/options/index.html`
- Modify: `src/options/index.ts`
- Modify: `src/options/styles.css`
- Modify: `src/options/index.test.ts`

- [ ] **Step 1: 写失败测试**

Replace the `optionsHtml` constant in `src/options/index.test.ts` with:

```ts
const optionsHtml = `
  <form class="settings-form">
    <input id="apiKey" type="password" />
    <input id="bubbleFontSize" type="range" min="12" max="20" value="12" />
    <output id="bubbleFontSizeValue">12px</output>
    <button id="save" type="submit">保存</button>
    <p id="status"></p>
  </form>
`;
```

Replace the behavior tests in `src/options/index.test.ts` with:

```ts
it("loads saved API key and bubble font size into the popup form", async () => {
  vi.mocked(getSettings).mockResolvedValue({ apiKey: "sk-saved", targetLanguage: "zh-CN", bubbleFontSize: 16 });

  await loadOptionsPage();

  expect(document.querySelector<HTMLInputElement>("#apiKey")?.value).toBe("sk-saved");
  expect(document.querySelector<HTMLInputElement>("#bubbleFontSize")?.value).toBe("16");
  expect(document.querySelector("#bubbleFontSizeValue")?.textContent).toBe("16px");
});

it("trims the API key, saves zh-CN and bubble font size, and updates status", async () => {
  await loadOptionsPage();
  document.querySelector<HTMLInputElement>("#apiKey")!.value = "  sk-new  ";
  document.querySelector<HTMLInputElement>("#bubbleFontSize")!.value = "18";

  submitForm();

  await vi.waitFor(() =>
    expect(saveSettings).toHaveBeenCalledWith({
      apiKey: "sk-new",
      targetLanguage: "zh-CN",
      bubbleFontSize: 18
    })
  );
  expect(document.querySelector("#status")?.textContent).toBe("设置已保存");
});

it("updates the font size label when the slider changes", async () => {
  await loadOptionsPage();
  const input = document.querySelector<HTMLInputElement>("#bubbleFontSize")!;
  input.value = "20";

  input.dispatchEvent(new Event("input", { bubbles: true }));

  expect(document.querySelector("#bubbleFontSizeValue")?.textContent).toBe("20px");
});

it("does not render a target language selector or clear cache button", () => {
  const html = readFileSync(resolve(__dirname, "index.html"), "utf8");

  expect(html).not.toContain("targetLanguage");
  expect(html).not.toContain("clearCache");
});
```

Update `beforeEach()` in `src/options/index.test.ts`:

```ts
vi.mocked(getSettings).mockResolvedValue({ apiKey: "sk-saved", targetLanguage: "zh-CN", bubbleFontSize: 12 });
```

Remove tests that require `clearTranslationCache` and target language selection.

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/options/index.test.ts
```

Expected: FAIL，失败点包含找不到 `#bubbleFontSize`、仍保存旧目标语言或 HTML 仍包含目标语言选择。

- [ ] **Step 3: 更新 popup HTML**

Replace `src/options/index.html` body content with:

```html
<main class="popup-shell">
  <section class="panel" aria-labelledby="options-title">
    <header class="panel-header">
      <h1 id="options-title">DeepSeek 划词翻译</h1>
    </header>

    <form class="settings-form">
      <label for="apiKey">DeepSeek API Key</label>
      <input id="apiKey" name="apiKey" type="password" autocomplete="off" spellcheck="false" />

      <div class="font-size-row">
        <label for="bubbleFontSize">气泡文字大小</label>
        <output id="bubbleFontSizeValue" for="bubbleFontSize">12px</output>
      </div>
      <input id="bubbleFontSize" name="bubbleFontSize" type="range" min="12" max="20" step="1" value="12" />

      <button id="save" type="submit">保存</button>
      <p id="status" class="status" role="status" aria-live="polite"></p>
    </form>
  </section>
</main>
<script type="module" src="./index.ts"></script>
```

- [ ] **Step 4: 更新 popup 脚本**

Modify `src/options/index.ts`:

```ts
import { getSettings, saveSettings } from "../shared/storage";

const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const DEFAULT_BUBBLE_FONT_SIZE = 12;

const settingsForm = document.querySelector<HTMLFormElement>(".settings-form");
const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKey");
const bubbleFontSizeInput = document.querySelector<HTMLInputElement>("#bubbleFontSize");
const bubbleFontSizeValue = document.querySelector<HTMLOutputElement>("#bubbleFontSizeValue");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const statusElement = document.querySelector<HTMLElement>("#status");
let isSaving = false;

function setStatus(message: string): void {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function getBubbleFontSizeValue(): number {
  const value = Number(bubbleFontSizeInput?.value ?? DEFAULT_BUBBLE_FONT_SIZE);
  return Number.isFinite(value) ? value : DEFAULT_BUBBLE_FONT_SIZE;
}

function updateBubbleFontSizeLabel(): void {
  if (bubbleFontSizeValue) {
    bubbleFontSizeValue.textContent = `${getBubbleFontSizeValue()}px`;
  }
}

export async function loadSettings(): Promise<void> {
  if (!apiKeyInput || !bubbleFontSizeInput) {
    return;
  }

  try {
    const settings = await getSettings();
    apiKeyInput.value = settings.apiKey;
    bubbleFontSizeInput.value = String(settings.bubbleFontSize);
    updateBubbleFontSizeLabel();
  } catch {
    setStatus("加载设置失败");
  }
}

async function handleSave(): Promise<void> {
  if (!apiKeyInput || !bubbleFontSizeInput || isSaving) {
    return;
  }

  isSaving = true;
  if (saveButton) {
    saveButton.disabled = true;
  }

  try {
    await saveSettings({
      apiKey: apiKeyInput.value.trim(),
      targetLanguage: DEFAULT_TARGET_LANGUAGE,
      bubbleFontSize: getBubbleFontSizeValue()
    });
    setStatus("设置已保存");
  } catch {
    setStatus("保存失败");
  } finally {
    isSaving = false;
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

bubbleFontSizeInput?.addEventListener("input", updateBubbleFontSizeLabel);

settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleSave();
});

void loadSettings();
```

- [ ] **Step 5: 更新 popup 样式**

Replace `src/options/styles.css` with:

```css
:root {
  color: #111827;
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  width: 300px;
  background: #f8fafc;
}

.popup-shell {
  padding: 12px;
}

.panel {
  display: grid;
  gap: 12px;
  border: 1px solid #d8dee8;
  border-radius: 10px;
  background: #ffffff;
  padding: 14px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.panel-header h1 {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
}

.settings-form {
  display: grid;
  gap: 10px;
}

label,
.font-size-row {
  color: #475569;
  font-size: 12px;
  line-height: 1.4;
}

.font-size-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

output {
  color: #111827;
  font-weight: 650;
}

input[type="password"] {
  width: 100%;
  height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  padding: 0 9px;
  color: #111827;
  font: inherit;
}

input[type="range"] {
  width: 100%;
}

button {
  height: 32px;
  border: 0;
  border-radius: 7px;
  background: #111827;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-weight: 650;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.status {
  min-height: 16px;
  margin: 0;
  color: #16a34a;
  font-size: 11px;
}
```

- [ ] **Step 6: 更新 Manifest popup**

Modify `public/manifest.json` action:

```json
"action": {
  "default_title": "DeepSeek 划词翻译",
  "default_popup": "src/options/index.html"
}
```

- [ ] **Step 7: 运行测试和构建**

Run:

```bash
npm test -- src/options/index.test.ts
npm run build
```

Expected: PASS，构建产物中仍包含 `dist/src/options/index.html`。

- [ ] **Step 8: 提交 popup 配置**

```bash
git add public/manifest.json src/options/index.html src/options/index.ts src/options/styles.css src/options/index.test.ts
git commit -m "feat: add popup settings panel"
```

---

### Task 3: 后台固定中文和停止朗读

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/background/index.ts`
- Modify: `src/background/index.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `src/background/index.test.ts`:

```ts
it("always requests DeepSeek with zh-CN target language", async () => {
  installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "ja-JP", bubbleFontSize: 12 });
  installChromeRuntimeMock();
  const result: TranslationResult = { sourceText: "Learning", translation: "学习" };
  requestDeepSeekTranslationMock.mockResolvedValueOnce(result);
  const { handleTranslateSelection } = await importBackground();

  await expect(handleTranslateSelection("Learning")).resolves.toEqual({
    ok: true,
    fromCache: false,
    result
  });
  expect(requestDeepSeekTranslationMock).toHaveBeenCalledWith("sk-test", "Learning", "zh-CN");
});

it("stops Chrome TTS for stop-speaking runtime messages", async () => {
  installChromeStorageMock({ apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 12 });
  const runtime = installChromeRuntimeMock();
  chrome.tts = {
    stop: vi.fn(),
    speak: vi.fn()
  } as unknown as typeof chrome.tts;
  await importBackground();

  const listener = runtime.listeners[0];
  const sendResponse = vi.fn();

  expect(listener?.({ type: "stop-speaking" }, {}, sendResponse)).toBe(false);
  expect(chrome.tts.stop).toHaveBeenCalledTimes(1);
  expect(chrome.tts.speak).not.toHaveBeenCalled();
  expect(sendResponse).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/background/index.test.ts
```

Expected: FAIL，失败点包含后台仍使用存储中的 `targetLanguage`，以及不识别 `stop-speaking`。

- [ ] **Step 3: 增加停止消息类型**

Modify `src/shared/types.ts`:

```ts
export interface StopSpeakingMessage {
  type: "stop-speaking";
}

export type RuntimeMessage =
  | TranslateRequestMessage
  | OpenOptionsMessage
  | SpeakSourceMessage
  | StopSpeakingMessage;
```

- [ ] **Step 4: 固定后台目标语言并处理停止消息**

Modify `src/background/index.ts`:

```ts
const FIXED_TARGET_LANGUAGE: TargetLanguage = "zh-CN";
```

Update cache and request logic in `handleTranslateSelection`:

```ts
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
```

Add message guard and stop handler:

```ts
function isStopSpeakingMessage(message: unknown): message is StopSpeakingMessage {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as Partial<StopSpeakingMessage>).type === "stop-speaking"
  );
}

function stopSpeaking(): void {
  try {
    chrome.tts?.stop?.();
  } catch {
    // Browser TTS stop is best effort from the background listener.
  }
}
```

Add before translate message handling:

```ts
if (isStopSpeakingMessage(message)) {
  stopSpeaking();
  return false;
}
```

- [ ] **Step 5: 运行后台测试**

Run:

```bash
npm test -- src/background/index.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交后台消息**

```bash
git add src/shared/types.ts src/background/index.ts src/background/index.test.ts
git commit -m "feat: stop tts playback from content"
```

---

### Task 4: 气泡加载态、字号和播放状态

**Files:**
- Modify: `src/content/bubble.ts`
- Modify: `src/content/bubble.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `src/content/bubble.test.ts`:

```ts
it("renders a loading bubble with source text, placeholders, and a right aligned loading control", () => {
  renderLoadingBubble({
    sourceText: "Learning curve",
    position,
    bubbleFontSize: 16
  });

  const bubble = document.querySelector<HTMLElement>(".dst-bubble");
  const control = document.querySelector<HTMLButtonElement>(".dst-control");

  expect(document.querySelector(".dst-source")?.textContent).toBe("Learning curve");
  expect(document.querySelector(".dst-phonetic-placeholder")).not.toBeNull();
  expect(document.querySelector(".dst-translation-placeholder")).not.toBeNull();
  expect(control?.textContent).toBe("•••");
  expect(control?.disabled).toBe(true);
  expect(bubble?.style.getPropertyValue("--dst-font-size")).toBe("16px");
});

it("renders a ready bubble with a right aligned play control", () => {
  const speakSource = vi.fn();

  renderTranslationBubble({
    result: { sourceText: "Learning", phonetic: "/ˈlɜːrnɪŋ/", translation: "学习" },
    position,
    bubbleFontSize: 14,
    playbackState: "idle",
    speakSource
  });

  const control = document.querySelector<HTMLButtonElement>(".dst-control");

  expect(control?.disabled).toBe(false);
  expect(control?.textContent).toBe("▶");
  expect(control?.parentElement?.className).toContain("dst-control-cell");
});

it("renders a pause control while playback is active", () => {
  const stopSpeaking = vi.fn();

  renderTranslationBubble({
    result: { sourceText: "Learning", translation: "学习" },
    position,
    bubbleFontSize: 12,
    playbackState: "playing",
    stopSpeaking
  });

  const control = document.querySelector<HTMLButtonElement>(".dst-control");
  control?.click();

  expect(control?.textContent).toBe("Ⅱ");
  expect(stopSpeaking).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/content/bubble.test.ts
```

Expected: FAIL，失败点包含 `renderLoadingBubble` 未导出、`bubbleFontSize` 参数不存在或 `.dst-control` 不存在。

- [ ] **Step 3: 更新气泡类型**

Modify `src/content/bubble.ts`:

```ts
type PlaybackState = "idle" | "playing";

interface RenderTranslationInput {
  result: TranslationResult;
  position: BubblePosition;
  bubbleFontSize?: number;
  playbackState?: PlaybackState;
  speakSource?: (sourceText: string) => void | Promise<void>;
  stopSpeaking?: () => void | Promise<void>;
}

interface RenderLoadingInput {
  sourceText: string;
  position: BubblePosition;
  bubbleFontSize?: number;
}
```

- [ ] **Step 4: 更新布局样式**

In `ensureStyles()` replace source row and play button CSS with grid/control CSS:

```css
#deepseek-selection-translate-bubble.dst-bubble {
  font: var(--dst-font-size)/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

#deepseek-selection-translate-bubble .dst-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: 6px 10px;
  align-items: center;
  text-align: left;
}

#deepseek-selection-translate-bubble .dst-source {
  min-width: 0;
  font-weight: 650;
  overflow-wrap: anywhere;
  text-align: left;
}

#deepseek-selection-translate-bubble .dst-control-cell {
  display: flex;
  justify-content: flex-end;
  align-self: start;
}

#deepseek-selection-translate-bubble .dst-control {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #111827;
  color: #ffffff;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

#deepseek-selection-translate-bubble .dst-control:hover {
  background: #334155;
}

#deepseek-selection-translate-bubble .dst-control:disabled {
  cursor: default;
  background: #e2e8f0;
  color: #64748b;
  opacity: 1;
}

#deepseek-selection-translate-bubble .dst-phonetic {
  color: #64748b;
  font-size: max(10px, calc(var(--dst-font-size-value) * 1px - 1px));
  overflow-wrap: anywhere;
  text-align: left;
}

#deepseek-selection-translate-bubble .dst-translation {
  border-top: 1px solid #edf2f7;
  padding-top: 7px;
  font-size: var(--dst-font-size);
  overflow-wrap: anywhere;
  text-align: left;
}

#deepseek-selection-translate-bubble .dst-placeholder {
  display: inline-block;
  height: 0.9em;
  border-radius: 5px;
  background: #eef2f7;
}

#deepseek-selection-translate-bubble .dst-phonetic-placeholder {
  width: 92px;
}

#deepseek-selection-translate-bubble .dst-translation-placeholder {
  width: 130px;
}
```

- [ ] **Step 5: 更新气泡渲染函数**

Add helpers in `src/content/bubble.ts`:

```ts
function getBubbleFontSize(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 12;
}

function createBubble(position: BubblePosition, bubbleFontSize = 12): HTMLDivElement {
  ensureStyles();
  hideBubble();

  const bubble = document.createElement("div");
  const maxWidth = `${position.maxWidth}px`;
  const maxHeight = `${position.maxHeight}px`;
  const minWidth = `${Math.min(150, position.maxWidth)}px`;
  const fontSize = getBubbleFontSize(bubbleFontSize);

  bubble.id = BUBBLE_ID;
  bubble.className = `dst-bubble dst-${position.placement}`;
  bubble.style.top = `${position.top}px`;
  bubble.style.left = `${position.left}px`;
  bubble.style.setProperty("--dst-max-width", maxWidth);
  bubble.style.setProperty("--dst-max-height", maxHeight);
  bubble.style.setProperty("--dst-min-width", minWidth);
  bubble.style.setProperty("--dst-font-size", `${fontSize}px`);
  bubble.style.setProperty("--dst-font-size-value", String(fontSize));
  bubble.style.minWidth = minWidth;
  bubble.style.maxWidth = maxWidth;
  bubble.style.maxHeight = maxHeight;
  document.body.append(bubble);

  return bubble;
}
```

Add loading renderer:

```ts
export function renderLoadingBubble(input: RenderLoadingInput): void {
  const bubble = createBubble(input.position, input.bubbleFontSize);
  const grid = document.createElement("div");
  grid.className = "dst-content-grid";

  const source = document.createElement("div");
  source.className = "dst-source";
  source.textContent = input.sourceText;

  const controlCell = document.createElement("div");
  controlCell.className = "dst-control-cell";
  const loading = document.createElement("button");
  loading.className = "dst-control";
  loading.type = "button";
  loading.disabled = true;
  loading.setAttribute("aria-label", "翻译中");
  loading.textContent = "•••";
  controlCell.append(loading);

  const phonetic = document.createElement("div");
  phonetic.className = "dst-phonetic";
  const phoneticPlaceholder = document.createElement("span");
  phoneticPlaceholder.className = "dst-placeholder dst-phonetic-placeholder";
  phonetic.append(phoneticPlaceholder);

  const translation = document.createElement("div");
  translation.className = "dst-translation";
  const translationPlaceholder = document.createElement("span");
  translationPlaceholder.className = "dst-placeholder dst-translation-placeholder";
  translation.append(translationPlaceholder);

  grid.append(source, controlCell, phonetic, document.createElement("div"), translation, document.createElement("div"));
  bubble.append(grid);
}
```

Update `renderTranslationBubble()` to use the same grid. The control text is `input.playbackState === "playing" ? "Ⅱ" : "▶"`. The click handler calls `stopSpeaking` when playing, otherwise calls `speakSource`.

- [ ] **Step 6: 运行气泡测试**

Run:

```bash
npm test -- src/content/bubble.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交气泡 UI**

```bash
git add src/content/bubble.ts src/content/bubble.test.ts
git commit -m "feat: add loading bubble ui"
```

---

### Task 5: 内容脚本集成立即显示和播放切换

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/content/index.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `src/content/index.test.ts`:

```ts
it("renders the selected source text immediately while translation is loading", async () => {
  const response = deferred<TranslateResponse>();
  sendMessage.mockReturnValue(response.promise);

  selectText("Hello world");
  await flushDebounce();

  expect(document.querySelector(".dst-source")?.textContent).toBe("Hello world");
  expect(document.querySelector(".dst-control")?.textContent).toBe("•••");
  expect(document.querySelector(".dst-translation-placeholder")).not.toBeNull();
});

it("applies the saved bubble font size to the loading and translated bubble", async () => {
  sendMessage
    .mockResolvedValueOnce({
      ok: true,
      fromCache: false,
      result: { sourceText: "Hello world", translation: "你好，世界" }
    })
    .mockResolvedValueOnce(undefined as unknown as TranslateResponse);

  installChrome(sendMessage, { apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 18 });
  await importContentScript();

  selectText("Hello world");
  await flushDebounce();
  await Promise.resolve();

  expect(document.querySelector<HTMLElement>(BUBBLE_SELECTOR)?.style.getPropertyValue("--dst-font-size")).toBe("18px");
});

it("toggles playback between speak-source and stop-speaking messages", async () => {
  sendMessage
    .mockResolvedValueOnce({
      ok: true,
      fromCache: false,
      result: { sourceText: "Hello world", translation: "你好，世界" },
    })
    .mockResolvedValueOnce(undefined as unknown as TranslateResponse)
    .mockResolvedValueOnce(undefined as unknown as TranslateResponse);

  selectText("Hello world");
  await flushDebounce();
  await Promise.resolve();

  const play = document.querySelector<HTMLButtonElement>(".dst-control");
  play?.click();
  await Promise.resolve();

  expect(sendMessage).toHaveBeenCalledWith({ type: "speak-source", text: "Hello world" });
  expect(document.querySelector(".dst-control")?.textContent).toBe("Ⅱ");

  document.querySelector<HTMLButtonElement>(".dst-control")?.click();
  await Promise.resolve();

  expect(sendMessage).toHaveBeenCalledWith({ type: "stop-speaking" });
  expect(document.querySelector(".dst-control")?.textContent).toBe("▶");
});
```

Update `installChrome()` helper to include storage:

```ts
function installChrome(
  sendMessage: SendMessageMock,
  settings = { apiKey: "sk-test", targetLanguage: "zh-CN", bubbleFontSize: 12 }
) {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage,
    },
    storage: {
      local: {
        get: vi.fn((keys: string[], callback: (items: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) result[key] = settings[key as keyof typeof settings];
          callback(result);
        })
      }
    }
  });
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/content/index.test.ts
```

Expected: FAIL，失败点包含加载气泡仍只显示“翻译中...”、未读取字号、未发送 `stop-speaking`。

- [ ] **Step 3: 更新内容脚本导入**

Modify `src/content/index.ts`:

```ts
import { getSettings } from "../shared/storage";
import type { ExtensionSettings, TranslateResponse, TranslationResult } from "../shared/types";
import {
  hideBubble,
  renderErrorBubble,
  renderLoadingBubble,
  renderSetupBubble,
  renderTranslationBubble,
} from "./bubble";
```

- [ ] **Step 4: 增加播放状态和设置读取**

Add module state and helpers:

```ts
let currentResult: TranslationResult | undefined;
let currentPosition: ReturnType<typeof computeBubblePosition> | undefined;
let currentBubbleFontSize = 12;
let isSpeaking = false;

async function readSettings(): Promise<ExtensionSettings> {
  try {
    return await getSettings();
  } catch {
    return { apiKey: "", targetLanguage: "zh-CN", bubbleFontSize: 12 };
  }
}

function rerenderCurrentTranslation(): void {
  if (!currentResult || !currentPosition) return;

  renderTranslationBubble({
    result: currentResult,
    position: currentPosition,
    bubbleFontSize: currentBubbleFontSize,
    playbackState: isSpeaking ? "playing" : "idle",
    speakSource,
    stopSpeaking
  });
}
```

- [ ] **Step 5: 增加停止朗读函数**

Add:

```ts
function stopSpeaking(): void {
  isSpeaking = false;
  try {
    const maybePromise = chrome.runtime.sendMessage({ type: "stop-speaking" });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => undefined);
    }
  } catch {
    // Stopping text-to-speech is best effort from the content script.
  }
  rerenderCurrentTranslation();
}
```

Update `speakSource()`:

```ts
function speakSource(sourceText: string): void {
  isSpeaking = true;
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
  rerenderCurrentTranslation();
}
```

- [ ] **Step 6: 渲染加载态和成功态**

In `requestTranslation()` read settings and render loading bubble before sending translation:

```ts
async function requestTranslation(
  text: string,
  currentRequestId: number,
  position: ReturnType<typeof computeBubblePosition>,
): Promise<void> {
  try {
    const settings = await readSettings();
    currentBubbleFontSize = settings.bubbleFontSize;
    renderLoadingBubble({ sourceText: text, position, bubbleFontSize: currentBubbleFontSize });

    const response = (await chrome.runtime.sendMessage({
      type: "translate-selection",
      text,
    })) as TranslateResponse;
```

On success:

```ts
if (response.ok) {
  currentResult = response.result;
  currentPosition = position;
  isSpeaking = false;
  rerenderCurrentTranslation();
  return;
}
```

In `handleSelectionChange()`, remove the old `renderErrorBubble(position, "翻译中...")` call so the loading bubble is owned by `requestTranslation()`.

In `closeBubble()`, reset:

```ts
currentResult = undefined;
currentPosition = undefined;
isSpeaking = false;
```

- [ ] **Step 7: 运行内容脚本测试**

Run:

```bash
npm test -- src/content/index.test.ts
```

Expected: PASS。

- [ ] **Step 8: 提交内容脚本集成**

```bash
git add src/content/index.ts src/content/index.test.ts
git commit -m "feat: show translation bubble while loading"
```

---

### Task 6: 全量验证和文档更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

Modify `README.md` configuration section to say:

```md
## 本地加载

1. 运行 `npm run build`。
2. 打开 `chrome://extensions`。
3. 启用 Developer mode。
4. 点击 Load unpacked。
5. 选择本项目的 `dist/` 目录。
6. 点击插件图标，填写 DeepSeek API Key，并按需要调整气泡文字大小。

## 第一版能力

- 选中非中文文本后自动翻译。
- 中文选区直接忽略。
- 选中后气泡立即显示原文和加载占位。
- 气泡优先显示在选区下方，放不下时显示到上方。
- 气泡展示原文、播放按钮、音标和译文。
- 播放按钮调用 Chrome TTS，并支持播放/停止切换。
- DeepSeek API Key 和气泡字号通过插件 popup 配置。
- 翻译目标语言固定为中文。
- 单词和短语翻译最多缓存 100 条。
```

- [ ] **Step 2: 全量验证**

Run:

```bash
npm run check
npm test
npm run build
```

Expected: `check` 退出码为 0，全部 Vitest 测试通过，`build` 退出码为 0。

- [ ] **Step 3: 检查构建产物**

Run:

```bash
test -f dist/manifest.json
test -f dist/assets/background.js
test -f dist/assets/content.js
test -f dist/src/options/index.html
rg "\"default_popup\"" dist/manifest.json
```

Expected: 前四个命令退出码为 0，`rg` 输出包含 `"default_popup": "src/options/index.html"`。

- [ ] **Step 4: 手动验收**

Manual checks:

```text
1. 运行 npm run build。
2. 在 chrome://extensions 重新加载 dist/。
3. 点击插件图标，确认弹出配置框。
4. 配置框只显示 DeepSeek API Key、气泡文字大小和保存按钮。
5. 设置文字大小为 12px，保存。
6. 在普通网页选中英文，气泡立即出现并显示原文、加载按钮位、音标占位和翻译占位。
7. 翻译返回后，按钮位变成播放按钮，译文出现。
8. 点击播放按钮，按钮变成暂停样式并开始朗读。
9. 再次点击按钮，朗读停止，按钮恢复播放样式。
10. 调大文字大小后重新选中英文，新气泡文字变大。
```

- [ ] **Step 5: 提交文档和收尾**

```bash
git add README.md
git commit -m "docs: update popup configuration usage"
```

---

## 计划自查

- 设计覆盖：Task 1 覆盖字号设置；Task 2 覆盖点击插件图标 popup 配置、移除目标语言和清空缓存主入口；Task 3 覆盖固定中文和停止朗读；Task 4 覆盖紧凑网格、加载占位、按钮靠右、字号和播放/暂停 UI；Task 5 覆盖选中即显示原文、翻译返回后更新、播放/停止切换；Task 6 覆盖验收和文档。
- 占位扫描：计划没有使用 TBD、待定、稍后实现、补充测试等占位表达。
- 类型一致性：设置字段统一为 `bubbleFontSize`；停止朗读消息统一为 `type: "stop-speaking"`；播放消息继续使用 `type: "speak-source"` 和 `text`。
