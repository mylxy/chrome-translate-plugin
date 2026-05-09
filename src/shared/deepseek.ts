import type { TargetLanguage, TranslationResult } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

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
          "You translate selected text for a browser extension. Return valid JSON only with sourceText, phonetic, and translation. Do not explain. For English words and short phrases, include reliable phonetic transcription when possible. Leave phonetic empty when uncertain."
      },
      {
        role: "user",
        content: JSON.stringify({
          sourceText: text,
          targetLanguage,
          outputShape: {
            sourceText: "same original text",
            phonetic: "phonetic transcription or empty string",
            translation: "translated text"
          }
        })
      }
    ]
  };
}

export function parseDeepSeekResponse(payload: unknown): TranslationResult {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("DeepSeek returned an invalid response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned an invalid response");
  }

  const result = parsed as Partial<TranslationResult>;
  if (
    typeof result.sourceText !== "string" ||
    typeof result.translation !== "string" ||
    result.translation.trim() === ""
  ) {
    throw new Error("DeepSeek returned an invalid response");
  }

  const translationResult: TranslationResult = {
    sourceText: result.sourceText,
    translation: result.translation
  };

  if (typeof result.phonetic === "string" && result.phonetic.trim()) {
    translationResult.phonetic = result.phonetic.trim();
  }

  return translationResult;
}

export async function requestDeepSeekTranslation(
  apiKey: string,
  text: string,
  targetLanguage: TargetLanguage
): Promise<TranslationResult> {
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildDeepSeekRequest(text, targetLanguage))
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API failed with status ${response.status}`);
  }

  return parseDeepSeekResponse(await response.json());
}
