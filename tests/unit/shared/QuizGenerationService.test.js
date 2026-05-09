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

const QuizGenerationService = require("../../../src/shared/services/QuizGenerationService");

function buildService() {
  const svc = new QuizGenerationService("test-key");
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

describe("QuizGenerationService.isUsefulExplanation()", () => {
  it("returns false for null/empty", () => {
    const svc = buildService();
    expect(svc.isUsefulExplanation(null)).toBe(false);
    expect(svc.isUsefulExplanation("")).toBe(false);
  });

  it("returns false for short explanation (<60 chars)", () => {
    const svc = buildService();
    expect(svc.isUsefulExplanation("Too short.")).toBe(false);
  });

  it("returns false for generic pattern 'es la correcta'", () => {
    const svc = buildService();
    // pattern requires text to end with "es la correcta"
    const text = "La opcion B es la correcta";
    expect(svc.isUsefulExplanation(text)).toBe(false);
  });

  it("returns true for useful explanation", () => {
    const svc = buildService();
    const text =
      "La fotosíntesis es el proceso mediante el cual las plantas convierten la energía solar en glucosa, usando dióxido de carbono y agua para producir azúcares y oxígeno como subproductos del proceso.";
    expect(svc.isUsefulExplanation(text)).toBe(true);
  });
});

describe("QuizGenerationService.sanitizeQuizQuestions()", () => {
  it("filters out questions with < 2 options", () => {
    const svc = buildService();
    const raw = [{ question: "Q?", options: ["A"], correct_answer: "A" }];
    expect(() => svc.sanitizeQuizQuestions(raw, 5)).toThrow();
  });

  it("filters out items with no question", () => {
    const svc = buildService();
    const raw = [
      { question: "", options: ["A", "B", "C", "D"], correct_answer: "A" },
    ];
    expect(() => svc.sanitizeQuizQuestions(raw, 5)).toThrow();
  });

  it("resolves correct_answer by letter index", () => {
    const svc = buildService();
    const raw = [
      {
        question: "What is 2+2?",
        options: ["1", "2", "4", "8"],
        correct_answer: "C",
      },
    ];
    const result = svc.sanitizeQuizQuestions(raw, 5);
    expect(result[0].correct_answer).toBe("4");
  });

  it("throws when no valid questions remain", () => {
    const svc = buildService();
    expect(() => svc.sanitizeQuizQuestions([], 5)).toThrow();
  });
});

describe("QuizGenerationService.enhanceQuizExplanations()", () => {
  it("returns original questions when AI throws a size error", async () => {
    const svc = buildService();
    const sizeError = new Error("Please reduce the length of your request");
    mockCreate(svc).mockRejectedValueOnce(sizeError);

    const questions = [
      { question: "Q?", options: ["A", "B", "C", "D"], correct_answer: "A" },
    ];
    const result = await svc.enhanceQuizExplanations("content", questions);
    expect(result).toBe(questions);
  });

  it("returns original questions when AI throws other error", async () => {
    const svc = buildService();
    mockCreate(svc).mockRejectedValueOnce(new Error("Random error"));
    const questions = [
      { question: "Q?", options: ["A", "B", "C", "D"], correct_answer: "A" },
    ];
    const result = await svc.enhanceQuizExplanations("content", questions);
    expect(result).toBe(questions);
  });

  it("returns original questions on payload-too-large error", async () => {
    const svc = buildService();
    mockCreate(svc).mockRejectedValueOnce(
      new Error("Please reduce the length of your request"),
    );
    const questions = [
      { question: "Q?", options: ["A", "B", "C", "D"], correct_answer: "A" },
    ];
    const result = await svc.enhanceQuizExplanations("content", questions);
    expect(result).toBe(questions);
  });

  it("returns original array when input is empty", async () => {
    const svc = buildService();
    const result = await svc.enhanceQuizExplanations("content", []);
    expect(result).toEqual([]);
  });

  it("merges improved explanations on success", async () => {
    const svc = buildService();
    mockCreate(svc).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              questions: [
                {
                  index: 0,
                  explanation:
                    "This is a very detailed explanation that meets the length requirement. It explains the concept thoroughly and helps students understand the material fully for learning purposes.",
                },
              ],
            }),
          },
        },
      ],
    });
    const questions = [
      {
        question: "Q?",
        options: ["A", "B", "C", "D"],
        correct_answer: "A",
        explanation: "short",
      },
    ];
    const result = await svc.enhanceQuizExplanations("content", questions);
    expect(result[0].explanation).not.toBe("short");
  });
});

