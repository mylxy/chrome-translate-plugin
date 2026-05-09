export type TargetLanguage = "zh-CN" | string;

export interface ExtensionSettings {
  apiKey: string;
  targetLanguage: TargetLanguage;
}

export interface TranslationResult {
  sourceText: string;
  phonetic?: string;
  translation: string;
}

export interface CacheEntry extends TranslationResult {
  key: string;
  createdAt: number;
}

export interface TranslationCache {
  entries: CacheEntry[];
}

export interface TranslateRequestMessage {
  type: "translate-selection";
  text: string;
}

export interface OpenOptionsMessage {
  type: "open-options";
}

export type RuntimeMessage = TranslateRequestMessage | OpenOptionsMessage;

export interface TranslateSuccessResponse {
  ok: true;
  result: TranslationResult;
  fromCache: boolean;
}

export interface TranslateSetupRequiredResponse {
  ok: false;
  code: "missing-api-key";
}

export interface TranslateErrorResponse {
  ok: false;
  code: "network-error" | "api-error" | "invalid-response";
  message: string;
}

export type TranslateResponse =
  | TranslateSuccessResponse
  | TranslateSetupRequiredResponse
  | TranslateErrorResponse;
