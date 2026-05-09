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
