import { describe, expect, it } from "vitest";
import * as textHelpers from "./text";
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
    expect(containsChinese("𠀀")).toBe(true);
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
    expect(shouldIgnoreSelection("𠀀")).toBe(true);
    expect(shouldIgnoreSelection("learning")).toBe(false);
  });

  it("allows mixed foreign selections when Chinese is not the main content", () => {
    expect(shouldIgnoreSelection("hello 世界")).toBe(false);
    expect(shouldIgnoreSelection("React 中文 docs")).toBe(false);
  });

  it("treats meaningful foreign text as usable", () => {
    expect(isMeaningfulSelection("a")).toBe(false);
    expect(isMeaningfulSelection("AI")).toBe(true);
    expect(isMeaningfulSelection("A/B testing")).toBe(true);
    expect(isMeaningfulSelection("model 3")).toBe(true);
    expect(isMeaningfulSelection("Learning a language")).toBe(true);
    expect(isMeaningfulSelection("42")).toBe(false);
    expect(isMeaningfulSelection("2026")).toBe(false);
    expect(isMeaningfulSelection("3.14")).toBe(false);
  });

  it("caches words and short phrases but not long sentences", () => {
    expect(shouldCacheSelection("learning")).toBe(true);
    expect(shouldCacheSelection("learning a language")).toBe(true);
    expect(shouldCacheSelection("learning a language becomes easier when translation stays close")).toBe(false);
  });

  it("exports cache thresholds and applies length and word-count boundaries", () => {
    expect(textHelpers.MAX_CACHE_TEXT_LENGTH).toBe(48);
    expect(textHelpers.MAX_CACHE_WORD_COUNT).toBe(5);
    expect(shouldCacheSelection("a".repeat(48))).toBe(true);
    expect(shouldCacheSelection("a".repeat(49))).toBe(false);
    expect(shouldCacheSelection("one two three four five")).toBe(true);
    expect(shouldCacheSelection("one two three four five six")).toBe(false);
  });
});
