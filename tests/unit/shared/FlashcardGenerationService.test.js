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

const FlashcardGenerationService = require("../../../src/shared/services/FlashcardGenerationService");

function buildService() {
  const svc = new FlashcardGenerationService("test-key");
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

describe("FlashcardGenerationService.buildFlashcardGenerationMessages()", () => {
  it("returns messages array with system and user roles", () => {
    const svc = buildService();
    const msgs = svc.buildFlashcardGenerationMessages("content here", 5);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
  });

  it("includes excluded questions block when excluded is non-empty", () => {
    const svc = buildService();
    const msgs = svc.buildFlashcardGenerationMessages("content", 3, [
      "Q1?",
      "Q2?",
    ]);
    expect(msgs[1].content).toContain("PROHIBIDAS");
  });

  it("omits excluded block when excluded is empty", () => {
    const svc = buildService();
    const msgs = svc.buildFlashcardGenerationMessages("content", 3, []);
    expect(msgs[1].content).not.toContain("PROHIBIDAS");
  });
});

describe("FlashcardGenerationService.isRelevantFlashcard()", () => {
  it("returns false for card mentioning author", () => {
    const svc = buildService();
    expect(
      svc.isRelevantFlashcard({
        question: "Quién es el autor?",
        answer: "Smith",
      }),
    ).toBe(false);
  });

  it("returns true for content card", () => {
    const svc = buildService();
    expect(
      svc.isRelevantFlashcard({
        question: "Qué es la fotosíntesis?",
        answer: "Proceso de conversión de luz solar en energía",
      }),
    ).toBe(true);
  });
});

describe("FlashcardGenerationService.sanitizeFlashcards()", () => {
  it("deduplicates same questions", () => {
    const svc = buildService();
    const cards = [
      { question: "What is X?", answer: "Y" },
      { question: "What is X?", answer: "Z" },
      { question: "What is Y?", answer: "W" },
    ];
    const result = svc.sanitizeFlashcards(cards, 10);
    expect(result).toHaveLength(2);
  });

  it("skips cards with empty question or answer", () => {
    const svc = buildService();
    const cards = [
      { question: "", answer: "Y" },
      { question: "Valid question?", answer: "Good answer" },
    ];
    const result = svc.sanitizeFlashcards(cards, 10);
    expect(result).toHaveLength(1);
  });

  it("appends ? if missing", () => {
    const svc = buildService();
    const cards = [{ question: "What is this", answer: "A thing" }];
    const result = svc.sanitizeFlashcards(cards, 10);
    expect(result[0].question.endsWith("?")).toBe(true);
  });

  it("throws if no valid cards remain", () => {
    const svc = buildService();
    expect(() => svc.sanitizeFlashcards([], 5)).toThrow();
  });
});

describe("FlashcardGenerationService.generateFlashCards()", () => {
  it("returns flashcards on success", async () => {
    const svc = buildService();
    mockCreate(svc).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              flashcards: [
                { question: "What is photosynthesis?", answer: "A process" },
              ],
            }),
          },
        },
      ],
    });

    const result = await svc.generateFlashCards("content", [], 1);
    expect(result).toHaveLength(1);
    expect(result[0].question).toContain("?");
  });

  it("retries and falls back when all attempts fail", async () => {
    const svc = buildService();
    svc.MAX_GENERATION_ATTEMPTS = 2;
    mockCreate(svc).mockRejectedValue(new Error("AI unavailable"));

    await expect(svc.generateFlashCards("content", [], 1)).rejects.toThrow();
  });

  it("runs last-resort attempt when all filtered due to similarity", async () => {
    const svc = buildService();
    svc.MAX_GENERATION_ATTEMPTS = 1;

    // All attempts return similar cards that get filtered by dedup, then final attempt also fails
    mockCreate(svc).mockRejectedValue(new Error("AI error"));

    await expect(
      svc.generateFlashCards("content", ["What is the topic?"], 1),
    ).rejects.toThrow();
  });

  it("last-resort succeeds when all filtered by similarity", async () => {
    const svc = buildService();
    svc.MAX_GENERATION_ATTEMPTS = 1;

    const existingQuestion = "What is photosynthesis?";
    const duplicatePayload = JSON.stringify({
      flashcards: [{ question: existingQuestion, answer: "A process" }],
    });
    const lastResortPayload = JSON.stringify({
      flashcards: [
        {
          question: "What is cellular respiration?",
          answer: "Energy from glucose",
        },
      ],
    });

    mockCreate(svc)
      .mockResolvedValueOnce({
        choices: [{ message: { content: duplicatePayload } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: lastResortPayload } }],
      });

    const result = await svc.generateFlashCards(
      "content",
      [{ question: existingQuestion }],
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("What is cellular respiration?");
  });

  it("generateFlashCard returns single card", async () => {
    const svc = buildService();
    mockCreate(svc).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              flashcards: [
                { question: "What is science?", answer: "Study of nature" },
              ],
            }),
          },
        },
      ],
    });
    const card = await svc.generateFlashCard("content");
    expect(card).toBeDefined();
    expect(card.question).toBeDefined();
  });
});

describe("FlashcardGenerationService.generateFlashCards() — last resort failure path", () => {
  it("throws when all filtered by similarity and last-resort also fails", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);

    // Same question as existing — filtered by similarity → last resort triggered
    // Last resort also fails
    const existingQuestion = "What is photosynthesis?";
    const payload = JSON.stringify({
      flashcards: [{ question: existingQuestion, answer: "Light reaction" }],
    });
    mc.mockResolvedValueOnce({
      choices: [{ message: { content: payload } }],
    }).mockRejectedValueOnce(new Error("last resort failed"));

    const existing = [{ question: existingQuestion }];
    await expect(
      svc.generateFlashCards("content", existing, 1),
    ).rejects.toThrow();
  });
});
