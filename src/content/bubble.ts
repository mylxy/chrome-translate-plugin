import type { TranslationResult } from "../shared/types";
import type { BubblePosition } from "./position";

const BUBBLE_ID = "deepseek-selection-translate-bubble";
const STYLE_ID = "deepseek-selection-translate-style";

interface RenderTranslationInput {
  result: TranslationResult;
  position: BubblePosition;
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
    .dst-bubble {
      position: fixed;
      z-index: 2147483647;
      box-sizing: border-box;
      width: max-content;
      min-width: 150px;
      overflow: auto;
      padding: 10px 12px;
      border: 1px solid #d8dee8;
      border-radius: 8px;
      background: #ffffff;
      color: #111827;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
    }

    .dst-source-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 7px;
      margin-bottom: 4px;
      text-align: left;
    }

    .dst-source {
      min-width: 0;
      font-weight: 650;
      overflow-wrap: anywhere;
      text-align: left;
    }

    .dst-play {
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #f8fafc;
      color: #0f172a;
      cursor: pointer;
      font-size: 10px;
      line-height: 1;
    }

    .dst-play:hover {
      background: #eef2f7;
    }

    .dst-phonetic {
      margin-bottom: 8px;
      color: #64748b;
      font-size: 12px;
      overflow-wrap: anywhere;
      text-align: left;
    }

    .dst-translation {
      border-top: 1px solid #edf2f7;
      padding-top: 8px;
      font-size: 15px;
      overflow-wrap: anywhere;
      text-align: left;
    }

    .dst-setup {
      display: grid;
      gap: 8px;
    }

    .dst-open-options {
      justify-self: start;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      background: #f8fafc;
      color: #0f172a;
      padding: 5px 8px;
      cursor: pointer;
      font: inherit;
    }

    .dst-open-options:hover {
      background: #eef2f7;
    }
  `;
  document.head.append(style);
}

function createBubble(position: BubblePosition): HTMLDivElement {
  ensureStyles();
  hideBubble();

  const bubble = document.createElement("div");
  bubble.id = BUBBLE_ID;
  bubble.className = `dst-bubble dst-${position.placement}`;
  bubble.style.top = `${position.top}px`;
  bubble.style.left = `${position.left}px`;
  bubble.style.maxWidth = `${position.maxWidth}px`;
  bubble.style.maxHeight = `${position.maxHeight}px`;
  document.body.append(bubble);

  return bubble;
}

function speakSourceText(sourceText: string): void {
  const synthesis = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;

  if (!synthesis || !Utterance) return;

  synthesis.cancel();
  synthesis.speak(new Utterance(sourceText));
}

export function hideBubble(): void {
  document.getElementById(BUBBLE_ID)?.remove();
}

export function renderTranslationBubble(input: RenderTranslationInput): void {
  const bubble = createBubble(input.position);
  const sourceRow = document.createElement("div");
  sourceRow.className = "dst-source-row";

  const source = document.createElement("div");
  source.className = "dst-source";
  source.textContent = input.result.sourceText;

  const play = document.createElement("button");
  play.className = "dst-play";
  play.type = "button";
  play.title = "播放原文";
  play.textContent = "▶";
  play.addEventListener("click", () => {
    speakSourceText(input.result.sourceText);
  });

  sourceRow.append(source, play);
  bubble.append(sourceRow);

  if (input.result.phonetic) {
    const phonetic = document.createElement("div");
    phonetic.className = "dst-phonetic";
    phonetic.textContent = input.result.phonetic;
    bubble.append(phonetic);
  }

  const translation = document.createElement("div");
  translation.className = "dst-translation";
  translation.textContent = input.result.translation;
  bubble.append(translation);
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
