/**
 * Unit tests — TrueFalseService
 * Covers createSet, getSetById, updateSet, deleteSet and validation paths.
 */

const TrueFalseService = require("../../../src/modules/truefalse/services/TrueFalseService");
const {
  ValidationError,
  NotFoundError,
} = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validTFSetInput,
  savedTFSet,
  validCategory,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService({
  repoOverrides = {},
  categoryOverrides = {},
  groqOverrides = {},
} = {}) {
  const trueFalseRepository = {
    create: jest.fn().mockResolvedValue(savedTFSet),
    findAllByUser: jest.fn().mockResolvedValue([savedTFSet]),
    findById: jest.fn().mockResolvedValue(savedTFSet),
    update: jest.fn().mockResolvedValue(savedTFSet),
    delete: jest.fn().mockResolvedValue(true),
    addQuestion: jest.fn().mockResolvedValue({}),
    updateQuestion: jest.fn().mockResolvedValue({}),
    deleteQuestion: jest.fn().mockResolvedValue(true),
    publish: jest.fn().mockResolvedValue(savedTFSet),
    ...repoOverrides,
  };
  const categoryService = {
    getCategoryById: jest.fn().mockResolvedValue(validCategory),
    ...categoryOverrides,
  };
  const groqService = {
    generateTrueFalseStatements: jest.fn().mockResolvedValue([]),
    ...groqOverrides,
  };
  const fileService = {
    extractText: jest.fn().mockResolvedValue("texto del archivo"),
  };
  const documentProcessingService = {
    buildStudyContext: jest.fn().mockResolvedValue("contexto procesado"),
  };

  return {
    service: new TrueFalseService(
      trueFalseRepository,
      categoryService,
      groqService,
      fileService,
      documentProcessingService,
    ),
    trueFalseRepository,
    categoryService,
    groqService,
    fileService,
  };
}

// ── createSet ─────────────────────────────────────────────────────────────────

