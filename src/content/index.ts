import {
  hideBubble,
  renderErrorBubble,
  renderLoadingBubble,
  renderSetupBubble,
  renderTranslationBubble,
} from "./bubble";
import { computeBubblePosition } from "./position";
import { getSettings } from "../shared/storage";
import { normalizeSelection, shouldIgnoreSelection } from "../shared/text";
import type { ExtensionSettings, TranslateResponse, TranslationResult } from "../shared/types";

const BUBBLE_ID = "deepseek-selection-translate-bubble";
const DEBOUNCE_MS = 220;
const MIN_ESTIMATED_BUBBLE_WIDTH = 220;
const ESTIMATED_BUBBLE_HEIGHT = 220;
const SELECTION_WIDTH_BUFFER = 96;
const VIEWPORT_MARGIN = 8;
const FAIL_MESSAGE = "翻译失败，请重新选择文本";
const INSTALL_KEY = "__deepseekSelectionTranslateContentCleanup__";

type CleanupHost = typeof globalThis & {
  [INSTALL_KEY]?: () => void;
};

let debounceTimer: number | undefined;
let requestId = 0;
let currentResult: TranslationResult | undefined;
let currentPosition: ReturnType<typeof computeBubblePosition> | undefined;
let currentBubbleFontSize = 12;
let isSpeaking = false;

function closeBubble(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = undefined;
  requestId += 1;
  currentResult = undefined;
  currentPosition = undefined;
  isSpeaking = false;
  hideBubble();
}

function getBubble(): HTMLElement | null {
  return document.getElementById(BUBBLE_ID);
}

function isUsableRect(rect: DOMRect): boolean {
  return !(rect.width === 0 && rect.height === 0);
}

function getEstimatedBubbleSize(selectionRect: DOMRect): { width: number; height: number } {
  return {
    width: Math.max(MIN_ESTIMATED_BUBBLE_WIDTH, Math.ceil(selectionRect.width + SELECTION_WIDTH_BUFFER)),
    height: ESTIMATED_BUBBLE_HEIGHT,
  };
}

function getSelectionState():
  | { ok: true; text: string; rect: DOMRect }
  | { ok: false } {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return { ok: false };
  }

  const text = normalizeSelection(selection.toString());
  if (!text || shouldIgnoreSelection(text)) {
    return { ok: false };
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!isUsableRect(rect)) {
    return { ok: false };
  }

  return { ok: true, text, rect };
}

function openOptions(): void {
  try {
    const maybePromise = chrome.runtime.sendMessage({ type: "open-options" });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => undefined);
    }
  } catch {
    // Opening options is best effort from the content script.
  }
}

function speakSource(sourceText: string): void {
  isSpeaking = true;
  try {
    const maybePromise = chrome.runtime.sendMessage({
      type: "speak-source",
      text: sourceText,
    });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => undefined);
    }
  } catch {
    // Text-to-speech is best effort from the content script.
  }
  rerenderCurrentTranslation();
}

function stopSpeaking(): void {
  isSpeaking = false;
  try {
    const maybePromise = chrome.runtime.sendMessage({ type: "stop-speaking" });
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => undefined);
    }
  } catch {
    // Stopping text-to-speech is best effort from the content script.
  }
  rerenderCurrentTranslation();
}

function isSpeakingEndedMessage(message: unknown): message is { type: "speaking-ended" } {
  return (
    message !== null &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === "speaking-ended"
  );
}

function handleRuntimeMessage(message: unknown): void {
  if (!isSpeakingEndedMessage(message) || !isSpeaking) {
    return;
  }

  isSpeaking = false;
  rerenderCurrentTranslation();
}

async function renderLoadingForSelection(
  text: string,
  currentRequestId: number,
  position: ReturnType<typeof computeBubblePosition>,
): Promise<void> {
  renderLoadingBubble({ sourceText: text, position, bubbleFontSize: currentBubbleFontSize });
  const settings = await readSettings();
  if (currentRequestId !== requestId) return;

  currentBubbleFontSize = settings.bubbleFontSize;
  renderLoadingBubble({ sourceText: text, position, bubbleFontSize: currentBubbleFontSize });
}

async function readSettings(): Promise<ExtensionSettings> {
  try {
    return await getSettings();
  } catch {
    return { apiKey: "", targetLanguage: "zh-CN", bubbleFontSize: 12 };
  }
}

function rerenderCurrentTranslation(): void {
  if (!currentResult || !currentPosition) return;

  renderTranslationBubble({
    result: currentResult,
    position: currentPosition,
    bubbleFontSize: currentBubbleFontSize,
    playbackState: isSpeaking ? "playing" : "idle",
    speakSource,
    stopSpeaking,
  });
}

async function requestTranslation(
  text: string,
  currentRequestId: number,
  position: ReturnType<typeof computeBubblePosition>,
): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "translate-selection",
      text,
    })) as TranslateResponse;

    if (currentRequestId !== requestId) return;

    if (response.ok) {
      currentResult = response.result;
      currentPosition = position;
      isSpeaking = false;
      rerenderCurrentTranslation();
      return;
    }

    if (response.code === "missing-api-key") {
      renderSetupBubble({ position, openOptions });
      return;
    }

    renderErrorBubble(position, FAIL_MESSAGE);
  } catch {
    if (currentRequestId === requestId) {
      renderErrorBubble(position, FAIL_MESSAGE);
    }
  }
}

function handleSelectionChange(): void {
  requestId += 1;
  window.clearTimeout(debounceTimer);
  const selectionState = getSelectionState();
  if (!selectionState.ok) {
    closeBubble();
    return;
  }

  const position = computeBubblePosition({
    selectionRect: selectionState.rect,
    bubbleSize: getEstimatedBubbleSize(selectionState.rect),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    margin: VIEWPORT_MARGIN,
  });
  const currentRequestId = requestId + 1;
  requestId = currentRequestId;
  currentResult = undefined;
  currentPosition = undefined;
  isSpeaking = false;

  void renderLoadingForSelection(selectionState.text, currentRequestId, position);
  debounceTimer = window.setTimeout(() => {
    void requestTranslation(selectionState.text, currentRequestId, position);
  }, DEBOUNCE_MS);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeBubble();
  }
}

function handleMouseDown(event: MouseEvent): void {
  const bubble = getBubble();
  if (bubble && event.target instanceof Node && bubble.contains(event.target)) {
    return;
  }

  closeBubble();
}

function install(): () => void {
  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("mousedown", handleMouseDown);
  chrome.runtime.onMessage?.addListener?.(handleRuntimeMessage);

  return () => {
    closeBubble();
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("mousedown", handleMouseDown);
    chrome.runtime.onMessage?.removeListener?.(handleRuntimeMessage);
  };
}

const cleanupHost = globalThis as CleanupHost;
cleanupHost[INSTALL_KEY]?.();
cleanupHost[INSTALL_KEY] = install();