describe("QuizGenerationService.buildQuizGenerationMessages()", () => {
  it("returns system and user messages", () => {
    const svc = buildService();
    const msgs = svc.buildQuizGenerationMessages("content", 5);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
  });

  it("includes excluded block when excluded array non-empty", () => {
    const svc = buildService();
    const msgs = svc.buildQuizGenerationMessages("content", 5, ["Q1", "Q2"]);
    expect(msgs[1].content).toContain("PREGUNTAS PROHIBIDAS");
  });

  it("omits excluded block when excluded is empty", () => {
    const svc = buildService();
    const msgs = svc.buildQuizGenerationMessages("content", 5, []);
    expect(msgs[1].content).not.toContain("PROHIBIDAS");
  });

  it("uses concise mode explanation rules when conciseMode=true", () => {
    const svc = buildService();
    const msgs = svc.buildQuizGenerationMessages("content", 5, [], {
      conciseMode: true,
    });
    expect(msgs[0].content).toContain("18 palabras");
  });
});

describe("QuizGenerationService.generateQuizQuestions()", () => {
  it("returns questions on success", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    mc.mockReset();
    const payload = JSON.stringify({
      questions: [
        {
          question: "Q1?",
          options: ["A", "B", "C", "D"],
          correct_answer: "A",
          explanation: "because A",
        },
        {
          question: "Q2?",
          options: ["A", "B", "C", "D"],
          correct_answer: "B",
          explanation: "because B",
        },
      ],
    });
    mc.mockResolvedValueOnce({ choices: [{ message: { content: payload } }] });

    const result = await svc.generateQuizQuestions("content", [], 2);
    expect(result.length).toBe(2);
    expect(result[0].question).toBe("Q1?");
  });

  it("throws when AI returns no valid questions after all attempts", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    mc.mockReset();
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));

    await expect(svc.generateQuizQuestions("content", [], 3)).rejects.toThrow();
  });

  it("uses last-resort attempt when strict dedup leaves too few results", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    mc.mockReset();
    // First batch returns questions, but all get filtered by TextDeduplication
    // We simulate by providing existing questions that are identical
    const questionText = "What is photosynthesis?";
    const payload = JSON.stringify({
      questions: [
        {
          question: questionText,
          options: ["A", "B", "C", "D"],
          correct_answer: "A",
          explanation: "exp",
        },
      ],
    });
    const lastResortPayload = JSON.stringify({
      questions: [
        {
          question: "A different question here?",
          options: ["A", "B", "C", "D"],
          correct_answer: "A",
          explanation: "exp",
        },
      ],
    });
    mc.mockResolvedValueOnce({
      choices: [{ message: { content: payload } }],
    }).mockResolvedValueOnce({
      choices: [{ message: { content: lastResortPayload } }],
    });

    const existing = [{ question: questionText }];
    const result = await svc.generateQuizQuestions("content", existing, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("discards questions similar to existing (debug log)", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    mc.mockReset();
    const existingQuestion = "What is photosynthesis?";
    // First 2 attempts return the duplicate, fill attempt returns new question
    const dupPayload = JSON.stringify({
      questions: [
        {
          question: existingQuestion,
          options: ["A", "B", "C", "D"],
          correct_answer: "A",
          explanation: "exp",
        },
      ],
    });
    const freshPayload = JSON.stringify({
      questions: [
        {
          question: "What is mitosis?",
          options: ["A", "B", "C", "D"],
          correct_answer: "A",
          explanation: "exp",
        },
      ],
    });
    mc.mockResolvedValueOnce({
      choices: [{ message: { content: dupPayload } }],
    })
      .mockResolvedValueOnce({
        choices: [{ message: { content: dupPayload } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: freshPayload } }],
      });

    const existing = [{ question: existingQuestion }];
    const result = await svc.generateQuizQuestions("content", existing, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when all attempts fail and collected is 0", async () => {
    const svc = buildService();
    const mc = mockCreate(svc);
    mc.mockReset();
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));
    mc.mockRejectedValueOnce(new Error("AI error"));

    await expect(svc.generateQuizQuestions("content", [], 3)).rejects.toThrow(
      "No se pudieron generar",
    );
  });
});
