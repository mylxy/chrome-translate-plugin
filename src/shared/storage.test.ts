import { beforeEach, describe, expect, it } from "vitest";
import { installChromeStorageMock, setChromeStorageError } from "../test/chromeMock";
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

  it("rejects when reading storage fails", async () => {
    setChromeStorageError("get", "read failed");

    await expect(getSettings()).rejects.toThrow("read failed");
  });

  it("rejects when saving storage fails", async () => {
    setChromeStorageError("set", "save failed");

    await expect(saveSettings({ apiKey: "sk-test", targetLanguage: "en-US" })).rejects.toThrow("save failed");
  });

  it("rejects when removing storage fails", async () => {
    setChromeStorageError("remove", "remove failed");

    await expect(clearTranslationCache()).rejects.toThrow("remove failed");
  });

  it("supports chrome storage get default values in the mock", async () => {
    installChromeStorageMock({ saved: "value" });

    const result = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get({ saved: "default", missing: "fallback" }, resolve);
    });

    expect(result).toEqual({ saved: "value", missing: "fallback" });
  });

  it("filters invalid cache entries", async () => {
    installChromeStorageMock({
      translationCache: {
        entries: [
          { key: "a::zh-CN", sourceText: "a", translation: "甲", createdAt: 1 },
          { key: "b::zh-CN", sourceText: "b", phonetic: "bee", translation: "乙", createdAt: 2 },
          { key: 1, sourceText: "bad", translation: "坏", createdAt: 3 },
          { key: "bad::zh-CN", sourceText: "bad", translation: "坏", createdAt: Number.POSITIVE_INFINITY },
          { key: "bad-phonetic::zh-CN", sourceText: "bad", phonetic: 42, translation: "坏", createdAt: 4 }
        ]
      }
    });

    await expect(getTranslationCache()).resolves.toEqual({
      entries: [
        { key: "a::zh-CN", sourceText: "a", translation: "甲", createdAt: 1 },
        { key: "b::zh-CN", sourceText: "b", phonetic: "bee", translation: "乙", createdAt: 2 }
      ]
    });
  });

  it("returns an empty cache when all stored entries are invalid", async () => {
    installChromeStorageMock({
      translationCache: {
        entries: [
          { key: "missing-source::zh-CN", translation: "坏", createdAt: 1 },
          { key: "bad-date::zh-CN", sourceText: "bad", translation: "坏", createdAt: Number.NaN }
        ]
      }
    });

    await expect(getTranslationCache()).resolves.toEqual({ entries: [] });
  });
});
