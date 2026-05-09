process.env.GROQ_API_KEY = "test-key";

jest.mock("groq-sdk", () => {
  const mockCreate = jest.fn();
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  return { Groq: MockGroq };
});

jest.mock("../../../src/shared/config/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const TrueFalseGenerationService = require("../../../src/shared/services/TrueFalseGenerationService");

function buildService() {
  const svc = new TrueFalseGenerationService("test-key");
  svc.RATE_LIMIT_RETRIES_PER_MODEL = 1;
  svc.modelFallbackChain = ["fast-model"];
  return svc;
}

function mockCreate(svc) {
  return svc.groq.chat.completions.create;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("TrueFalseGenerationService.isUsefulExplanation()", () => {
  it("returns false for null/empty", () => {
    const svc = buildService();
    expect(svc.isUsefulExplanation(null)).toBe(false);
    expect(svc.isUsefulExplanation("")).toBe(false);
  });

  it("returns false for short explanation", () => {
    const svc = buildService();
    expect(svc.isUsefulExplanation("Es verdadero.")).toBe(false);
  });

  it("returns false for generic 'es verdadero' pattern (ends with it)", () => {
    const svc = buildService();
    // pattern requires the text to end with "es verdadero"
    const text = "La afirmacion sobre la rotacion terrestre es verdadero";
    expect(svc.isUsefulExplanation(text)).toBe(false);
  });

  it("returns true for useful explanation", () => {
    const svc = buildService();
    const text =
      "La afirmación es correcta porque la mitosis produce células hijas con el mismo número de cromosomas que la célula madre, a diferencia de la meiosis que produce células haploides con la mitad del número cromosómico.";
    expect(svc.isUsefulExplanation(text)).toBe(true);
  });
});

describe("TrueFalseGenerationService.enhanceTrueFalseExplanations()", () => {
  it("returns original statements when input is empty", async () => {
    const svc = buildService();
    const result = await svc.enhanceTrueFalseExplanations("content", []);
    expect(result).toEqual([]);
  });

  it("returns original statements on AI error", async () => {
    const svc = buildService();
    mockCreate(svc).mockRejectedValueOnce(new Error("AI error"));
    const statements = [{ statement: "The Earth is round.", is_true: true }];
    const result = await svc.enhanceTrueFalseExplanations(
      "content",
      statements,
    );
    expect(result).toBe(statements);
  });

  it("merges improved explanations on success", async () => {
    const svc = buildService();
    const newExplanation =
      "This detailed explanation discusses why the statement is true. Plants use sunlight, water, and carbon dioxide to produce glucose through the process of photosynthesis, which occurs in chloroplasts.";
    mockCreate(svc).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              questions: [
                {
                  index: 0,
                  explanation: newExplanation,
                },
              ],
            }),
          },
        },
      ],
    });
    const statements = [
      {
        statement: "Plants photosynthesize.",
        is_true: true,
        explanation: "yes",
      },
    ];
    const result = await svc.enhanceTrueFalseExplanations(
      "content",
      statements,
    );
    expect(result[0].explanation).toBe(newExplanation);
  });
});

describe("TrueFalseGenerationService.buildTrueFalseGenerationMessages()", () => {
  it("returns system and user messages", () => {
    const svc = buildService();
    const msgs = svc.buildTrueFalseGenerationMessages("content", 5);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
  });

  it("includes excluded block when excluded non-empty", () => {
    const svc = buildService();
    const msgs = svc.buildTrueFalseGenerationMessages("content", 5, [
      "S1",
      "S2",
    ]);
    expect(msgs[1].content).toContain("PROHIBIDAS");
  });

  it("omits excluded block when excluded is empty", () => {
    const svc = buildService();
    const msgs = svc.buildTrueFalseGenerationMessages("content", 5, []);
    expect(msgs[1].content).not.toContain("PROHIBIDAS");
  });
});

