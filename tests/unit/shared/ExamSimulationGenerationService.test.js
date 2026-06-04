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

const ExamSimulationGenerationService = require("../../../src/shared/services/ExamSimulationGenerationService");

function buildService() {
  const GroqService = require("../../../src/shared/services/GroqService");
  const groqService = new GroqService("test-key");
  groqService.RATE_LIMIT_RETRIES_PER_MODEL = 1;
  groqService.modelFallbackChain = ["fast-model"];
  const safetyMock = { checkBatch: jest.fn().mockImplementation((items) => items) };
  const svc = new ExamSimulationGenerationService(groqService, safetyMock);
  return svc;
}

function mockCreate() {
  const Groq = require("groq-sdk").Groq;
  return Groq._mockCreate;
}

describe("ExamSimulationGenerationService.normalizeText()", () => {
  it("lowercases and removes accents", () => {
    const svc = buildService();
    const result = svc.normalizeText("Hola Mundo");
    expect(result).toBe("hola mundo");
  });

  it("handles empty string", () => {
    const svc = buildService();
    expect(svc.normalizeText("")).toBe("");
  });
});

describe("ExamSimulationGenerationService.isWeakGeneratedDevelopmentItem()", () => {
  it("returns true for empty prompt", () => {
    const svc = buildService();
    expect(svc.isWeakGeneratedDevelopmentItem({ prompt: "" })).toBe(true);
  });

  it("returns true for short reference_answer", () => {
    const svc = buildService();
    expect(
      svc.isWeakGeneratedDevelopmentItem({
        prompt: "Explain photosynthesis",
        reference_answer: "Short answer",
        evaluation_criteria: "Debe incluir: mention of sunlight",
      }),
    ).toBe(true);
  });

  it("returns false for strong item", () => {
    const svc = buildService();
    const item = {
      prompt: "Explain how photosynthesis works in detail",
      reference_answer:
        "Photosynthesis is a process used by plants to convert light energy into chemical energy. The light-dependent reactions occur in the thylakoids and produce ATP and NADPH. The Calvin cycle uses these to fix CO2 into glucose. Key enzymes include RuBisCO.",
      evaluation_criteria:
        "Debe incluir: definicion del proceso, reactivos, productos, etapas principales y enzimas clave",
    };
    expect(svc.isWeakGeneratedDevelopmentItem(item)).toBe(false);
  });
});

describe("ExamSimulationGenerationService.generateDevelopmentQuestions()", () => {
  it("returns questions on success", async () => {
    const svc = buildService();
    mockCreate().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              questions: [
                {
                  prompt: "Explain the process",
                  reference_answer:
                    "A long reference answer that covers all key aspects of the question being asked by the examiner. It has enough detail to be useful.",
                  evaluation_criteria:
                    "Debe incluir: definition, mechanism, impact, and application of the concept in real scenarios",
                  max_points: 10,
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await svc.generateDevelopmentQuestions("content", 1);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].prompt).toBeDefined();
  });

  it("throws when AI returns no valid questions", async () => {
    const svc = buildService();
    mockCreate().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ questions: [] }),
          },
        },
      ],
    });

    await expect(
      svc.generateDevelopmentQuestions("content", 1),
    ).rejects.toThrow();
  });

  it("clamps quantity between 1 and 10", async () => {
    const svc = buildService();
    const goodItem = {
      prompt: "Explain photosynthesis in detail",
      reference_answer:
        "Photosynthesis converts light energy to chemical energy. It occurs in chloroplasts via light and dark reactions. Products include glucose and oxygen used by the cell.",
      evaluation_criteria:
        "Debe incluir: definicion, etapas, productos y ubicacion en la celula vegetal y sus organelos",
      max_points: 10,
    };
    mockCreate().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              questions: Array(15).fill(goodItem),
            }),
          },
        },
      ],
    });

    const result = await svc.generateDevelopmentQuestions("content", 50);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});

