# Chrome DeepSeek Translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Manifest V3 Chrome 划词翻译插件，使用 DeepSeek Flash 翻译非中文选区，并以紧凑白卡气泡展示原文、TTS、音标和译文。

**Architecture:** 使用原生 Chrome Extension 加 Vite/TypeScript 作为轻量构建与测试工具。内容脚本负责选区监听、气泡定位、气泡渲染和 TTS；后台 Service Worker 负责配置读取、缓存和 DeepSeek 调用；设置页负责 API Key、目标语言和缓存清理。

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Vite, Vitest, jsdom, Chrome Storage API, DeepSeek OpenAI-compatible API, browser `speechSynthesis`.

---

## 文件结构

- Create: `package.json` - npm 脚本、开发依赖和构建入口。
- Create: `tsconfig.json` - TypeScript 严格模式配置。
- Create: `vite.config.ts` - 多入口构建配置，输出到 `dist/`。
- Create: `vitest.config.ts` - 单元测试配置，使用 jsdom。
- Create: `public/manifest.json` - Chrome Extension Manifest V3 配置。
- Create: `src/shared/types.ts` - 消息、设置、翻译结果和缓存类型。
- Create: `src/shared/text.ts` - 选区规范化、中文检测和缓存资格判断。
- Create: `src/shared/cache.ts` - 100 条 FIFO 本地缓存逻辑。
- Create: `src/shared/storage.ts` - Chrome 本地存储读写封装。
- Create: `src/shared/deepseek.ts` - DeepSeek 请求构造、响应解析和错误转换。
- Create: `src/content/position.ts` - 选区矩形与气泡位置计算。
- Create: `src/content/bubble.ts` - 白卡气泡 DOM、状态更新、关闭和 TTS 按钮。
- Create: `src/content/index.ts` - 内容脚本入口，串联选区监听、消息发送和气泡更新。
- Create: `src/background/index.ts` - Service Worker 入口，处理翻译消息、缓存和 API 调用。
- Create: `src/options/index.html` - 设置页 HTML。
- Create: `src/options/index.ts` - 设置页交互逻辑。
- Create: `src/options/styles.css` - 设置页样式。
- Create: `src/test/chromeMock.ts` - 测试用 Chrome API mock。
- Create: `src/shared/text.test.ts` - 文本过滤测试。
- Create: `src/shared/cache.test.ts` - 缓存测试。
- Create: `src/shared/deepseek.test.ts` - DeepSeek 解析测试。
- Create: `src/content/position.test.ts` - 气泡定位测试。
- Create: `src/content/bubble.test.ts` - 气泡渲染和 TTS 按钮测试。
- Create: `manual-test-page.html` - 手动验收网页。

## 实现约定

- TypeScript 使用 `strict: true`。
- 构建产物输出到 `dist/`，仓库不提交 `dist/`。
- Chrome 存储 key：
  - `apiKey`
  - `targetLanguage`
  - `translationCache`
- 默认目标语言是 `zh-CN`。
- DeepSeek base URL 是 `https://api.deepseek.com`。
- DeepSeek model 是 `deepseek-v4-flash`。
- 缓存只保存单词和短语，最多 100 条，超过后删除最早插入项。

---

### Task 1: 工程骨架和构建配置

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `public/manifest.json`
- Modify: `.gitignore`

- [ ] **Step 1: 写入 package 配置**

Create `package.json`:

```json
{
  "name": "chrome-deepseek-translate",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.4",
    "jsdom": "^25.0.1"
  }
}
```

- [ ] **Step 2: 写入 TypeScript 配置**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useDefineForClassFields": true,
    "types": ["chrome", "vitest/globals"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: 写入 Vite 多入口配置**

Create `vite.config.ts`:

```ts
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        options: resolve(__dirname, "src/options/index.html")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  publicDir: "public"
});
```

- [ ] **Step 4: 写入 Vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    restoreMocks: true,
    clearMocks: true
  }
});
```

- [ ] **Step 5: 写入 Manifest V3 配置**

Create `public/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "DeepSeek 划词翻译",
  "version": "0.1.0",
  "description": "选中非中文文本后，使用 DeepSeek Flash 显示紧凑翻译气泡。",
  "permissions": ["storage"],
  "host_permissions": ["https://api.deepseek.com/*"],
  "background": {
    "service_worker": "assets/background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["assets/content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "src/options/index.html",
  "action": {
    "default_title": "DeepSeek 划词翻译"
  }
}
```

- [ ] **Step 6: 更新忽略规则**

Modify `.gitignore` to include:

```gitignore
.superpowers/
node_modules/
dist/
coverage/
.DS_Store
```

- [ ] **Step 7: 安装依赖**

Run:

```bash
npm install
```

Expected: `node_modules/` 和 `package-lock.json` 创建成功，命令退出码为 0。

- [ ] **Step 8: 运行基础校验**

Run:

```bash
npm run check
npm test
npm run build
```

Expected: `check`、`test`、`build` 都通过。此时还没有测试文件时，Vitest 可能提示 no tests found；如果发生，先继续 Task 2，再回头验证。

- [ ] **Step 9: 提交工程骨架**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts public/manifest.json
git commit -m "chore: set up extension project"
```

---

### Task 2: 共享类型、文本过滤和缓存资格

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/text.ts`
- Create: `src/shared/text.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/shared/text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  containsChinese,
  isMeaningfulSelection,
  normalizeCacheText,
  shouldIgnoreSelection,
  shouldCacheSelection
} from "./text";

