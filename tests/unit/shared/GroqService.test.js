process.env.GROQ_API_KEY = "test-key";

jest.mock("groq-sdk", () => {
  const mockCreate = jest.fn();
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  MockGroq._mockCreate = mockCreate;
  return { Groq: MockGroq };
});

jest.mock("../../../src/shared/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { Groq } = require("groq-sdk");
const GroqService = require("../../../src/shared/services/GroqService");

function buildService() {
  return new GroqService("test-key");
}

function getMockCreate(service) {
  return service.groq.chat.completions.create;
}

describe("GroqService._uniqueDefined()", () => {
  it("removes duplicates and empty strings", () => {
    const svc = buildService();
    expect(svc._uniqueDefined(["a", "b", "a", "", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("returns empty array for empty input", () => {
    const svc = buildService();
    expect(svc._uniqueDefined([])).toEqual([]);
  });
});

describe("GroqService._parseModelList()", () => {
  it("parses comma-separated model names", () => {
    const svc = buildService();
    expect(svc._parseModelList("model-a, model-b, model-c")).toEqual([
      "model-a",
      "model-b",
      "model-c",
    ]);
  });

  it("returns empty array for non-string input", () => {
    const svc = buildService();
    expect(svc._parseModelList(null)).toEqual([]);
    expect(svc._parseModelList(42)).toEqual([]);
  });
});

describe("GroqService._buildConfiguredModelChain()", () => {
  it("uses env variable GROQ_MODEL_CHAIN when set", () => {
    process.env.GROQ_MODEL_CHAIN = "model-x,model-y";
    const svc = buildService();
    // Chain should include model-x and model-y
    expect(svc.modelFallbackChain).toContain("model-x");
    expect(svc.modelFallbackChain).toContain("model-y");
    delete process.env.GROQ_MODEL_CHAIN;
  });

  it("falls back to default chain when env not set", () => {
    delete process.env.GROQ_MODEL_CHAIN;
    const svc = buildService();
    expect(svc.modelFallbackChain.length).toBeGreaterThan(0);
  });
});

describe("GroqService._buildOrderedAttemptChain()", () => {
  it("starts with preferred model when it exists in chain", () => {
    const svc = buildService();
    const preferred = svc.modelFallbackChain[2]; // pick a model in the chain
    const chain = svc._buildOrderedAttemptChain(preferred);
    expect(chain[0]).toBe(preferred);
  });

  it("prepends preferred model when not in chain", () => {
    const svc = buildService();
    const chain = svc._buildOrderedAttemptChain("new-custom-model");
    expect(chain[0]).toBe("new-custom-model");
  });

  it("prepends fallback model when not in chain", () => {
    const svc = buildService();
    const chain = svc._buildOrderedAttemptChain("", "custom-fallback-model");
    expect(chain).toContain("custom-fallback-model");
  });

  it("handles empty base chain", () => {
    const svc = buildService();
    svc.modelFallbackChain = [];
    const chain = svc._buildOrderedAttemptChain("preferred-model");
    expect(chain.length).toBeGreaterThan(0);
  });
});

describe("GroqService.parseJsonPayload()", () => {
  it("parses raw JSON object", () => {
    const svc = buildService();
    expect(svc.parseJsonPayload('{"key":"value"}')).toEqual({ key: "value" });
  });

  it("parses JSON wrapped in markdown code fence", () => {
    const svc = buildService();
    const content = '```json\n{"key":"value"}\n```';
    expect(svc.parseJsonPayload(content)).toEqual({ key: "value" });
  });

  it("parses JSON array", () => {
    const svc = buildService();
    expect(svc.parseJsonPayload("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("throws when content is empty", () => {
    const svc = buildService();
    expect(() => svc.parseJsonPayload("")).toThrow();
    expect(() => svc.parseJsonPayload(null)).toThrow();
  });

  it("extracts JSON when surrounded by non-JSON text", () => {
    const svc = buildService();
    const content = 'Here is the result: {"answer": 42} end';
    expect(svc.parseJsonPayload(content)).toEqual({ answer: 42 });
  });

  it("throws on completely invalid JSON", () => {
    const svc = buildService();
    expect(() => svc.parseJsonPayload("not json at all here")).toThrow();
  });
});

describe("GroqService.createChatCompletion()", () => {
  it("returns response on success", async () => {
    const svc = buildService();
    const mockCreate = getMockCreate(svc);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "result" } }],
    });

    const result = await svc.createChatCompletion({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(result.choices[0].message.content).toBe("result");
  });

  it("throws when circuit breaker is open", async () => {
    const svc = buildService();
    svc._cb.state = "OPEN";
    svc._cb.lastFailureAt = Date.now(); // recent failure, still in cooldown
    await expect(
      svc.createChatCompletion({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow();
  });

  it("transitions circuit breaker from OPEN to HALF_OPEN after cooldown", async () => {
    const svc = buildService();
    svc._cb.state = "OPEN";
    svc._cb.lastFailureAt = Date.now() - 2 * svc._cb.COOLDOWN_MS; // expired cooldown
    const mockCreate = getMockCreate(svc);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });

    await svc.createChatCompletion({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(svc._cb.state).toBe("CLOSED");
  });

  it("throws non-rate-limit error immediately", async () => {
    const svc = buildService();
    const mockCreate = getMockCreate(svc);
    const serverError = new Error("Server error");
    serverError.status = 500;
    mockCreate.mockRejectedValue(serverError);

    await expect(
      svc.createChatCompletion({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("Server error");
  });

  it("tries next model on rate-limit error and succeeds", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    const mockCreate = getMockCreate(svc);
    const rateLimitError = new Error("rate limit exceeded");
    rateLimitError.status = 429;

    // First call fails with rate-limit, second succeeds
    mockCreate.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({
      choices: [{ message: { content: "success" } }],
    });

    const result = await svc.createChatCompletion({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(result.choices[0].message.content).toBe("success");
  });

  it("throws when no models available", async () => {
    const svc = buildService();
    svc.modelFallbackChain = [];
    svc.fastModel = "";
    svc.qualityModel = "";

    await expect(
      svc.createChatCompletion({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow();
  });
});

describe("GroqService circuit breaker", () => {
  it("opens after FAILURE_THRESHOLD non-rate-limit failures", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["only-model"];
    const mockCreate = getMockCreate(svc);
    const serverError = new Error("Server down");
    serverError.status = 503;
    mockCreate.mockRejectedValue(serverError);

    // Fail enough times to open the breaker (FAILURE_THRESHOLD = 5)
    for (let i = 0; i < svc._cb.FAILURE_THRESHOLD; i++) {
      try {
        await svc.createChatCompletion({
          messages: [{ role: "user", content: "hello" }],
        });
      } catch {
        // expected
      }
    }

    expect(svc._cb.state).toBe("OPEN");
  });
});

describe("GroqService._getRateLimitBackoffMs()", () => {
  it("parses seconds from error message", () => {
    const svc = buildService();
    const error = new Error("try again in 2.5s");
    const ms = svc._getRateLimitBackoffMs(error, 0);
    expect(ms).toBeGreaterThanOrEqual(2700);
  });

  it("parses milliseconds from error message", () => {
    const svc = buildService();
    const error = new Error("try again in 500ms");
    const ms = svc._getRateLimitBackoffMs(error, 0);
    expect(ms).toBeGreaterThanOrEqual(700);
  });

  it("uses exponential fallback when no time in message", () => {
    const svc = buildService();
    const error = new Error("rate limited");
    const ms = svc._getRateLimitBackoffMs(error, 0);
    expect(ms).toBeGreaterThanOrEqual(1200);
  });
});

describe("GroqService.summarizeChunk()", () => {
  it("returns trimmed summary text", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "  summary text  " } }],
    });

    const result = await svc.summarizeChunk("some content");
    expect(result).toBe("summary text");
  });
});

describe("GroqService.summarizeSummary()", () => {
  it("returns compressed summary", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "compressed summary" } }],
    });

    const result = await svc.summarizeSummary("long summary text");
    expect(result).toBe("compressed summary");
  });
});

describe("GroqService.extractStudyNotes()", () => {
  it("returns normalized payload on success", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    const payload = JSON.stringify({
      keyPoints: ["point 1"],
      definitions: ["def 1"],
      facts: [],
      examples: [],
    });
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: payload } }],
    });

    const result = await svc.extractStudyNotes("chunk text", {
      index: 0,
      totalChunks: 1,
    });
    expect(result.keyPoints).toEqual(["point 1"]);
    expect(result.definitions).toEqual(["def 1"]);
  });

  it("retries without json_object format on json_validate_failed error", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    const jsonError = new Error("json_validate_failed");
    const payload = JSON.stringify({
      keyPoints: ["retry point"],
      definitions: [],
      facts: [],
      examples: [],
    });
    mockCreate
      .mockRejectedValueOnce(jsonError)
      .mockResolvedValueOnce({ choices: [{ message: { content: payload } }] });

    const result = await svc.extractStudyNotes("chunk", {
      index: 0,
      totalChunks: 1,
    });
    expect(result.keyPoints).toEqual(["retry point"]);
  });

  it("throws for non-retryable errors", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    mockCreate.mockRejectedValueOnce(new Error("server error"));

    await expect(
      svc.extractStudyNotes("chunk", { index: 0, totalChunks: 1 }),
    ).rejects.toThrow("server error");
  });
});

