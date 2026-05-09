import {
  hideBubble,
  renderErrorBubble,
  renderSetupBubble,
  renderTranslationBubble,
} from "./bubble";
import { computeBubblePosition } from "./position";
import { normalizeSelection, shouldIgnoreSelection } from "../shared/text";
import type { TranslateResponse } from "../shared/types";

const BUBBLE_ID = "deepseek-selection-translate-bubble";
const DEBOUNCE_MS = 220;
const ESTIMATED_BUBBLE_SIZE = { width: 220, height: 96 };
const VIEWPORT_MARGIN = 8;
const FAIL_MESSAGE = "翻译失败，请重新选择文本";
const INSTALL_KEY = "__deepseekSelectionTranslateContentCleanup__";

type CleanupHost = typeof globalThis & {
  [INSTALL_KEY]?: () => void;
};

let debounceTimer: number | undefined;
let requestId = 0;

function closeBubble(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = undefined;
  requestId += 1;
  hideBubble();
}

function getBubble(): HTMLElement | null {
  return document.getElementById(BUBBLE_ID);
}

function isUsableRect(rect: DOMRect): boolean {
  return !(rect.width === 0 && rect.height === 0);
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
      renderTranslationBubble({ result: response.result, position });
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
  debounceTimer = window.setTimeout(() => {
    const selectionState = getSelectionState();
    if (!selectionState.ok) {
      closeBubble();
      return;
    }

    const position = computeBubblePosition({
      selectionRect: selectionState.rect,
      bubbleSize: ESTIMATED_BUBBLE_SIZE,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      margin: VIEWPORT_MARGIN,
    });
    const currentRequestId = requestId + 1;
    requestId = currentRequestId;

    renderErrorBubble(position, "翻译中...");
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

  return () => {
    closeBubble();
    document.removeEventListener("selectionchange", handleSelectionChange);
    document.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("mousedown", handleMouseDown);
  };
}

const cleanupHost = globalThis as CleanupHost;
cleanupHost[INSTALL_KEY]?.();
cleanupHost[INSTALL_KEY] = install();