describe("ExamSimulationGenerationService.evaluateDevelopmentAnswers()", () => {
  it("returns empty array for empty input", async () => {
    const svc = buildService();
    const result = await svc.evaluateDevelopmentAnswers([]);
    expect(result).toEqual([]);
  });

  it("returns empty array for non-array input", async () => {
    const svc = buildService();
    const result = await svc.evaluateDevelopmentAnswers(null);
    expect(result).toEqual([]);
  });

  it("returns results on success", async () => {
    const svc = buildService();
    mockCreate().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  questionId: "q1",
                  points: 7,
                  feedback: "Good answer",
                  missingConcepts: [],
                  strengths: ["Covers main points"],
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await svc.evaluateDevelopmentAnswers([
      {
        questionId: "q1",
        prompt: "Explain X",
        referenceAnswer: "ref",
        evaluationCriteria: "criteria",
        submittedText: "answer",
        maxPoints: 10,
      },
    ]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].questionId).toBe("q1");
    expect(result[0].points).toBe(7);
  });

  it("filters out items without questionId or prompt", async () => {
    const svc = buildService();
    const result = await svc.evaluateDevelopmentAnswers([
      {
        questionId: "",
        prompt: "Explain X",
        submittedText: "answer",
        maxPoints: 10,
      },
    ]);
    expect(result).toEqual([]);
  });

  it("filters out AI results with unknown questionId", async () => {
    const svc = buildService();
    mockCreate().mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                {
                  questionId: "unknown-id",
                  points: 5,
                  feedback: "OK",
                  missingConcepts: [],
                  strengths: [],
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await svc.evaluateDevelopmentAnswers([
      {
        questionId: "q1",
        prompt: "Explain X",
        submittedText: "answer",
        maxPoints: 10,
      },
    ]);
    expect(result).toEqual([]);
  });
});

describe("ExamSimulationGenerationService.repairDevelopmentItems()", () => {
  it("returns original questions when none are weak", async () => {
    const svc = buildService();
    const questions = [
      {
        prompt: "Explain photosynthesis completely and in detail",
        reference_answer:
          "Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose. It requires chlorophyll, water, and CO2. Occurs in two stages: light reactions and Calvin cycle.",
        evaluation_criteria:
          "Debe incluir: definicion, organelos, etapas, reactivos, productos y enzimas principales del proceso",
        max_points: 10,
      },
    ];

    const result = await svc.repairDevelopmentItems(questions);
    expect(result).toBe(questions);
  });

  it("falls back to original on AI error", async () => {
    const svc = buildService();
    mockCreate().mockRejectedValue(new Error("AI error"));
    const questions = [
      {
        prompt: "Explain something",
        reference_answer: "short",
        evaluation_criteria: "some criteria",
        max_points: 10,
      },
    ];
    const result = await svc.repairDevelopmentItems(questions);
    expect(result).toEqual(questions);
  });

  it("applies AI repairs to weak items", async () => {
    const svc = buildService();
    const questions = [
      {
        prompt: "Explain the structure of DNA",
        reference_answer: "short", // weak item
        evaluation_criteria: "old criteria",
        max_points: 10,
      },
    ];
    const repairPayload = JSON.stringify({
      repairs: [
        {
          index: 0,
          reference_answer:
            "DNA is a double helix composed of nucleotides with adenine, thymine, cytosine, and guanine base pairs.",
          evaluation_criteria:
            "Mentions double helix, nucleotides, and base pairing.",
        },
      ],
    });
    mockCreate().mockResolvedValueOnce({
      choices: [{ message: { content: repairPayload } }],
    });

    const result = await svc.repairDevelopmentItems(questions);
    expect(result[0].reference_answer).toContain("double helix");
  });

  it("skips repairs with non-integer index", async () => {
    const svc = buildService();
    const questions = [
      {
        prompt: "Explain DNA",
        reference_answer: "short",
        evaluation_criteria: "c",
        max_points: 5,
      },
    ];
    const repairPayload = JSON.stringify({
      repairs: [{ index: "not-a-number", reference_answer: "improved" }],
    });
    mockCreate().mockResolvedValueOnce({
      choices: [{ message: { content: repairPayload } }],
    });

    const result = await svc.repairDevelopmentItems(questions);
    // Original should be returned since the repair had invalid index
    expect(result[0].reference_answer).toBe("short");
  });
});