describe("TrueFalseGenerationService.sanitizeTrueFalseStatements()", () => {
  it("filters out items with no statement", () => {
    const svc = buildService();
    const raw = [null, { statement: "", is_true: true }];
    expect(() => svc.sanitizeTrueFalseStatements(raw, 5)).toThrow();
  });

  it("filters out items where is_true is not boolean", () => {
    const svc = buildService();
    const raw = [{ statement: "Some statement", is_true: "true" }];
    expect(() => svc.sanitizeTrueFalseStatements(raw, 5)).toThrow();
  });

  it("deduplicates duplicate statements", () => {
    const svc = buildService();
    const raw = [
      { statement: "The sun is a star.", is_true: true, explanation: "exp" },
      { statement: "The sun is a star.", is_true: true, explanation: "exp2" },
    ];
    const result = svc.sanitizeTrueFalseStatements(raw, 5);
    expect(result.length).toBe(1);
  });

  it("limits results to quantity", () => {
    const svc = buildService();
    const raw = Array.from({ length: 10 }, (_, i) => ({
      statement: `Statement ${i}`,
      is_true: i % 2 === 0,
      explanation: "exp",
    }));
    const result = svc.sanitizeTrueFalseStatements(raw, 3);
    expect(result.length).toBe(3);
  });

  it("throws when no valid statements remain", () => {
    const svc = buildService();
    expect(() => svc.sanitizeTrueFalseStatements([], 5)).toThrow();
  });
});

describe("TrueFalseGenerationService.generateTrueFalseStatements()", () => {
  it("returns statements on success", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    const payload = JSON.stringify({
      questions: [
        {
          statement: "The Earth orbits the Sun.",
          is_true: true,
          explanation: "long enough explanation text here",
        },
        {
          statement: "The Moon is a planet.",
          is_true: false,
          explanation: "long enough explanation text here",
        },
      ],
    });
    mc.mockResolvedValueOnce({ choices: [{ message: { content: payload } }] });

    const result = await svc.generateTrueFalseStatements("content", [], 2);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when all attempts fail and nothing collected", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));

    await expect(
      svc.generateTrueFalseStatements("content", [], 3),
    ).rejects.toThrow();
  });

  it("uses last-resort attempt when all filtered by similarity", async () => {
    const svc = buildService();
    svc.MAX_GENERATION_ATTEMPTS = 1;
    const mc = mockCreate(svc);
    mc.mockReset();
    // Existing identical statement will be filtered out, triggering last-resort
    const existingText = "The sky is blue";
    const filtered = JSON.stringify({
      questions: [
        {
          statement: existingText,
          is_true: true,
          explanation: "because light",
        },
      ],
    });
    const lastResort = JSON.stringify({
      questions: [
        {
          statement: "A new unique statement about chemistry.",
          is_true: true,
          explanation: "because chemistry",
        },
      ],
    });
    mc.mockResolvedValueOnce({
      choices: [{ message: { content: filtered } }],
    }).mockResolvedValueOnce({
      choices: [{ message: { content: lastResort } }],
    });

    const existing = [{ statement: existingText }];
    const result = await svc.generateTrueFalseStatements(
      "content",
      existing,
      1,
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when last-resort also fails with existing statements", async () => {
    const svc = buildService();
    svc.MAX_GENERATION_ATTEMPTS = 1;
    const mc = mockCreate(svc);
    mc.mockReset();
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));

    await expect(
      svc.generateTrueFalseStatements(
        "content",
        [{ statement: "existing" }],
        1,
      ),
    ).rejects.toThrow();
  });

  it("returns finalStatements directly when more than 6 collected", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    const manyStatements = Array.from({ length: 7 }, (_, i) => ({
      statement: `Statement number ${i + 1} is unique and different.`,
      is_true: i % 2 === 0,
      explanation: "explanation",
    }));
    const payload = JSON.stringify({ questions: manyStatements });
    mc.mockResolvedValueOnce({ choices: [{ message: { content: payload } }] });

    const result = await svc.generateTrueFalseStatements("content", [], 7);
    expect(result.length).toBe(7);
  });
});
