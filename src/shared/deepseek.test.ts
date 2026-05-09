import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepSeekError, buildDeepSeekRequest, parseDeepSeekResponse, requestDeepSeekTranslation } from "./deepseek";

describe("deepseek helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a structured JSON-only chat request", () => {
    const request = buildDeepSeekRequest("Learning", "zh-CN");
    expect(request.model).toBe("deepseek-v4-flash");
    expect(request.temperature).toBe(0.1);
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.messages[0]?.role).toBe("system");
    expect(request.messages[0]?.content).toContain("IPA");
    expect(request.messages[0]?.content).toContain("Never return Chinese pinyin");
    expect(request.messages[1]?.content).toContain("Learning");
    expect(JSON.stringify(request)).toContain("phonetic");

    const userContent = JSON.parse(request.messages[1]?.content ?? "{}");
    expect(userContent.targetLanguage).toBe("zh-CN");
    expect(userContent.outputShape).toEqual({
      sourceText: "same original text",
      phonetic: "IPA transcription wrapped in /.../ or empty string; never pinyin",
      translation: "translated text"
    });
  });

  it("parses valid JSON content", () => {
    const response = {
      choices: [{ message: { content: "{\"sourceText\":\"Learning\",\"phonetic\":\"/ˈlɜːrnɪŋ/\",\"translation\":\"学习\"}" } }]
    };
    expect(parseDeepSeekResponse(response)).toEqual({
      sourceText: "Learning",
      phonetic: "/ˈlɜːrnɪŋ/",
      translation: "学习"
    });
  });

  it("omits phonetic when DeepSeek returns an empty value", () => {
    const response = {
      choices: [{ message: { content: "{\"sourceText\":\"Learning\",\"phonetic\":\"   \",\"translation\":\"学习\"}" } }]
    };
    const result = parseDeepSeekResponse(response);

    expect(result).toEqual({
      sourceText: "Learning",
      translation: "学习"
    });
    expect("phonetic" in result).toBe(false);
  });

  it.each(["miáo shù", "miao shu", "/miao shu/"])(
    "omits phonetic when DeepSeek returns Chinese pinyin %s",
    (phonetic) => {
      const response = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                sourceText: "Describe",
                phonetic,
                translation: "描述"
              })
            }
          }
        ]
      };

      const result = parseDeepSeekResponse(response);

      expect(result).toEqual({
        sourceText: "Describe",
        translation: "描述"
      });
      expect("phonetic" in result).toBe(false);
    }
  );

  it("parses JSON content wrapped in a code fence", () => {
    const response = {
      choices: [
        {
          message: {
            content: "```json\n{\"sourceText\":\"Learning\",\"phonetic\":\"/ˈlɜːrnɪŋ/\",\"translation\":\"学习\"}\n```"
          }
        }
      ]
    };

    expect(parseDeepSeekResponse(response)).toEqual({
      sourceText: "Learning",
      phonetic: "/ˈlɜːrnɪŋ/",
      translation: "学习"
    });
  });

  it("parses the first JSON object from wrapped text", () => {
    const response = {
      choices: [
        {
          message: {
            content: "Here is the JSON: {\"sourceText\":\"Learning\",\"translation\":\"学习\"}"
          }
        }
      ]
    };

    expect(parseDeepSeekResponse(response)).toEqual({
      sourceText: "Learning",
      translation: "学习"
    });
  });

  it("rejects invalid response shapes", () => {
    expect(() => parseDeepSeekResponse(null)).toThrow(DeepSeekError);
    expect(() => parseDeepSeekResponse(null)).toThrow(
      expect.objectContaining({ code: "invalid-response" })
    );
    expect(() => parseDeepSeekResponse([])).toThrow(expect.objectContaining({ code: "invalid-response" }));
    expect(() => parseDeepSeekResponse({ choices: [] })).toThrow(
      expect.objectContaining({ code: "invalid-response" })
    );
    expect(() => parseDeepSeekResponse({ choices: [{ message: { content: "{}" } }] })).toThrow(
      expect.objectContaining({ code: "invalid-response" })
    );
    expect(() => parseDeepSeekResponse({ choices: [{ message: { content: "null" } }] })).toThrow(
      expect.objectContaining({ code: "invalid-response" })
    );
    expect(() => parseDeepSeekResponse({ choices: [{ message: { content: "{bad json" } }] })).toThrow(
      expect.objectContaining({ code: "invalid-response" })
    );
  });

  it("calls DeepSeek with API key and parses the result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "{\"sourceText\":\"Learning\",\"translation\":\"学习\"}" } }]
            }),
            { status: 200 }
          )
      )
    );

    await expect(requestDeepSeekTranslation("sk-test", "Learning", "zh-CN")).resolves.toEqual({
      sourceText: "Learning",
      translation: "学习"
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" })
      })
    );
  });

  it.each([500, 401])("throws api-error with status for HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));

    await expect(requestDeepSeekTranslation("sk-test", "Learning", "zh-CN")).rejects.toMatchObject({
      code: "api-error",
      status
    });
  });

  it("throws network-error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("socket closed sk-test"))));

    await expect(requestDeepSeekTranslation("sk-test", "Learning", "zh-CN")).rejects.toMatchObject({
      code: "network-error"
    });
    await expect(requestDeepSeekTranslation("sk-test", "Learning", "zh-CN")).rejects.not.toThrow("sk-test");
  });

  it("throws invalid-response when the outer JSON body cannot be parsed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{bad json", { status: 200 })));

    await expect(requestDeepSeekTranslation("sk-test", "Learning", "zh-CN")).rejects.toMatchObject({
      code: "invalid-response"
    });
  });

  it("throws invalid-response when response.json rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => Promise.reject(new SyntaxError("invalid json"))
      }))
    );

    await expect(requestDeepSeekTranslation("sk-test", "Learning", "zh-CN")).rejects.toMatchObject({
      code: "invalid-response"
    });
  });
});
