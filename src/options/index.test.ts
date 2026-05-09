import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearTranslationCache, getSettings, saveSettings } from "../shared/storage";

vi.mock("../shared/storage", () => ({
  clearTranslationCache: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn()
}));

const optionsHtml = `
  <form class="settings-form">
    <input id="apiKey" type="password" />
    <select id="targetLanguage">
      <option value="zh-CN">中文</option>
      <option value="en-US">English</option>
      <option value="ja-JP">日本語</option>
      <option value="ko-KR">한국어</option>
    </select>
    <button id="save" type="submit">保存</button>
    <button id="clearCache" type="button">清空缓存</button>
    <p id="status"></p>
  </form>
`;

async function loadOptionsPage() {
  await import("./index");
  await vi.waitFor(() => expect(getSettings).toHaveBeenCalled());
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function submitForm(): boolean {
  return document
    .querySelector<HTMLFormElement>(".settings-form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("options page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    document.body.innerHTML = optionsHtml;
    vi.mocked(getSettings).mockResolvedValue({ apiKey: "sk-saved", targetLanguage: "en-US" });
    vi.mocked(saveSettings).mockResolvedValue();
    vi.mocked(clearTranslationCache).mockResolvedValue();
  });

  it("loads saved settings into the form", async () => {
    await loadOptionsPage();

    expect(document.querySelector<HTMLInputElement>("#apiKey")?.value).toBe("sk-saved");
    expect(document.querySelector<HTMLSelectElement>("#targetLanguage")?.value).toBe("en-US");
  });

  it("falls back to zh-CN when saved target language is not an available option", async () => {
    vi.mocked(getSettings).mockResolvedValue({ apiKey: "sk-saved", targetLanguage: "fr-FR" });

    await loadOptionsPage();

    expect(document.querySelector<HTMLSelectElement>("#targetLanguage")?.value).toBe("zh-CN");
  });

  it("trims the API key, saves settings, and updates status", async () => {
    await loadOptionsPage();
    document.querySelector<HTMLInputElement>("#apiKey")!.value = "  sk-new  ";
    document.querySelector<HTMLSelectElement>("#targetLanguage")!.value = "ja-JP";

    submitForm();

    await vi.waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ apiKey: "sk-new", targetLanguage: "ja-JP" })
    );
    expect(document.querySelector("#status")?.textContent).toBe("设置已保存");
  });

  it("uses zh-CN when the selected target language is empty", async () => {
    await loadOptionsPage();
    document.querySelector<HTMLSelectElement>("#targetLanguage")!.innerHTML = `<option value="">Empty</option>`;

    submitForm();

    await vi.waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ apiKey: "sk-saved", targetLanguage: "zh-CN" })
    );
  });

  it("saves settings on form submit without allowing navigation", async () => {
    await loadOptionsPage();

    const wasNotPrevented = submitForm();

    expect(wasNotPrevented).toBe(false);
    await vi.waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ apiKey: "sk-saved", targetLanguage: "en-US" })
    );
  });

  it("ignores duplicate saves while one save is pending and restores the save button", async () => {
    const deferred = createDeferred();
    vi.mocked(saveSettings).mockReturnValue(deferred.promise);
    await loadOptionsPage();
    const saveButton = document.querySelector<HTMLButtonElement>("#save")!;

    submitForm();
    submitForm();

    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(saveButton.disabled).toBe(true);

    deferred.resolve();

    await vi.waitFor(() => expect(saveButton.disabled).toBe(false));
  });

  it("clears the translation cache and updates status", async () => {
    await loadOptionsPage();

    document.querySelector<HTMLButtonElement>("#clearCache")!.click();

    await vi.waitFor(() => expect(clearTranslationCache).toHaveBeenCalled());
    expect(document.querySelector("#status")?.textContent).toBe("缓存已清空");
  });

  it("shows a failure status when saving fails", async () => {
    vi.mocked(saveSettings).mockRejectedValue(new Error("save failed"));
    await loadOptionsPage();

    submitForm();

    await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toBe("保存失败"));
  });

  it("shows a failure status when clearing the cache fails", async () => {
    vi.mocked(clearTranslationCache).mockRejectedValue(new Error("clear failed"));
    await loadOptionsPage();

    document.querySelector<HTMLButtonElement>("#clearCache")!.click();

    await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toBe("清空缓存失败"));
  });

  it("does not crash when the options elements are missing", async () => {
    document.body.innerHTML = "";

    await expect(import("./index")).resolves.toBeDefined();
  });

  it("does not set a 360px body min-width that overflows narrow screens", () => {
    const css = readFileSync(resolve(__dirname, "styles.css"), "utf8");

    expect(css).not.toContain("min-width: 360px");
  });
});
