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
