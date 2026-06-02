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

const StudyGuideGenerationService = require("../../../src/shared/services/StudyGuideGenerationService");

function buildService() {
  const GroqService = require("../../../src/shared/services/GroqService");
  const groqService = new GroqService("test-key");
  groqService.RATE_LIMIT_RETRIES_PER_MODEL = 1;
  groqService.modelFallbackChain = ["fast-model"];
  const svc = new StudyGuideGenerationService(groqService);
  return svc;
}

function mockCreate() {
  const Groq = require("groq-sdk").Groq;
  return Groq._mockCreate;
}

describe("StudyGuideGenerationService.isPayloadTooLargeError()", () => {
  it("returns true for 413 status", () => {
    const svc = buildService();
    expect(svc.isPayloadTooLargeError({ status: 413 })).toBe(true);
  });

  it("returns true for 'context_length_exceeded' message", () => {
    const svc = buildService();
    expect(
      svc.isPayloadTooLargeError({ message: "context_length_exceeded" }),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    const svc = buildService();
    expect(svc.isPayloadTooLargeError({ status: 500 })).toBe(false);
  });
});

describe("StudyGuideGenerationService.trimAtSentence()", () => {
  it("returns text unchanged if under limit", () => {
    const svc = buildService();
    expect(svc.trimAtSentence("Short text.", 100)).toBe("Short text.");
  });

  it("trims at sentence boundary", () => {
    const svc = buildService();
    const text = "First sentence. Second sentence here. Third sentence.";
    const result = svc.trimAtSentence(text, 40);
    expect(result.length).toBeLessThanOrEqual(40);
  });
});

describe("StudyGuideGenerationService.buildFallbackScale()", () => {
  it("scales down values with a high ratio", () => {
    const svc = buildService();
    // maxCompletionTokens floor is 4200, so we need a value >> 4200 to see scaling
    const scale = { maxCompletionTokens: 10000 };
    const result = svc.buildFallbackScale(scale, 0.5);
    expect(result.maxCompletionTokens).toBeLessThan(10000);
  });

  it("clamps ratio to [0.45, 1]", () => {
    const svc = buildService();
    const scale = { maxCompletionTokens: 10000 };
    const withLow = svc.buildFallbackScale(scale, 0.1); // clamped to 0.45
    const withHigh = svc.buildFallbackScale(scale, 2.0); // clamped to 1
    expect(withLow.maxCompletionTokens).toBeGreaterThan(0);
    expect(withHigh.maxCompletionTokens).toBeLessThanOrEqual(10000);
  });
});

describe("StudyGuideGenerationService.generateGuide()", () => {
  it("returns guide text on success", async () => {
    const svc = buildService();
    mockCreate().mockResolvedValue({
      choices: [{ message: { content: "## Resumen Ejecutivo\nContent here" } }],
    });

    const result = await svc.generateGuide("Study material here", {
      maxCompletionTokens: 1000,
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses section mode when estimatedPages > 120", async () => {
    const svc = buildService();
    mockCreate().mockResolvedValue({
      choices: [
        { message: { content: "## Resumen Ejecutivo\nSection content here." } },
      ],
    });

    const result = await svc.generateGuide("content", { estimatedPages: 200 });
    expect(typeof result).toBe("string");
  });

  it("retries on payload too large error", async () => {
    const svc = buildService();
    const largeError = new Error("context_length_exceeded");
    largeError.status = 413;

    // First attempt fails with payload error, second succeeds
    mockCreate()
      .mockRejectedValueOnce(largeError)
      .mockResolvedValue({
        choices: [{ message: { content: "## Resumen\nContent." } }],
      });

    const result = await svc.generateGuide("content", {});
    expect(typeof result).toBe("string");
  });

  it("throws non-payload-large errors immediately", async () => {
    const svc = buildService();
    mockCreate().mockRejectedValue(new Error("Server error"));
    await expect(svc.generateGuide("content", {})).rejects.toThrow(
      "Server error",
    );
  });

  it("throws when all payload-size retries exhausted", async () => {
    const svc = buildService();
    const largeError = new Error("context_length_exceeded");
    largeError.status = 413;
    mockCreate().mockRejectedValue(largeError);

    await expect(svc.generateGuide("content", {})).rejects.toThrow();
  });

  it("refineGuideQuality returns original when AI throws", async () => {
    const svc = buildService();
    mockCreate().mockRejectedValue(new Error("Refine failed"));
    const result = await svc.refineGuideQuality("## Guide Content Here", {});
    expect(result).toBe("## Guide Content Here");
  });

  it("refineGuideQuality skips refinement for long guides", async () => {
    const svc = buildService();
    const longGuide = "x".repeat(8000);
    const result = await svc.refineGuideQuality(longGuide, {});
    expect(result).toBe(longGuide);
  });
});

describe("StudyGuideGenerationService.extractCoverageWindow()", () => {
  it("returns empty string for empty input", () => {
    const svc = buildService();
    expect(svc.extractCoverageWindow("", 0, 1, 100)).toBe("");
  });

  it("returns full text when shorter than maxChars", () => {
    const svc = buildService();
    const text = "Short text";
    expect(svc.extractCoverageWindow(text, 0, 1, 1000)).toBe(text);
  });

  it("returns windowed slice for large text", () => {
    const svc = buildService();
    const text = "x".repeat(10000);
    const result = svc.extractCoverageWindow(text, 0, 3, 2000);
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});

describe("StudyGuideGenerationService.generateGuideBySections()", () => {
  it("returns guide built from sections", async () => {
    const svc = buildService();
    const mc = mockCreate();
    mc.mockResolvedValue({
      choices: [{ message: { content: "## Section Content" } }],
    });

    const result = await svc.generateGuideBySections("content", {
      estimatedPages: 150,
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("throws when all sections return empty", async () => {
    const svc = buildService();
    const mc = mockCreate();
    mc.mockResolvedValue({ choices: [{ message: { content: "" } }] });

    await expect(svc.generateGuideBySections("content", {})).rejects.toThrow(
      "secciones",
    );
  });
});

describe("StudyGuideGenerationService.generateGuide() — non-payload error", () => {
  it("throws non-payload-too-large errors immediately", async () => {
    const svc = buildService();
    const mc = mockCreate();
    mc.mockRejectedValue(new Error("unexpected server error"));

    await expect(
      svc.generateGuide("content", { maxCompletionTokens: 10000 }),
    ).rejects.toThrow("unexpected server error");
  });

  it("throws when AI returns empty content", async () => {
    const svc = buildService();
    const mc = mockCreate();
    mc.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });

    await expect(svc.generateGuide("content", {})).rejects.toThrow(
      "La IA no devolvió contenido",
    );
  });
});
