import { getSettings, saveSettings } from "../shared/storage";

const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const DEFAULT_BUBBLE_FONT_SIZE = 12;

const settingsForm = document.querySelector<HTMLFormElement>(".settings-form");
const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKey");
const bubbleFontSizeInput = document.querySelector<HTMLInputElement>("#bubbleFontSize");
const bubbleFontSizeValue = document.querySelector<HTMLOutputElement>("#bubbleFontSizeValue");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const statusElement = document.querySelector<HTMLElement>("#status");
let isSaving = false;

function setStatus(message: string): void {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function getBubbleFontSizeValue(): number {
  const value = Number(bubbleFontSizeInput?.value ?? DEFAULT_BUBBLE_FONT_SIZE);
  return Number.isFinite(value) ? value : DEFAULT_BUBBLE_FONT_SIZE;
}

function updateBubbleFontSizeLabel(): void {
  if (bubbleFontSizeValue) {
    bubbleFontSizeValue.textContent = `${getBubbleFontSizeValue()}px`;
  }
}

export async function loadSettings(): Promise<void> {
  if (!apiKeyInput || !bubbleFontSizeInput) {
    return;
  }

  try {
    const settings = await getSettings();
    apiKeyInput.value = settings.apiKey;
    bubbleFontSizeInput.value = String(settings.bubbleFontSize);
    updateBubbleFontSizeLabel();
  } catch {
    setStatus("加载设置失败");
  }
}

async function handleSave(): Promise<void> {
  if (!apiKeyInput || !bubbleFontSizeInput || isSaving) {
    return;
  }

  isSaving = true;
  if (saveButton) {
    saveButton.disabled = true;
  }

  try {
    await saveSettings({
      apiKey: apiKeyInput.value.trim(),
      targetLanguage: DEFAULT_TARGET_LANGUAGE,
      bubbleFontSize: getBubbleFontSizeValue()
    });
    setStatus("设置已保存");
  } catch {
    setStatus("保存失败");
  } finally {
    isSaving = false;
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

bubbleFontSizeInput?.addEventListener("input", updateBubbleFontSizeLabel);

settingsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleSave();
});

void loadSettings();
