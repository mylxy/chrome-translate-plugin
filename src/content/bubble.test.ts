import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hideBubble,
  renderErrorBubble,
  renderSetupBubble,
  renderTranslationBubble,
} from "./bubble";
import type { BubblePosition } from "./position";

const position: BubblePosition = {
  top: 100,
  left: 120,
  placement: "bottom",
  maxWidth: 420,
  maxHeight: 260,
};

describe("bubble renderer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    vi.restoreAllMocks();
    vi.stubGlobal("speechSynthesis", {
      speak: vi.fn(),
      cancel: vi.fn(),
    });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      vi.fn(function SpeechSynthesisUtterance(
        this: { text: string },
        text: string,
      ) {
        this.text = text;
      }),
    );
  });

  it("renders source, phonetic, translation, and a trailing play button in the source row", () => {
    renderTranslationBubble({
      result: {
        sourceText: "Learning",
        phonetic: "/ˈlɜːrnɪŋ/",
        translation: "学习",
      },
      position,
    });

    const bubble = document.querySelector(".dst-bubble");
    const sourceRow = document.querySelector(".dst-source-row");
    const source = document.querySelector(".dst-source");
    const play = document.querySelector(".dst-play");

    expect(bubble).not.toBeNull();
    expect(source?.textContent).toBe("Learning");
    expect(document.querySelector(".dst-phonetic")?.textContent).toBe(
      "/ˈlɜːrnɪŋ/",
    );
    expect(document.querySelector(".dst-translation")?.textContent).toBe("学习");
    expect(play?.parentElement).toBe(sourceRow);
    expect(sourceRow?.children[0]).toBe(source);
    expect(sourceRow?.children[1]).toBe(play);
  });

  it("does not render the phonetic line when it is missing", () => {
    renderTranslationBubble({
      result: { sourceText: "Hello world", translation: "你好，世界" },
      position,
    });

    expect(document.querySelector(".dst-phonetic")).toBeNull();
  });

  it("plays the source text through browser TTS", () => {
    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position,
    });

    const play = document.querySelector<HTMLButtonElement>(".dst-play");

    expect(play?.getAttribute("aria-label")).toBe("播放原文");
    expect(play?.disabled).toBe(false);
    play?.click();

    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(SpeechSynthesisUtterance).toHaveBeenCalledWith("Learning");
    expect(vi.mocked(speechSynthesis.speak).mock.calls[0]?.[0]).toMatchObject({
      text: "Learning",
    });
  });

  it("renders the setup prompt with an options action", () => {
    const openOptions = vi.fn();

    renderSetupBubble({ position, openOptions });

    expect(document.querySelector(".dst-bubble")?.textContent).toContain(
      "请先配置 DeepSeek API Key",
    );
    const button = document.querySelector<HTMLButtonElement>(
      ".dst-open-options",
    );
    expect(button?.textContent).toBe("打开设置");

    button?.click();

    expect(openOptions).toHaveBeenCalledTimes(1);
  });

  it("removes the bubble", () => {
    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position,
    });

    hideBubble();

    expect(document.querySelector(".dst-bubble")).toBeNull();
  });

  it("renders error and loading text", () => {
    renderErrorBubble(position, "翻译中...");
    expect(document.querySelector(".dst-bubble")?.textContent).toBe("翻译中...");

    renderErrorBubble(position, "翻译失败");
    expect(document.querySelector(".dst-bubble")?.textContent).toBe("翻译失败");
  });

  it("applies the position and size limits to the bubble style", () => {
    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position,
    });

    const bubble = document.querySelector<HTMLElement>(".dst-bubble");

    expect(bubble?.style.top).toBe("100px");
    expect(bubble?.style.left).toBe("120px");
    expect(bubble?.style.maxWidth).toBe("420px");
    expect(bubble?.style.maxHeight).toBe("260px");
  });

  it("does not let the minimum width exceed a narrow max width", () => {
    renderTranslationBubble({
      result: { sourceText: "Narrow", translation: "窄" },
      position: { ...position, maxWidth: 84 },
    });

    const bubble = document.querySelector<HTMLElement>(".dst-bubble");

    expect(bubble?.style.getPropertyValue("--dst-max-width")).toBe("84px");
    expect(bubble?.style.getPropertyValue("--dst-min-width")).toBe("84px");
    expect(Number.parseInt(bubble?.style.minWidth ?? "0", 10)).toBeLessThanOrEqual(
      Number.parseInt(bubble?.style.maxWidth ?? "0", 10),
    );
  });

  it("scopes injected styles to the bubble id and reuses one style tag", () => {
    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position,
    });
    renderErrorBubble(position, "翻译中...");

    const styles = document.querySelectorAll(`#deepseek-selection-translate-style`);
    const css = styles[0]?.textContent ?? "";

    expect(styles).toHaveLength(1);
    expect(css).toContain("#deepseek-selection-translate-bubble.dst-bubble");
    expect(css).not.toMatch(/^\s*\.dst-/m);
  });

  it("disables the play button when browser TTS is unavailable", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);

    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position,
    });

    const play = document.querySelector<HTMLButtonElement>(".dst-play");

    expect(play?.disabled).toBe(true);
    expect(play?.getAttribute("aria-label")).toBe("播放原文");
    expect(() => play?.click()).not.toThrow();
  });

  it("uses a provided source playback handler when browser TTS is unavailable", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    const speakSource = vi.fn();

    renderTranslationBubble({
      result: { sourceText: "Learning", translation: "学习" },
      position,
      speakSource,
    });

    const play = document.querySelector<HTMLButtonElement>(".dst-play");

    expect(play?.disabled).toBe(false);
    play?.click();
    expect(speakSource).toHaveBeenCalledWith("Learning");
  });
});
