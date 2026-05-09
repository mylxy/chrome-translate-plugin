import type { TargetLanguage, TranslationResult } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const INVALID_RESPONSE_MESSAGE = "DeepSeek returned an invalid response";

export type DeepSeekErrorCode = "api-error" | "invalid-response" | "network-error";

export class DeepSeekError extends Error {
  code: DeepSeekErrorCode;
  status?: number;

  constructor(code: DeepSeekErrorCode, message: string, status?: number) {
    super(message);
    this.name = "DeepSeekError";
    this.code = code;
    if (typeof status === "number") {
      this.status = status;
    }
  }
}

interface DeepSeekMessage {
  role: "system" | "user";
  content: string;
}

interface DeepSeekRequestBody {
  model: string;
  messages: DeepSeekMessage[];
  temperature: number;
  response_format: { type: "json_object" };
}

export function buildDeepSeekRequest(text: string, targetLanguage: TargetLanguage): DeepSeekRequestBody {
  return {
    model: DEEPSEEK_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You translate selected text for a browser extension. Return valid JSON only with sourceText, phonetic, and translation. Do not explain. For English words and short phrases, include IPA phonetic transcription wrapped in /.../ when possible. Never return Chinese pinyin, romanization, translation pronunciation, or target-language pronunciation in phonetic. Leave phonetic empty when IPA is unavailable or uncertain."
      },
      {
        role: "user",
        content: JSON.stringify({
          sourceText: text,
          targetLanguage,
          outputShape: {
            sourceText: "same original text",
            phonetic: "IPA transcription wrapped in /.../ or empty string; never pinyin",
            translation: "translated text"
          }
        })
      }
    ]
  };
}

function invalidResponseError(): DeepSeekError {
  return new DeepSeekError("invalid-response", INVALID_RESPONSE_MESSAGE);
}

function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const extracted = extractFirstJsonObject(candidate);
    if (!extracted) {
      throw invalidResponseError();
    }

    try {
      return JSON.parse(extracted);
    } catch {
      throw invalidResponseError();
    }
  }
}

function isLikelyIpaPhonetic(value: string): boolean {
  const trimmed = value.trim();
  const wrappedInSlashes = /^\/[^/]+\/$/.test(trimmed);
  const wrappedInBrackets = /^\[[^\]]+\]$/.test(trimmed);

  if (!wrappedInSlashes && !wrappedInBrackets) {
    return false;
  }

  if (/[\u3400-\u9fff]/.test(trimmed) || /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/i.test(trimmed)) {
    return false;
  }

  const inner = trimmed.slice(1, -1).trim();
  const hasIpaMarker = /[ɑæɐɒʌɔəɚɛɜɝɞɪʊɡɣɤɥɦɫɬɭɮɯɰŋɲɳɴøœɶɹɻɽɾʀʁɕʂʃθðʈɖʒʔʰʲʷˈˌː]/.test(inner);
  if (hasIpaMarker) {
    return true;
  }

  return /^[a-z.'-]+$/i.test(inner);
}

export function parseDeepSeekResponse(payload: unknown): TranslationResult {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw invalidResponseError();
  }

  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw invalidResponseError();
  }

  const parsed = parseJsonContent(content);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalidResponseError();
  }

  const result = parsed as Partial<TranslationResult>;
  if (
    typeof result.sourceText !== "string" ||
    typeof result.translation !== "string" ||
    result.translation.trim() === ""
  ) {
    throw invalidResponseError();
  }

  const translationResult: TranslationResult = {
    sourceText: result.sourceText,
    translation: result.translation
  };

  if (typeof result.phonetic === "string" && isLikelyIpaPhonetic(result.phonetic)) {
    translationResult.phonetic = result.phonetic.trim();
  }

  return translationResult;
}

export async function requestDeepSeekTranslation(
  apiKey: string,
  text: string,
  targetLanguage: TargetLanguage
): Promise<TranslationResult> {
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(buildDeepSeekRequest(text, targetLanguage))
    });
  } catch {
    throw new DeepSeekError("network-error", "DeepSeek request failed");
  }

  if (!response.ok) {
    throw new DeepSeekError("api-error", `DeepSeek API failed with status ${response.status}`, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponseError();
  }

  return parseDeepSeekResponse(payload);
}
