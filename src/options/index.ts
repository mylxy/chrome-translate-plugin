import { clearTranslationCache, getSettings, saveSettings } from "../shared/storage";

const DEFAULT_TARGET_LANGUAGE = "zh-CN";

const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKey");
const targetLanguageSelect = document.querySelector<HTMLSelectElement>("#targetLanguage");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const clearCacheButton = document.querySelector<HTMLButtonElement>("#clearCache");
const statusElement = document.querySelector<HTMLElement>("#status");

function setStatus(message: string): void {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

export async function loadSettings(): Promise<void> {
  if (!apiKeyInput || !targetLanguageSelect) {
    return;
  }

  try {
    const settings = await getSettings();
    apiKeyInput.value = settings.apiKey;
    targetLanguageSelect.value = settings.targetLanguage || DEFAULT_TARGET_LANGUAGE;
  } catch {
    setStatus("加载设置失败");
  }
}

async function handleSave(): Promise<void> {
  if (!apiKeyInput || !targetLanguageSelect) {
    return;
  }

  try {
    await saveSettings({
      apiKey: apiKeyInput.value.trim(),
      targetLanguage: targetLanguageSelect.value || DEFAULT_TARGET_LANGUAGE
    });
    setStatus("设置已保存");
  } catch {
    setStatus("保存失败");
  }
}

async function handleClearCache(): Promise<void> {
  try {
    await clearTranslationCache();
    setStatus("缓存已清空");
  } catch {
    setStatus("清空缓存失败");
  }
}

saveButton?.addEventListener("click", () => {
  void handleSave();
});

clearCacheButton?.addEventListener("click", () => {
  void handleClearCache();
});

void loadSettings();