describe("GroqService.cleanOcrText()", () => {
  it("returns cleaned text", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "  clean text  " } }],
    });

    const result = await svc.cleanOcrText("raw ocr text");
    expect(result).toBe("clean text");
  });
});

describe("GroqService.compressKnowledgeContext()", () => {
  it("returns compressed context", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "compressed context" } }],
    });

    const result = await svc.compressKnowledgeContext("long notes text", 500);
    expect(result).toBe("compressed context");
  });
});

describe("GroqService.createChatCompletion() rate-limit with multiple retries", () => {
  it("waits and retries on rate-limit before moving to next model", async () => {
    jest.useFakeTimers();
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 2;
    svc.modelFallbackChain = ["fast-model"];
    const mockCreate = getMockCreate(svc);
    const rateLimitError = new Error("rate limit exceeded");
    rateLimitError.status = 429;

    mockCreate
      .mockRejectedValueOnce(rateLimitError) // first attempt: rate-limit
      .mockResolvedValueOnce({
        choices: [{ message: { content: "ok after retry" } }],
      }); // second attempt: success

    const promise = svc.createChatCompletion({
      messages: [{ role: "user", content: "hi" }],
    });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.choices[0].message.content).toBe("ok after retry");
    jest.useRealTimers();
  });

  it("throws rate-limit error after all retries on all models exhausted", async () => {
    const svc = buildService();
    svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
    svc.modelFallbackChain = ["model-a", "model-b"];
    const mockCreate = getMockCreate(svc);
    const rateLimitError = new Error("rate limit exceeded");
    rateLimitError.status = 429;

    mockCreate.mockRejectedValue(rateLimitError);

    await expect(
      svc.createChatCompletion({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow("limite temporal");
  });
});

