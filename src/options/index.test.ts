import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSettings, saveSettings } from "../shared/storage";

vi.mock("../shared/storage", () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn()
}));

const optionsHtml = `
  <form class="settings-form">
    <input id="apiKey" type="password" />
    <input id="bubbleFontSize" type="range" min="12" max="20" value="12" />
    <output id="bubbleFontSizeValue">12px</output>
    <button id="save" type="submit">保存</button>
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
    vi.mocked(getSettings).mockResolvedValue({ apiKey: "sk-saved", targetLanguage: "zh-CN", bubbleFontSize: 12 });
    vi.mocked(saveSettings).mockResolvedValue();
  });

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
      expect(saveSettings).toHaveBeenCalledWith({ apiKey: "sk-new", targetLanguage: "zh-CN", bubbleFontSize: 18 })
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

  it("saves settings on form submit without allowing navigation", async () => {
    await loadOptionsPage();

    const wasNotPrevented = submitForm();

    expect(wasNotPrevented).toBe(false);
    await vi.waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({ apiKey: "sk-saved", targetLanguage: "zh-CN", bubbleFontSize: 12 })
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

  it("shows a failure status when saving fails", async () => {
    vi.mocked(saveSettings).mockRejectedValue(new Error("save failed"));
    await loadOptionsPage();

    submitForm();

    await vi.waitFor(() => expect(document.querySelector("#status")?.textContent).toBe("保存失败"));
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
