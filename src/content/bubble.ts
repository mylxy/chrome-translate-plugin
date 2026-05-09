import type { TranslationResult } from "../shared/types";
import type { BubblePosition } from "./position";

const BUBBLE_ID = "deepseek-selection-translate-bubble";
const STYLE_ID = "deepseek-selection-translate-style";
const DEFAULT_BUBBLE_FONT_SIZE = 12;

type PlaybackState = "idle" | "playing";

interface RenderTranslationInput {
  result: TranslationResult;
  position: BubblePosition;
  bubbleFontSize?: number;
  playbackState?: PlaybackState;
  speakSource?: (sourceText: string) => void | Promise<void>;
  stopSpeaking?: () => void | Promise<void>;
}

interface RenderLoadingInput {
  sourceText: string;
  position: BubblePosition;
  bubbleFontSize?: number;
}

interface RenderSetupInput {
  position: BubblePosition;
  openOptions: () => void;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #deepseek-selection-translate-bubble.dst-bubble {
      position: fixed;
      z-index: 2147483647;
      box-sizing: border-box;
      width: max-content;
      min-width: var(--dst-min-width);
      max-width: var(--dst-max-width);
      max-height: var(--dst-max-height);
      overflow: auto;
      padding: var(--dst-padding-y) var(--dst-padding-x);
      border: 1px solid #d8dee8;
      border-radius: 8px;
      background: #ffffff;
      color: #111827;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
      font: var(--dst-font-size)/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
    }

    #deepseek-selection-translate-bubble .dst-content-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px;
      gap: 6px 10px;
      align-items: center;
      text-align: left;
    }

    #deepseek-selection-translate-bubble .dst-source {
      min-width: 0;
      font-weight: 650;
      overflow-wrap: anywhere;
      text-align: left;
    }

    #deepseek-selection-translate-bubble .dst-control-cell {
      display: flex;
      justify-content: flex-end;
      align-self: start;
    }

    #deepseek-selection-translate-bubble .dst-control {
      flex: 0 0 auto;
      width: 24px;
      height: 24px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #111827;
      color: #ffffff;
      cursor: pointer;
      display: grid;
      place-items: center;
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
    }

    #deepseek-selection-translate-bubble .dst-control:hover {
      background: #334155;
    }

    #deepseek-selection-translate-bubble .dst-control:disabled {
      cursor: default;
      background: #e2e8f0;
      color: #64748b;
      opacity: 1;
    }

    #deepseek-selection-translate-bubble .dst-phonetic {
      color: #64748b;
      font-size: max(10px, calc(var(--dst-font-size-value) * 1px - 1px));
      overflow-wrap: anywhere;
      text-align: left;
    }

    #deepseek-selection-translate-bubble .dst-translation {
      border-top: 1px solid #edf2f7;
      padding-top: 7px;
      font-size: var(--dst-font-size);
      overflow-wrap: anywhere;
      text-align: left;
    }

    #deepseek-selection-translate-bubble .dst-placeholder {
      display: inline-block;
      height: 0.9em;
      border-radius: 5px;
      background: #eef2f7;
    }

    #deepseek-selection-translate-bubble .dst-phonetic-placeholder {
      width: 92px;
    }

    #deepseek-selection-translate-bubble .dst-translation-placeholder {
      width: 130px;
    }

    #deepseek-selection-translate-bubble .dst-loading-dots {
      display: inline-block;
      white-space: nowrap;
      line-height: 1;
    }

    #deepseek-selection-translate-bubble.dst-setup {
      display: grid;
      gap: 8px;
    }

    #deepseek-selection-translate-bubble .dst-open-options {
      justify-self: start;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      background: #f8fafc;
      color: #0f172a;
      padding: 5px 8px;
      cursor: pointer;
      font: inherit;
    }

    #deepseek-selection-translate-bubble .dst-open-options:hover {
      background: #eef2f7;
    }
  `;
  document.head.append(style);
}

function getBubbleFontSize(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : DEFAULT_BUBBLE_FONT_SIZE;
}

function getBubblePadding(fontSize: number): { x: number; y: number } {
  return {
    x: Math.max(12, Math.round(fontSize)),
    y: Math.max(10, Math.round(fontSize * 0.85)),
  };
}

function getBubbleMinWidth(fontSize: number, maxWidth: number): number {
  return Math.min(Math.max(180, fontSize * 12), maxWidth);
}

function createBubble(
  position: BubblePosition,
  bubbleFontSize = DEFAULT_BUBBLE_FONT_SIZE,
): HTMLDivElement {
  ensureStyles();
  hideBubble();

  const bubble = document.createElement("div");
  const maxWidth = `${position.maxWidth}px`;
  const maxHeight = `${position.maxHeight}px`;
  const fontSize = getBubbleFontSize(bubbleFontSize);
  const padding = getBubblePadding(fontSize);
  const minWidth = `${getBubbleMinWidth(fontSize, position.maxWidth)}px`;

  bubble.id = BUBBLE_ID;
  bubble.className = `dst-bubble dst-${position.placement}`;
  bubble.style.top = `${position.top}px`;
  bubble.style.left = `${position.left}px`;
  bubble.style.setProperty("--dst-max-width", maxWidth);
  bubble.style.setProperty("--dst-max-height", maxHeight);
  bubble.style.setProperty("--dst-min-width", minWidth);
  bubble.style.setProperty("--dst-font-size", `${fontSize}px`);
  bubble.style.setProperty("--dst-font-size-value", String(fontSize));
  bubble.style.setProperty("--dst-padding-y", `${padding.y}px`);
  bubble.style.setProperty("--dst-padding-x", `${padding.x}px`);
  bubble.style.minWidth = minWidth;
  bubble.style.maxWidth = maxWidth;
  bubble.style.maxHeight = maxHeight;
  document.body.append(bubble);

  return bubble;
}

function canSpeakSourceText(): boolean {
  return Boolean(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance);
}

function speakSourceText(sourceText: string): void {
  const synthesis = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;

  if (!synthesis || !Utterance) return;

  synthesis.cancel();
  synthesis.speak(new Utterance(sourceText));
}

function createGrid(sourceText: string): {
  grid: HTMLDivElement;
  controlCell: HTMLDivElement;
} {
  const grid = document.createElement("div");
  grid.className = "dst-content-grid";

  const source = document.createElement("div");
  source.className = "dst-source";
  source.textContent = sourceText;

  const controlCell = document.createElement("div");
  controlCell.className = "dst-control-cell";

  grid.append(source, controlCell);

  return { grid, controlCell };
}

function appendGridRow(grid: HTMLDivElement, content: HTMLElement): void {
  grid.append(content, document.createElement("div"));
}

function createControl(label: string, text: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.className = "dst-control dst-play";
  control.type = "button";
  control.title = label;
  control.setAttribute("aria-label", label);
  control.textContent = text;
  return control;
}

export function hideBubble(): void {
  document.getElementById(BUBBLE_ID)?.remove();
}

export function renderLoadingBubble(input: RenderLoadingInput): void {
  const bubble = createBubble(input.position, input.bubbleFontSize);
  const { grid, controlCell } = createGrid(input.sourceText);

  const loading = createControl("翻译中", "");
  const dots = document.createElement("span");
  dots.className = "dst-loading-dots";
  dots.textContent = "•••";
  loading.append(dots);
  loading.disabled = true;
  controlCell.append(loading);

  const phonetic = document.createElement("div");
  phonetic.className = "dst-phonetic";
  const phoneticPlaceholder = document.createElement("span");
  phoneticPlaceholder.className = "dst-placeholder dst-phonetic-placeholder";
  phonetic.append(phoneticPlaceholder);
  appendGridRow(grid, phonetic);

  const translation = document.createElement("div");
  translation.className = "dst-translation";
  const translationPlaceholder = document.createElement("span");
  translationPlaceholder.className = "dst-placeholder dst-translation-placeholder";
  translation.append(translationPlaceholder);
  appendGridRow(grid, translation);

  bubble.append(grid);
}

export function renderTranslationBubble(input: RenderTranslationInput): void {
  const bubble = createBubble(input.position, input.bubbleFontSize);
  const { grid, controlCell } = createGrid(input.result.sourceText);
  const isPlaying = input.playbackState === "playing";
  const control = createControl(isPlaying ? "停止播放" : "播放原文", isPlaying ? "Ⅱ" : "▶");

  if (isPlaying) {
    control.addEventListener("click", () => {
      void Promise.resolve(input.stopSpeaking?.()).catch(() => undefined);
    });
  } else {
    control.disabled = !input.speakSource && !canSpeakSourceText();
    control.addEventListener("click", () => {
      if (input.speakSource) {
        void Promise.resolve(input.speakSource(input.result.sourceText)).catch(() => undefined);
        return;
      }

      speakSourceText(input.result.sourceText);
    });
  }

  controlCell.append(control);

  if (input.result.phonetic) {
    const phonetic = document.createElement("div");
    phonetic.className = "dst-phonetic";
    phonetic.textContent = input.result.phonetic;
    appendGridRow(grid, phonetic);
  }

  const translation = document.createElement("div");
  translation.className = "dst-translation";
  translation.textContent = input.result.translation;
  appendGridRow(grid, translation);

  bubble.append(grid);
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

export function renderErrorBubble(
  position: BubblePosition,
  message: string,
): void {
  const bubble = createBubble(position);
  bubble.textContent = message;
}