describe("TrueFalseService.createSet()", () => {
  it("creates and returns a set with valid data", async () => {
    const { service, trueFalseRepository } = buildService();
    const result = await service.createSet(validTFSetInput, VALID_USER_ID);
    expect(trueFalseRepository.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual(savedTFSet);
  });

  it("throws ValidationError when title is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createSet({ ...validTFSetInput, title: "" }, VALID_USER_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when questions array is empty", async () => {
    const { service } = buildService();
    await expect(
      service.createSet({ ...validTFSetInput, questions: [] }, VALID_USER_ID),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.createSet(validTFSetInput, VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── getSetById ────────────────────────────────────────────────────────────────

describe("TrueFalseService.getSetById()", () => {
  it("returns the set when found", async () => {
    const { service } = buildService();
    const result = await service.getSetById(savedTFSet.id, VALID_USER_ID);
    expect(result).toEqual(savedTFSet);
  });

  it("throws NotFoundError when set does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.getSetById("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── updateSet ─────────────────────────────────────────────────────────────────

describe("TrueFalseService.updateSet()", () => {
  it("updates and returns the set", async () => {
    const { service } = buildService();
    const result = await service.updateSet(savedTFSet.id, VALID_USER_ID, {
      title: "Nuevo título",
    });
    expect(result).toEqual(savedTFSet);
  });

  it("throws NotFoundError when set does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateSet("nonexistent", VALID_USER_ID, {}),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── deleteSet ─────────────────────────────────────────────────────────────────

describe("TrueFalseService.deleteSet()", () => {
  it("deletes the set when it exists", async () => {
    const { service, trueFalseRepository } = buildService();
    await service.deleteSet(savedTFSet.id, VALID_USER_ID);
    expect(trueFalseRepository.delete).toHaveBeenCalledWith(
      savedTFSet.id,
      VALID_USER_ID,
    );
  });

  it("throws NotFoundError when set does not exist", async () => {
    const { service } = buildService({
      repoOverrides: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.deleteSet("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── generateSet ───────────────────────────────────────────────────────────────

describe("TrueFalseService.generateSet()", () => {
  const baseParams = {
    text: "La Gran Muralla China no es visible desde el espacio.",
    title: "Mitos populares",
    categoryId: VALID_CATEGORY_ID,
    quantity: 3,
    userId: VALID_USER_ID,
  };

  const rawStatements = [
    {
      statement: "La Tierra es plana.",
      is_true: false,
      explanation: "Es esférica.",
    },
    {
      statement: "El agua hierve a 100°C al nivel del mar.",
      is_true: true,
      explanation: null,
    },
    {
      statement: "Los humanos solo usamos el 10% del cerebro.",
      is_true: false,
      explanation: "Mito.",
    },
  ];

  it("returns mapped statement objects on happy path", async () => {
    const { service } = buildService({
      groqOverrides: {
        generateTrueFalseStatements: jest.fn().mockResolvedValue(rawStatements),
      },
    });
    const result = await service.generateSet(baseParams);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      statement: expect.any(String),
      is_true: expect.any(Boolean),
      order_index: 0,
    });
  });

  it("throws ValidationError when neither file nor text is provided", async () => {
    const { service } = buildService();
    await expect(
      service.generateSet({ ...baseParams, text: "  ", file: undefined }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when title is missing", async () => {
    const { service } = buildService();
    await expect(
      service.generateSet({ ...baseParams, title: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when categoryId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.generateSet({ ...baseParams, categoryId: null }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when category does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.generateSet(baseParams)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("extracts text from file when file is provided", async () => {
    const { service, fileService } = buildService({
      groqOverrides: {
        generateTrueFalseStatements: jest.fn().mockResolvedValue(rawStatements),
      },
    });
    const fakeFile = { originalname: "doc.pdf", size: 512 };
    await service.generateSet({
      ...baseParams,
      text: undefined,
      file: fakeFile,
    });
    expect(fileService.extractText).toHaveBeenCalledWith(fakeFile);
  });

  it("calls onProgress at key stages", async () => {
    const onProgress = jest.fn();
    const { service } = buildService({
      groqOverrides: {
        generateTrueFalseStatements: jest.fn().mockResolvedValue(rawStatements),
      },
    });
    await service.generateSet({ ...baseParams, onProgress });
    expect(onProgress).toHaveBeenCalled();
  });

  it("continues generation when existing statements fetch fails", async () => {
    const { service } = buildService({
      repoOverrides: {
        findAllByUser: jest.fn().mockRejectedValue(new Error("DB error")),
      },
      groqOverrides: {
        generateTrueFalseStatements: jest.fn().mockResolvedValue(rawStatements),
      },
    });
    const result = await service.generateSet(baseParams);
    expect(result).toHaveLength(3);
  });
});

// ── getSets ───────────────────────────────────────────────────────────────────

describe("TrueFalseService.getSets()", () => {
  it("delegates to trueFalseRepository.findAllByUser", async () => {
    const { service, trueFalseRepository } = buildService();
    const result = await service.getSets(VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
    });
    expect(trueFalseRepository.findAllByUser).toHaveBeenCalledWith(
      VALID_USER_ID,
      {
        categoryId: VALID_CATEGORY_ID,
      },
    );
    expect(result).toEqual([savedTFSet]);
  });
});

// ── updateSet — category validation ──────────────────────────────────────────

describe("TrueFalseService.updateSet() — category validation", () => {
  it("throws NotFoundError when new categoryId does not exist", async () => {
    const { service } = buildService({
      categoryOverrides: { getCategoryById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateSet(savedTFSet.id, VALID_USER_ID, {
        categoryId: "cat-new",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("updates successfully when new categoryId is valid", async () => {
    const { service } = buildService();
    const result = await service.updateSet(savedTFSet.id, VALID_USER_ID, {
      categoryId: VALID_CATEGORY_ID,
      title: "Título actualizado",
    });
    expect(result).toEqual(savedTFSet);
  });
});

// ── publish ───────────────────────────────────────────────────────────────────

describe("TrueFalseService.publish()", () => {
  it("delegates to trueFalseRepository.publish", async () => {
    const { service, trueFalseRepository } = buildService({
      repoOverrides: { publish: jest.fn().mockResolvedValue(savedTFSet) },
    });
    await service.publish(savedTFSet.id, VALID_USER_ID, true);
    expect(trueFalseRepository.publish).toHaveBeenCalledWith(
      savedTFSet.id,
      VALID_USER_ID,
      true,
    );
  });
});

// ── addQuestion ───────────────────────────────────────────────────────────────

describe("TrueFalseService.addQuestion()", () => {
  const validQ = {
    statement: "El sol es una estrella.",
    isTrue: true,
    explanation: "El sol es la estrella más cercana a la Tierra.",
    orderIndex: 0,
  };

  it("adds a valid question via repository", async () => {
    const { service, trueFalseRepository } = buildService({
      repoOverrides: { addQuestion: jest.fn().mockResolvedValue(validQ) },
    });
    await service.addQuestion(savedTFSet.id, VALID_USER_ID, validQ);
    expect(trueFalseRepository.addQuestion).toHaveBeenCalledTimes(1);
  });

  it("throws ValidationError when statement is empty", async () => {
    const { service } = buildService();
    await expect(
      service.addQuestion(savedTFSet.id, VALID_USER_ID, {
        ...validQ,
        statement: "",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when isTrue is not a boolean", async () => {
    const { service } = buildService();
    await expect(
      service.addQuestion(savedTFSet.id, VALID_USER_ID, {
        ...validQ,
        isTrue: "yes",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts is_true field as alias for isTrue", async () => {
    const { service, trueFalseRepository } = buildService({
      repoOverrides: { addQuestion: jest.fn().mockResolvedValue({}) },
    });
    await service.addQuestion(savedTFSet.id, VALID_USER_ID, {
      statement: "El agua moja.",
      is_true: true,
    });
    expect(trueFalseRepository.addQuestion).toHaveBeenCalledTimes(1);
  });
});

// ── updateQuestion ────────────────────────────────────────────────────────────

describe("TrueFalseService.updateQuestion()", () => {
  const validQ = {
    statement: "El sol es una estrella.",
    isTrue: true,
    explanation: "Correcto.",
    orderIndex: 0,
  };

  it("updates a valid question via repository", async () => {
    const { service, trueFalseRepository } = buildService({
      repoOverrides: { updateQuestion: jest.fn().mockResolvedValue(validQ) },
    });
    await service.updateQuestion("tfq-001", VALID_USER_ID, validQ);
    expect(trueFalseRepository.updateQuestion).toHaveBeenCalledWith(
      "tfq-001",
      VALID_USER_ID,
      expect.objectContaining({ statement: validQ.statement, is_true: true }),
    );
  });

  it("throws ValidationError when statement is empty", async () => {
    const { service } = buildService();
    await expect(
      service.updateQuestion("tfq-001", VALID_USER_ID, {
        ...validQ,
        statement: "",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts is_true field as alias for isTrue", async () => {
    const { service, trueFalseRepository } = buildService({
      repoOverrides: { updateQuestion: jest.fn().mockResolvedValue({}) },
    });
    await service.updateQuestion("tfq-001", VALID_USER_ID, {
      statement: "La luna es un planeta.",
      is_true: false,
    });
    expect(trueFalseRepository.updateQuestion).toHaveBeenCalledTimes(1);
  });
});

// ── deleteQuestion ────────────────────────────────────────────────────────────

describe("TrueFalseService.deleteQuestion()", () => {
  it("delegates to trueFalseRepository.deleteQuestion", async () => {
    const { service, trueFalseRepository } = buildService({
      repoOverrides: { deleteQuestion: jest.fn().mockResolvedValue(true) },
    });
    await service.deleteQuestion("tfq-001", VALID_USER_ID);
    expect(trueFalseRepository.deleteQuestion).toHaveBeenCalledWith(
      "tfq-001",
      VALID_USER_ID,
    );
  });
});
