import { describe, expect, it } from "vitest";
import {
  addCacheEntry,
  createCacheKey,
  findCacheEntry,
  emptyCache,
  MAX_CACHE_ENTRIES
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
    expect(cache.entries[0]?.createdAt).toBe(1);
  });

  it("keeps the original position when replacing an existing key", () => {
    let cache = emptyCache();
    cache = addCacheEntry(cache, "first", "zh-CN", result("first"), 1);
    cache = addCacheEntry(cache, "second", "zh-CN", result("second"), 2);
    cache = addCacheEntry(cache, "third", "zh-CN", result("third"), 3);

    cache = addCacheEntry(cache, "second", "zh-CN", { sourceText: "second", translation: "第二" }, 4);

    expect(cache.entries.map((entry) => entry.sourceText)).toEqual(["first", "second", "third"]);
    expect(cache.entries[1]?.translation).toBe("第二");
    expect(cache.entries[1]?.createdAt).toBe(2);
  });

  it("evicts the oldest entry after 100 items", () => {
    let cache = emptyCache();
    for (let index = 0; index < MAX_CACHE_ENTRIES + 1; index += 1) {
      cache = addCacheEntry(cache, `word-${index}`, "zh-CN", result(`word-${index}`), index);
    }
    expect(cache.entries).toHaveLength(MAX_CACHE_ENTRIES);
    expect(findCacheEntry(cache, "word-0", "zh-CN")).toBeUndefined();
    expect(findCacheEntry(cache, `word-${MAX_CACHE_ENTRIES}`, "zh-CN")?.translation).toBe(
      `word-${MAX_CACHE_ENTRIES}-译文`
    );
  });

  it("evicts the oldest entry after replacing it and adding a new key", () => {
    let cache = emptyCache();
    for (let index = 0; index < MAX_CACHE_ENTRIES; index += 1) {
      cache = addCacheEntry(cache, `word-${index}`, "zh-CN", result(`word-${index}`), index);
    }

    cache = addCacheEntry(cache, "word-0", "zh-CN", { sourceText: "word-0", translation: "零" }, 200);
    cache = addCacheEntry(cache, "word-100", "zh-CN", result("word-100"), 201);

    expect(cache.entries).toHaveLength(MAX_CACHE_ENTRIES);
    expect(findCacheEntry(cache, "word-0", "zh-CN")).toBeUndefined();
    expect(findCacheEntry(cache, "word-1", "zh-CN")).toBeDefined();
    expect(findCacheEntry(cache, "word-100", "zh-CN")?.translation).toBe("word-100-译文");
  });

  it("removes phonetic when replacing an entry with a result that has no phonetic", () => {
    let cache = addCacheEntry(emptyCache(), "Learning", "zh-CN", result("Learning"), 1);

    cache = addCacheEntry(cache, "learning", "zh-CN", { sourceText: "learning", translation: "学习" }, 2);

    expect(cache.entries[0]?.phonetic).toBeUndefined();
    expect("phonetic" in cache.entries[0]!).toBe(false);
  });
});
