import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeepSeekRequest, parseDeepSeekResponse, requestDeepSeekTranslation } from "./deepseek";

describe("deepseek helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a structured JSON-only chat request", () => {
    const request = buildDeepSeekRequest("Learning", "zh-CN");
    expect(request.model).toBe("deepseek-v4-flash");
    expect(request.messages[0]?.role).toBe("system");
    expect(request.messages[1]?.content).toContain("Learning");
    expect(JSON.stringify(request)).toContain("phonetic");
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

  it("rejects invalid response shapes", () => {
    expect(() => parseDeepSeekResponse({ choices: [] })).toThrow("DeepSeek returned an invalid response");
    expect(() => parseDeepSeekResponse({ choices: [{ message: { content: "{}" } }] })).toThrow(
      "DeepSeek returned an invalid response"
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
});