describe("text helpers", () => {
  it("detects Chinese text conservatively", () => {
    expect(containsChinese("hello")).toBe(false);
    expect(containsChinese("你好")).toBe(true);
    expect(containsChinese("hello 世界")).toBe(true);
  });

  it("normalizes cache text by trimming and lowercasing English", () => {
    expect(normalizeCacheText("  Learning  ")).toBe("learning");
    expect(normalizeCacheText(" DeepSeek Flash ")).toBe("deepseek flash");
  });

  it("ignores empty, whitespace, punctuation-only, and Chinese selections", () => {
    expect(shouldIgnoreSelection("")).toBe(true);
    expect(shouldIgnoreSelection("   ")).toBe(true);
    expect(shouldIgnoreSelection("...")).toBe(true);
    expect(shouldIgnoreSelection("中文")).toBe(true);
    expect(shouldIgnoreSelection("learning")).toBe(false);
  });

  it("treats meaningful foreign text as usable", () => {
    expect(isMeaningfulSelection("a")).toBe(false);
    expect(isMeaningfulSelection("AI")).toBe(true);
    expect(isMeaningfulSelection("Learning a language")).toBe(true);
  });

  it("caches words and short phrases but not long sentences", () => {
    expect(shouldCacheSelection("learning")).toBe(true);
    expect(shouldCacheSelection("learning a language")).toBe(true);
    expect(shouldCacheSelection("learning a language becomes easier when translation stays close")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
npm test -- src/shared/text.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './text'`。

- [ ] **Step 3: 写共享类型**

Create `src/shared/types.ts`:

```ts
export type TargetLanguage = "zh-CN" | string;

export interface ExtensionSettings {
  apiKey: string;
  targetLanguage: TargetLanguage;
}

export interface TranslationResult {
  sourceText: string;
  phonetic?: string;
  translation: string;
}

export interface CacheEntry extends TranslationResult {
  key: string;
  createdAt: number;
}

export interface TranslationCache {
  entries: CacheEntry[];
}

export interface TranslateRequestMessage {
  type: "translate-selection";
  text: string;
}

export interface TranslateSuccessResponse {
  ok: true;
  result: TranslationResult;
  fromCache: boolean;
}

export interface TranslateSetupRequiredResponse {
  ok: false;
  code: "missing-api-key";
}

export interface TranslateErrorResponse {
  ok: false;
  code: "network-error" | "api-error" | "invalid-response";
  message: string;
}

export type TranslateResponse =
  | TranslateSuccessResponse
  | TranslateSetupRequiredResponse
  | TranslateErrorResponse;
```

- [ ] **Step 4: 实现文本工具**

Create `src/shared/text.ts`:

```ts
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const LETTER_OR_NUMBER_RE = /[\p{L}\p{N}]/u;

export function containsChinese(text: string): boolean {
  return CJK_RE.test(text);
}

export function normalizeSelection(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeCacheText(text: string): string {
  return normalizeSelection(text).toLocaleLowerCase("en-US");
}

export function isMeaningfulSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (normalized.length < 2) return false;
  return LETTER_OR_NUMBER_RE.test(normalized);
}

export function shouldIgnoreSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (!isMeaningfulSelection(normalized)) return true;
  return containsChinese(normalized);
}

export function shouldCacheSelection(text: string): boolean {
  const normalized = normalizeSelection(text);
  if (shouldIgnoreSelection(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return normalized.length <= 48 && words.length <= 5;
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run:

```bash
npm test -- src/shared/text.test.ts
```

Expected: PASS，5 个测试通过。

- [ ] **Step 6: 提交文本工具**

```bash
git add src/shared/types.ts src/shared/text.ts src/shared/text.test.ts
git commit -m "feat: add selection text helpers"
```

---

### Task 3: 本地缓存逻辑

**Files:**
- Create: `src/shared/cache.ts`
- Create: `src/shared/cache.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 写失败测试**

Create `src/shared/cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addCacheEntry,
  createCacheKey,
  findCacheEntry,
  emptyCache
} from "./cache";
import type { TranslationResult } from "./types";

const result = (sourceText: string): TranslationResult => ({
  sourceText,
  phonetic: "/test/",
  translation: `${sourceText}-译文`
});

describe("translation cache", () => {
  it("creates keys from normalized source text and target language", () => {
    expect(createCacheKey(" Learning ", "zh-CN")).toBe("learning::zh-CN");
  });

  it("finds entries by cache key", () => {
    const cache = addCacheEntry(emptyCache(), "Learning", "zh-CN", result("Learning"), 1);
    expect(findCacheEntry(cache, "learning", "zh-CN")?.translation).toBe("Learning-译文");
    expect(findCacheEntry(cache, "learning", "en-US")).toBeUndefined();
  });

  it("replaces an existing key without growing the cache", () => {
    let cache = emptyCache();
    cache = addCacheEntry(cache, "Learning", "zh-CN", result("Learning"), 1);
    cache = addCacheEntry(cache, "learning", "zh-CN", { sourceText: "learning", translation: "学习" }, 2);
    expect(cache.entries).toHaveLength(1);
    expect(cache.entries[0]?.translation).toBe("学习");
    expect(cache.entries[0]?.createdAt).toBe(2);
  });

  it("evicts the oldest entry after 100 items", () => {
    let cache = emptyCache();
    for (let index = 0; index < 101; index += 1) {
      cache = addCacheEntry(cache, `word-${index}`, "zh-CN", result(`word-${index}`), index);
    }
    expect(cache.entries).toHaveLength(100);
    expect(findCacheEntry(cache, "word-0", "zh-CN")).toBeUndefined();
    expect(findCacheEntry(cache, "word-100", "zh-CN")?.translation).toBe("word-100-译文");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
npm test -- src/shared/cache.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './cache'`。

- [ ] **Step 3: 实现缓存工具**

Create `src/shared/cache.ts`:

```ts
import { normalizeCacheText } from "./text";
import type { CacheEntry, TargetLanguage, TranslationCache, TranslationResult } from "./types";

const MAX_CACHE_ENTRIES = 100;

export function emptyCache(): TranslationCache {
  return { entries: [] };
}

export function createCacheKey(text: string, targetLanguage: TargetLanguage): string {
  return `${normalizeCacheText(text)}::${targetLanguage}`;
}

export function findCacheEntry(
  cache: TranslationCache,
  text: string,
  targetLanguage: TargetLanguage
): CacheEntry | undefined {
  const key = createCacheKey(text, targetLanguage);
  return cache.entries.find((entry) => entry.key === key);
}

export function addCacheEntry(
  cache: TranslationCache,
  text: string,
  targetLanguage: TargetLanguage,
  result: TranslationResult,
  createdAt: number = Date.now()
): TranslationCache {
  const key = createCacheKey(text, targetLanguage);
  const nextEntry: CacheEntry = {
    key,
    createdAt,
    sourceText: result.sourceText,
    phonetic: result.phonetic,
    translation: result.translation
  };

  const withoutExisting = cache.entries.filter((entry) => entry.key !== key);
  const nextEntries = [...withoutExisting, nextEntry];
  return { entries: nextEntries.slice(Math.max(0, nextEntries.length - MAX_CACHE_ENTRIES)) };
}
```

- [ ] **Step 4: 运行缓存和文本测试**

Run:

```bash
npm test -- src/shared/cache.test.ts src/shared/text.test.ts
```

Expected: PASS，所有测试通过。

- [ ] **Step 5: 提交缓存逻辑**

```bash
git add src/shared/cache.ts src/shared/cache.test.ts src/shared/types.ts
git commit -m "feat: add translation cache helpers"
```

---

### Task 4: Chrome 存储封装

**Files:**
- Create: `src/shared/storage.ts`
- Create: `src/test/chromeMock.ts`
- Create: `src/shared/storage.test.ts`

- [ ] **Step 1: 写 Chrome mock**

Create `src/test/chromeMock.ts`:

```ts
type StorageData = Record<string, unknown>;

export function installChromeStorageMock(initial: StorageData = {}): StorageData {
  const data: StorageData = { ...initial };

  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn((keys: string[] | string | null, callback: (items: StorageData) => void) => {
          if (keys === null) {
            callback({ ...data });
            return;
          }
          const keyList = Array.isArray(keys) ? keys : [keys];
          const result: StorageData = {};
          for (const key of keyList) result[key] = data[key];
          callback(result);
        }),
        set: vi.fn((items: StorageData, callback?: () => void) => {
          Object.assign(data, items);
          callback?.();
        }),
        remove: vi.fn((keys: string[] | string, callback?: () => void) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const key of keyList) delete data[key];
          callback?.();
        })
      }
    }
  } as unknown as typeof chrome;

  return data;
}
```

- [ ] **Step 2: 写失败测试**

Create `src/shared/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { installChromeStorageMock } from "../test/chromeMock";
import {
  clearTranslationCache,
  getSettings,
  getTranslationCache,
  saveSettings,
  saveTranslationCache
} from "./storage";

describe("storage helpers", () => {
  beforeEach(() => {
    installChromeStorageMock();
  });

  it("returns default settings when storage is empty", async () => {
    await expect(getSettings()).resolves.toEqual({ apiKey: "", targetLanguage: "zh-CN" });
  });

  it("saves and reads settings", async () => {
    await saveSettings({ apiKey: "sk-test", targetLanguage: "en-US" });
    await expect(getSettings()).resolves.toEqual({ apiKey: "sk-test", targetLanguage: "en-US" });
  });

  it("saves, reads, and clears cache", async () => {
    await saveTranslationCache({ entries: [{ key: "a::zh-CN", sourceText: "a", translation: "甲", createdAt: 1 }] });
    await expect(getTranslationCache()).resolves.toHaveProperty("entries.length", 1);
    await clearTranslationCache();
    await expect(getTranslationCache()).resolves.toEqual({ entries: [] });
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run:

```bash
npm test -- src/shared/storage.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './storage'`。

- [ ] **Step 4: 实现存储封装**

Create `src/shared/storage.ts`:

```ts
import type { ExtensionSettings, TranslationCache } from "./types";

const API_KEY = "apiKey";
const TARGET_LANGUAGE = "targetLanguage";
const TRANSLATION_CACHE = "translationCache";

function storageGet<T>(keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items as T));
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const items = await storageGet<Partial<ExtensionSettings>>([API_KEY, TARGET_LANGUAGE]);
  return {
    apiKey: typeof items.apiKey === "string" ? items.apiKey : "",
    targetLanguage: typeof items.targetLanguage === "string" ? items.targetLanguage : "zh-CN"
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await storageSet({
    [API_KEY]: settings.apiKey,
    [TARGET_LANGUAGE]: settings.targetLanguage
  });
}

export async function getTranslationCache(): Promise<TranslationCache> {
  const items = await storageGet<{ translationCache?: TranslationCache }>([TRANSLATION_CACHE]);
  if (!items.translationCache || !Array.isArray(items.translationCache.entries)) {
    return { entries: [] };
  }
  return items.translationCache;
}

export async function saveTranslationCache(cache: TranslationCache): Promise<void> {
  await storageSet({ [TRANSLATION_CACHE]: cache });
}

export async function clearTranslationCache(): Promise<void> {
  await storageRemove([TRANSLATION_CACHE]);
}
```

- [ ] **Step 5: 运行存储测试**

Run:

```bash
npm test -- src/shared/storage.test.ts
```

Expected: PASS，3 个测试通过。

- [ ] **Step 6: 提交存储封装**

```bash
git add src/test/chromeMock.ts src/shared/storage.ts src/shared/storage.test.ts
git commit -m "feat: add chrome storage helpers"
```

---

### Task 5: DeepSeek 调用和响应解析

**Files:**
- Create: `src/shared/deepseek.ts`
- Create: `src/shared/deepseek.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/shared/deepseek.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeepSeekRequest, parseDeepSeekResponse, requestDeepSeekTranslation } from "./deepseek";

describe("deepseek helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a structured JSON-only chat request", () => {
    const request = buildDeepSeekRequest("Learning", "zh-CN");
    expect(request.model).toBe("deepseek-v4-flash");
    expect(request.messages[0]?.role).toBe("system");
    expect(request.messages[1]?.content).toContain("Learning");
    expect(JSON.stringify(request)).toContain("phonetic");
  });

  it("parses valid JSON content", () => {
    const response = {
      choices: [{ message: { content: "{\"sourceText\":\"Learning\",\"phonetic\":\"/ˈlɜːrnɪŋ/\",\"translation\":\"学习\"}" } }]
    };
    expect(parseDeepSeekResponse(response)).toEqual({
      sourceText: "Learning",
      phonetic: "/ˈlɜːrnɪŋ/",
      translation: "学习"
    });
  });

  it("rejects invalid response shapes", () => {
    expect(() => parseDeepSeekResponse({ choices: [] })).toThrow("DeepSeek returned an invalid response");
    expect(() => parseDeepSeekResponse({ choices: [{ message: { content: "{}" } }] })).toThrow("DeepSeek returned an invalid response");
  });

  it("calls DeepSeek with API key and parses the result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{\"sourceText\":\"Learning\",\"translation\":\"学习\"}" } }]
    }), { status: 200 })));

    await expect(requestDeepSeekTranslation("sk-test", "Learning", "zh-CN")).resolves.toEqual({
      sourceText: "Learning",
      translation: "学习"
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" })
      })
    );
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
npm test -- src/shared/deepseek.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './deepseek'`。

- [ ] **Step 3: 实现 DeepSeek 工具**

Create `src/shared/deepseek.ts`:

```ts
import type { TargetLanguage, TranslationResult } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

interface DeepSeekMessage {
  role: "system" | "user";
  content: string;
}

interface DeepSeekRequestBody {
  model: string;
  messages: DeepSeekMessage[];
  temperature: number;
  response_format: { type: "json_object" };
}

export function buildDeepSeekRequest(text: string, targetLanguage: TargetLanguage): DeepSeekRequestBody {
  return {
    model: DEEPSEEK_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You translate selected text for a browser extension. Return valid JSON only with sourceText, phonetic, and translation. Do not explain. For English words and short phrases, include reliable phonetic transcription when possible. Leave phonetic empty when uncertain."
      },
      {
        role: "user",
        content: JSON.stringify({
          sourceText: text,
          targetLanguage,
          outputShape: {
            sourceText: "same original text",
            phonetic: "phonetic transcription or empty string",
            translation: "translated text"
          }
        })
      }
    ]
  };
}

export function parseDeepSeekResponse(payload: unknown): TranslationResult {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("DeepSeek returned an invalid response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned an invalid response");
  }

  const result = parsed as Partial<TranslationResult>;
  if (typeof result.sourceText !== "string" || typeof result.translation !== "string" || result.translation.trim() === "") {
    throw new Error("DeepSeek returned an invalid response");
  }

  return {
    sourceText: result.sourceText,
    phonetic: typeof result.phonetic === "string" && result.phonetic.trim() ? result.phonetic.trim() : undefined,
    translation: result.translation
  };
}

export async function requestDeepSeekTranslation(
  apiKey: string,
  text: string,
  targetLanguage: TargetLanguage
): Promise<TranslationResult> {
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildDeepSeekRequest(text, targetLanguage))
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API failed with status ${response.status}`);
  }

  return parseDeepSeekResponse(await response.json());
}
```

- [ ] **Step 4: 运行 DeepSeek 测试**

Run:

```bash
npm test -- src/shared/deepseek.test.ts
```

Expected: PASS，4 个测试通过。

- [ ] **Step 5: 提交 DeepSeek 工具**

```bash
git add src/shared/deepseek.ts src/shared/deepseek.test.ts
git commit -m "feat: add deepseek translation client"
```

---

### Task 6: 气泡定位计算

**Files:**
- Create: `src/content/position.ts`
- Create: `src/content/position.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/content/position.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeBubblePosition } from "./position";

describe("computeBubblePosition", () => {
  it("places the bubble below the selection when it fits", () => {
    expect(computeBubblePosition({
      selectionRect: { top: 100, bottom: 120, left: 200, width: 80 },
      bubbleSize: { width: 180, height: 100 },
      viewport: { width: 800, height: 600 },
      margin: 8
    })).toEqual({ top: 128, left: 200, placement: "bottom" });
  });

  it("places the bubble above when there is not enough space below", () => {
    expect(computeBubblePosition({
      selectionRect: { top: 540, bottom: 560, left: 200, width: 80 },
      bubbleSize: { width: 180, height: 100 },
      viewport: { width: 800, height: 600 },
      margin: 8
    })).toEqual({ top: 432, left: 200, placement: "top" });
  });

  it("keeps the bubble inside the left and right viewport edges", () => {
    expect(computeBubblePosition({
      selectionRect: { top: 100, bottom: 120, left: 760, width: 40 },
      bubbleSize: { width: 180, height: 100 },
      viewport: { width: 800, height: 600 },
      margin: 8
    })).toEqual({ top: 128, left: 612, placement: "bottom" });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
npm test -- src/content/position.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './position'`。

- [ ] **Step 3: 实现定位计算**

Create `src/content/position.ts`:

```ts
export interface SelectionRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface BubbleSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface BubblePositionInput {
  selectionRect: SelectionRect;
  bubbleSize: BubbleSize;
  viewport: ViewportSize;
  margin: number;
}

export interface BubblePosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

export function computeBubblePosition(input: BubblePositionInput): BubblePosition {
  const { selectionRect, bubbleSize, viewport, margin } = input;
  const desiredLeft = selectionRect.left;
  const maxLeft = viewport.width - bubbleSize.width - margin;
  const left = Math.max(margin, Math.min(desiredLeft, maxLeft));

  const bottomTop = selectionRect.bottom + margin;
  const fitsBelow = bottomTop + bubbleSize.height <= viewport.height - margin;
  if (fitsBelow) {
    return { top: bottomTop, left, placement: "bottom" };
  }

  return {
    top: Math.max(margin, selectionRect.top - bubbleSize.height - margin),
    left,
    placement: "top"
  };
}
```

- [ ] **Step 4: 运行定位测试**

Run:

```bash
npm test -- src/content/position.test.ts
```

Expected: PASS，3 个测试通过。

- [ ] **Step 5: 提交定位逻辑**

```bash
git add src/content/position.ts src/content/position.test.ts
git commit -m "feat: add bubble positioning"
```

---

### Task 7: 气泡 DOM、样式和 TTS

**Files:**
- Create: `src/content/bubble.ts`
- Create: `src/content/bubble.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/content/bubble.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hideBubble, renderSetupBubble, renderTranslationBubble } from "./bubble";

describe("bubble renderer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("speechSynthesis", { speak: vi.fn(), cancel: vi.fn() });
    vi.stubGlobal("SpeechSynthesisUtterance", vi.fn(function SpeechSynthesisUtterance(this: { text: string }, text: string) {
      this.text = text;
    }));
  });

  it("renders aligned source, phonetic, translation, and trailing play button", () => {
    renderTranslationBubble({
      result: { sourceText: "Learning", phonetic: "/ˈlɜːrnɪŋ/", translation: "学习" },
      position: { top: 100, left: 120, placement: "bottom" }
    });

    const bubble = document.querySelector(".dst-bubble");
    expect(bubble).not.toBeNull();
    expect(document.querySelector(".dst-source")?.textContent).toContain("Learning");
    expect(document.querySelector(".dst-phonetic")?.textContent).toBe("/ˈlɜːrnɪŋ/");
    expect(document.querySelector(".dst-translation")?.textContent).toBe("学习");
    expect(document.querySelector(".dst-play")?.parentElement?.className).toContain("dst-source-row");
  });

  it("hides phonetic line when it is missing", () => {
    renderTranslationBubble({
      result: { sourceText: "Hello world", translation: "你好，世界" },
      position: { top: 100, left: 120, placement: "bottom" }
    });
    expect(document.querySelector(".dst-phonetic")).toBeNull();
  });

  it("plays source text through browser TTS", () => {
    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position: { top: 100, left: 120, placement: "bottom" }
    });
    document.querySelector<HTMLButtonElement>(".dst-play")?.click();
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it("renders setup prompt with options action", () => {
    const openOptions = vi.fn();
    renderSetupBubble({
      position: { top: 100, left: 120, placement: "bottom" },
      openOptions
    });
    document.querySelector<HTMLButtonElement>(".dst-open-options")?.click();
    expect(openOptions).toHaveBeenCalledTimes(1);
  });

  it("removes the bubble", () => {
    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position: { top: 100, left: 120, placement: "bottom" }
    });
    hideBubble();
    expect(document.querySelector(".dst-bubble")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
npm test -- src/content/bubble.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './bubble'`。

- [ ] **Step 3: 实现气泡渲染**

Create `src/content/bubble.ts`:

```ts
import type { TranslationResult } from "../shared/types";
import type { BubblePosition } from "./position";

const BUBBLE_ID = "deepseek-selection-translate-bubble";

interface RenderTranslationInput {
  result: TranslationResult;
  position: BubblePosition;
}

interface RenderSetupInput {
  position: BubblePosition;
  openOptions: () => void;
}

function ensureStyles(): void {
  if (document.getElementById("deepseek-selection-translate-style")) return;
  const style = document.createElement("style");
  style.id = "deepseek-selection-translate-style";
  style.textContent = `
    .dst-bubble {
      position: fixed;
      z-index: 2147483647;
      width: max-content;
      min-width: 150px;
      max-width: min(420px, calc(100vw - 16px));
      max-height: min(260px, calc(100vh - 16px));
      overflow: auto;
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      background: #ffffff;
      color: #111827;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .dst-source-row {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 4px;
    }
    .dst-source {
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .dst-play {
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #0f172a;
      cursor: pointer;
      font-size: 10px;
      line-height: 1;
    }
    .dst-phonetic {
      margin-bottom: 8px;
      color: #64748b;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .dst-translation {
      border-top: 1px solid #edf2f7;
      padding-top: 8px;
      font-size: 15px;
      overflow-wrap: anywhere;
    }
    .dst-setup {
      display: grid;
      gap: 8px;
    }
    .dst-open-options {
      justify-self: start;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      background: #f8fafc;
      color: #0f172a;
      padding: 5px 8px;
      cursor: pointer;
    }
  `;
  document.documentElement.append(style);
}

function createBubble(position: BubblePosition): HTMLDivElement {
  ensureStyles();
  hideBubble();
  const bubble = document.createElement("div");
  bubble.id = BUBBLE_ID;
  bubble.className = `dst-bubble dst-${position.placement}`;
  bubble.style.top = `${position.top}px`;
  bubble.style.left = `${position.left}px`;
  document.body.append(bubble);
  return bubble;
}

export function hideBubble(): void {
  document.getElementById(BUBBLE_ID)?.remove();
}

export function renderTranslationBubble(input: RenderTranslationInput): void {
  const bubble = createBubble(input.position);
  const sourceRow = document.createElement("div");
  sourceRow.className = "dst-source-row";

  const source = document.createElement("div");
  source.className = "dst-source";
  source.textContent = input.result.sourceText;

  const play = document.createElement("button");
  play.className = "dst-play";
  play.type = "button";
  play.title = "播放原文";
  play.textContent = "▶";
  play.addEventListener("click", () => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(input.result.sourceText));
  });

  sourceRow.append(source, play);
  bubble.append(sourceRow);

  if (input.result.phonetic) {
    const phonetic = document.createElement("div");
    phonetic.className = "dst-phonetic";
    phonetic.textContent = input.result.phonetic;
    bubble.append(phonetic);
  }

  const translation = document.createElement("div");
  translation.className = "dst-translation";
  translation.textContent = input.result.translation;
  bubble.append(translation);
}

export function renderSetupBubble(input: RenderSetupInput): void {
  const bubble = createBubble(input.position);
  bubble.classList.add("dst-setup");
  const message = document.createElement("div");
  message.textContent = "请先配置 DeepSeek API Key";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dst-open-options";
  button.textContent = "打开设置";
  button.addEventListener("click", input.openOptions);
  bubble.append(message, button);
}

export function renderErrorBubble(position: BubblePosition, message: string): void {
  const bubble = createBubble(position);
  bubble.textContent = message;
}
```

- [ ] **Step 4: 运行气泡测试**

Run:

```bash
npm test -- src/content/bubble.test.ts
```

Expected: PASS，5 个测试通过。

- [ ] **Step 5: 提交气泡渲染**

```bash
git add src/content/bubble.ts src/content/bubble.test.ts
git commit -m "feat: render translation bubble"
```

---

### Task 8: 后台 Service Worker 消息处理

**Files:**
- Create: `src/background/index.ts`
- Create: `src/background/index.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/background/index.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleTranslateSelection } from "./index";
import * as deepseek from "../shared/deepseek";
import * as storage from "../shared/storage";

describe("background translation handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(storage, "getTranslationCache").mockResolvedValue({ entries: [] });
    vi.spyOn(storage, "saveTranslationCache").mockResolvedValue();
  });

  it("returns setup required when API key is missing", async () => {
    vi.spyOn(storage, "getSettings").mockResolvedValue({ apiKey: "", targetLanguage: "zh-CN" });
    await expect(handleTranslateSelection("Learning")).resolves.toEqual({ ok: false, code: "missing-api-key" });
  });

  it("returns cached result without calling DeepSeek", async () => {
    vi.spyOn(storage, "getSettings").mockResolvedValue({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    vi.spyOn(storage, "getTranslationCache").mockResolvedValue({
      entries: [{ key: "learning::zh-CN", sourceText: "Learning", translation: "学习", createdAt: 1 }]
    });
    const request = vi.spyOn(deepseek, "requestDeepSeekTranslation");
    await expect(handleTranslateSelection("Learning")).resolves.toEqual({
      ok: true,
      fromCache: true,
      result: { key: "learning::zh-CN", sourceText: "Learning", translation: "学习", createdAt: 1 }
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("calls DeepSeek on cache miss and stores short phrase result", async () => {
    vi.spyOn(storage, "getSettings").mockResolvedValue({ apiKey: "sk-test", targetLanguage: "zh-CN" });
    vi.spyOn(deepseek, "requestDeepSeekTranslation").mockResolvedValue({
      sourceText: "Learning",
      phonetic: "/ˈlɜːrnɪŋ/",
      translation: "学习"
    });
    await expect(handleTranslateSelection("Learning")).resolves.toMatchObject({
      ok: true,
      fromCache: false,
      result: { sourceText: "Learning", translation: "学习" }
    });
    expect(storage.saveTranslationCache).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
npm test -- src/background/index.test.ts
```

Expected: FAIL，错误包含 `Cannot find module './index'`。

- [ ] **Step 3: 实现后台处理**

Create `src/background/index.ts`:

```ts
import { addCacheEntry, findCacheEntry } from "../shared/cache";
import { requestDeepSeekTranslation } from "../shared/deepseek";
import { getSettings, getTranslationCache, saveTranslationCache } from "../shared/storage";
import { shouldCacheSelection } from "../shared/text";
import type { TranslateRequestMessage, TranslateResponse } from "../shared/types";

export async function handleTranslateSelection(text: string): Promise<TranslateResponse> {
  const settings = await getSettings();
  if (!settings.apiKey.trim()) {
    return { ok: false, code: "missing-api-key" };
  }

  const cache = await getTranslationCache();
  const cached = findCacheEntry(cache, text, settings.targetLanguage);
  if (cached) {
    return { ok: true, fromCache: true, result: cached };
  }

  try {
    const result = await requestDeepSeekTranslation(settings.apiKey, text, settings.targetLanguage);
    if (shouldCacheSelection(text)) {
      await saveTranslationCache(addCacheEntry(cache, text, settings.targetLanguage, result));
    }
    return { ok: true, fromCache: false, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "翻译失败";
    if (message.includes("invalid response")) {
      return { ok: false, code: "invalid-response", message };
    }
    if (message.includes("status")) {
      return { ok: false, code: "api-error", message };
    }
    return { ok: false, code: "network-error", message };
  }
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: TranslateRequestMessage, _sender, sendResponse) => {
    if (message.type !== "translate-selection") return false;
    handleTranslateSelection(message.text).then(sendResponse);
    return true;
  });
}
```

- [ ] **Step 4: 运行后台测试**

Run:

```bash
npm test -- src/background/index.test.ts
```

Expected: PASS，3 个测试通过。

- [ ] **Step 5: 提交后台处理**

```bash
git add src/background/index.ts src/background/index.test.ts
git commit -m "feat: handle background translations"
```

---

### Task 9: 内容脚本集成选区、定位和消息

**Files:**
- Create: `src/content/index.ts`
- Create: `manual-test-page.html`

- [ ] **Step 1: 写内容脚本入口**

Create `src/content/index.ts`:

```ts
import { shouldIgnoreSelection, normalizeSelection } from "../shared/text";
import type { TranslateResponse } from "../shared/types";
import { hideBubble, renderErrorBubble, renderSetupBubble, renderTranslationBubble } from "./bubble";
import { computeBubblePosition } from "./position";

const BUBBLE_MARGIN = 8;

function getSelectionRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function estimateInitialPosition(rect: DOMRect) {
  return computeBubblePosition({
    selectionRect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    bubbleSize: { width: 220, height: 96 },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    margin: BUBBLE_MARGIN
  });
}

function sendTranslateMessage(text: string): Promise<TranslateResponse> {
  return chrome.runtime.sendMessage({ type: "translate-selection", text });
}

function openOptionsPage(): void {
  chrome.runtime.sendMessage({ type: "open-options" });
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
}

async function handleSelection(): Promise<void> {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideBubble();
    return;
  }

  const text = normalizeSelection(selection.toString());
  if (shouldIgnoreSelection(text)) {
    hideBubble();
    return;
  }

  const rect = getSelectionRect(selection);
  if (!rect) {
    hideBubble();
    return;
  }

  const position = estimateInitialPosition(rect);
  renderErrorBubble(position, "翻译中...");

  const response = await sendTranslateMessage(text);
  if (response.ok) {
    renderTranslationBubble({ result: response.result, position });
    return;
  }

  if (response.code === "missing-api-key") {
    renderSetupBubble({ position, openOptions: openOptionsPage });
    return;
  }

  renderErrorBubble(position, "翻译失败，请重新选择文本");
}

let selectionTimer: number | undefined;

document.addEventListener("selectionchange", () => {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(() => {
    void handleSelection();
  }, 220);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideBubble();
});

document.addEventListener("mousedown", (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest(".dst-bubble")) return;
  hideBubble();
});
```

- [ ] **Step 2: 写手动验收页面**

Create `manual-test-page.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>DeepSeek 划词翻译手动测试页</title>
    <style>
      body {
        max-width: 760px;
        margin: 48px auto 160px;
        font: 18px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .bottom {
        margin-top: 80vh;
      }
    </style>
  </head>
  <body>
    <h1>Manual test page</h1>
    <p>Learning a language becomes easier when translation, pronunciation, and context stay close to the selected text.</p>
    <p>Artificial intelligence can help readers understand foreign language articles more efficiently.</p>
    <p>这是一段中文文本，选中它时插件应该完全忽略。</p>
    <p class="bottom">Select this sentence near the bottom of the viewport to verify that the bubble appears above the selection.</p>
  </body>
</html>
```

- [ ] **Step 3: 构建插件**

Run:

```bash
npm run build
```

Expected: PASS，`dist/assets/content.js` 和 `dist/assets/background.js` 存在。

- [ ] **Step 4: 手动加载插件**

In Chrome:

```text
打开 chrome://extensions
启用 Developer mode
点击 Load unpacked
选择 /Users/seven/Documents/chrome-translate-plugin-new/dist
```

Expected: 插件加载成功，没有 manifest 错误。

- [ ] **Step 5: 手动检查内容脚本**

Open `manual-test-page.html` in a normal HTTP server or any普通网页, then check:

```text
选中英文单词：出现气泡。
选中中文：气泡不出现。
按 Escape：气泡关闭。
点击页面其他位置：气泡关闭。
```

- [ ] **Step 6: 提交内容脚本**

```bash
git add src/content/index.ts manual-test-page.html
git commit -m "feat: wire selection translation flow"
```

---

### Task 10: 设置页

**Files:**
- Create: `src/options/index.html`
- Create: `src/options/index.ts`
- Create: `src/options/styles.css`

- [ ] **Step 1: 写设置页 HTML**

Create `src/options/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DeepSeek 划词翻译设置</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main class="settings">
      <h1>DeepSeek 划词翻译</h1>
      <label>
        <span>DeepSeek API Key</span>
        <input id="apiKey" type="password" autocomplete="off" placeholder="sk-..." />
      </label>
      <label>
        <span>目标语言</span>
        <select id="targetLanguage">
          <option value="zh-CN">中文</option>
          <option value="en-US">英文</option>
          <option value="ja-JP">日文</option>
          <option value="ko-KR">韩文</option>
        </select>
      </label>
      <div class="actions">
        <button id="save" type="button">保存设置</button>
        <button id="clearCache" type="button" class="secondary">清空缓存</button>
      </div>
      <p id="status" role="status"></p>
    </main>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 写设置页样式**

Create `src/options/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f8fafc;
  color: #111827;
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.settings {
  width: min(520px, calc(100vw - 32px));
  margin: 48px auto;
  display: grid;
  gap: 18px;
}

h1 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 700;
}

label {
  display: grid;
  gap: 7px;
}

label span {
  font-weight: 600;
}

input,
select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #111827;
  padding: 10px 12px;
  font: inherit;
}

.actions {
  display: flex;
  gap: 10px;
}

button {
  border: 1px solid #0f172a;
  border-radius: 8px;
  background: #0f172a;
  color: #ffffff;
  padding: 9px 12px;
  cursor: pointer;
  font: inherit;
}

button.secondary {
  border-color: #cbd5e1;
  background: #ffffff;
  color: #0f172a;
}

#status {
  min-height: 22px;
  margin: 0;
  color: #475569;
}
```

- [ ] **Step 3: 写设置页逻辑**

Create `src/options/index.ts`:

```ts
import { clearTranslationCache, getSettings, saveSettings } from "../shared/storage";

const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKey");
const targetLanguageSelect = document.querySelector<HTMLSelectElement>("#targetLanguage");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const clearCacheButton = document.querySelector<HTMLButtonElement>("#clearCache");
const status = document.querySelector<HTMLParagraphElement>("#status");

function setStatus(message: string): void {
  if (!status) return;
  status.textContent = message;
}

async function loadSettings(): Promise<void> {
  const settings = await getSettings();
  if (apiKeyInput) apiKeyInput.value = settings.apiKey;
  if (targetLanguageSelect) targetLanguageSelect.value = settings.targetLanguage;
}

saveButton?.addEventListener("click", async () => {
  await saveSettings({
    apiKey: apiKeyInput?.value.trim() ?? "",
    targetLanguage: targetLanguageSelect?.value ?? "zh-CN"
  });
  setStatus("设置已保存");
});

clearCacheButton?.addEventListener("click", async () => {
  await clearTranslationCache();
  setStatus("缓存已清空");
});

void loadSettings();
```

- [ ] **Step 4: 构建并手动检查设置页**

Run:

```bash
npm run build
```

Expected: PASS。

In Chrome extension details:

```text
点击 Extension options
填写 API Key
保存后刷新设置页
确认 API Key 和目标语言仍然存在
点击清空缓存
看到“缓存已清空”
```

- [ ] **Step 5: 提交设置页**

```bash
git add src/options/index.html src/options/index.ts src/options/styles.css
git commit -m "feat: add extension options page"
```

---

### Task 11: 最终验证和文档收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-05-09-chrome-deepseek-translate-design.md` only if implementation reveals a necessary correction.
- Modify: `README.md`

- [ ] **Step 1: 写 README**

Create `README.md`:

```md
# DeepSeek 划词翻译

一个轻量级 Chrome Extension。选中普通网页中的非中文文本后，插件会使用 DeepSeek Flash 翻译，并在选区附近显示紧凑气泡。

## 开发

```bash
npm install
npm run check
npm test
npm run build
```

## 本地加载

1. 运行 `npm run build`。
2. 打开 `chrome://extensions`。
3. 启用 Developer mode。
4. 点击 Load unpacked。
5. 选择本项目的 `dist/` 目录。
6. 打开插件设置页，填写 DeepSeek API Key。

## 第一版能力

- 选中非中文文本后自动翻译。
- 中文选区直接忽略。
- 气泡优先显示在选区下方，放不下时显示到上方。
- 气泡展示原文、播放按钮、音标和译文。
- 播放按钮调用浏览器自带 TTS。
- 单词和短语翻译最多缓存 100 条。
```

- [ ] **Step 2: 全量自动验证**

Run:

```bash
npm run check
npm test
npm run build
```

Expected: 所有命令通过，`dist/manifest.json`、`dist/assets/content.js`、`dist/assets/background.js` 存在。

- [ ] **Step 3: 手动验收**

Manual checks:

```text
1. 加载 dist/ 为 unpacked extension。
2. 未配置 API Key 时选中英文，气泡显示配置提示。
3. 配置 API Key 后选中英文单词，显示原文、播放按钮、音标和译文。
4. 点击播放按钮，浏览器 TTS 播放原文。
5. 选中中文文本，插件无响应。
6. 在页面底部附近选中文字，气泡显示到上方。
7. 短单词气泡宽度紧凑，长句达到最大宽度后换行。
8. 重复选择同一短词，第二次命中缓存。
```

- [ ] **Step 4: 检查工作区**

Run:

```bash
git status --short
```

Expected: 只显示本任务产生的 README 或必要文档变更。

- [ ] **Step 5: 提交收尾文档**

```bash
git add README.md docs/superpowers/specs/2026-05-09-chrome-deepseek-translate-design.md
git commit -m "docs: add extension usage notes"
```

---

## 计划自查

- 设计覆盖：已覆盖 Manifest V3、普通网页、划词自动气泡、优先下方/放不下上方、清爽白卡、自适应宽高、原文/音标/译文对齐、TTS、DeepSeek Flash、设置页、本地 API Key、中文忽略、100 条 FIFO 缓存、错误状态和验收。
- 占位扫描：计划中不使用 TBD、TODO 或“以后实现”类占位。
- 类型一致性：消息类型、设置字段、缓存字段和翻译结果字段在任务中统一为 `apiKey`、`targetLanguage`、`translationCache`、`sourceText`、`phonetic`、`translation`。
