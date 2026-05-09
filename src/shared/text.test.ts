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
