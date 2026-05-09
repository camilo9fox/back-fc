/**
 * Unit tests — CategoryService
 */

const CategoryService = require("../../../src/modules/categories/services/CategoryService");
const {
  ValidationError,
  NotFoundError,
} = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validCategory,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(repoOverrides = {}) {
  const categoryRepository = {
    create: jest.fn().mockResolvedValue(validCategory),
    findById: jest.fn().mockResolvedValue(validCategory),
    findAll: jest.fn().mockResolvedValue([validCategory]),
    update: jest.fn().mockResolvedValue(validCategory),
    delete: jest.fn().mockResolvedValue(true),
    ...repoOverrides,
  };
  return {
    service: new CategoryService(categoryRepository),
    categoryRepository,
  };
}

// ── createCategory ────────────────────────────────────────────────────────────

describe("CategoryService.createCategory()", () => {
  it("creates and returns a category", async () => {
    const { service } = buildService();
    const result = await service.createCategory({
      title: "Biología",
      description: "Ciencias naturales",
      userId: VALID_USER_ID,
    });
    expect(result).toBeDefined();
  });

  it("throws ValidationError when title is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createCategory({ title: "", userId: VALID_USER_ID }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createCategory({ title: "Biología", userId: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when title exceeds 255 characters", async () => {
    const { service } = buildService();
    await expect(
      service.createCategory({ title: "a".repeat(256), userId: VALID_USER_ID }),
    ).rejects.toThrow(ValidationError);
  });
});

// ── getCategoryById ───────────────────────────────────────────────────────────

describe("CategoryService.getCategoryById()", () => {
  it("returns the category when found", async () => {
    const { service } = buildService();
    const result = await service.getCategoryById(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
    );
    expect(result).toBeDefined();
  });

  it("returns null when category does not exist", async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(null),
    });
    const result = await service.getCategoryById("nonexistent", VALID_USER_ID);
    expect(result).toBeNull();
  });
});

// ── getCategories ─────────────────────────────────────────────────────────────

describe("CategoryService.getCategories()", () => {
  it("returns an array of categories for the user", async () => {
    const { service, categoryRepository } = buildService();
    const result = await service.getCategories(VALID_USER_ID, {
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(categoryRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: VALID_USER_ID, limit: 10, offset: 0 }),
    );
  });

  it("uses default limit=50 and offset=0 when not specified", async () => {
    const { service, categoryRepository } = buildService();
    await service.getCategories(VALID_USER_ID);
    expect(categoryRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });
});

// ── updateCategory ────────────────────────────────────────────────────────────

describe("CategoryService.updateCategory()", () => {
  it("updates and returns the category", async () => {
    const { service } = buildService();
    const result = await service.updateCategory(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
      {
        title: "Nuevo título",
      },
    );
    expect(result).toBeDefined();
  });

  it("throws ValidationError when title is empty string", async () => {
    const { service } = buildService();
    await expect(
      service.updateCategory(VALID_CATEGORY_ID, VALID_USER_ID, { title: "" }),
    ).rejects.toThrow(ValidationError);
  });
});

// ── deleteCategory ────────────────────────────────────────────────────────────

describe("CategoryService.deleteCategory()", () => {
  it("delegates to repository and returns the result", async () => {
    const { service, categoryRepository } = buildService();
    const result = await service.deleteCategory(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
    );
    expect(categoryRepository.delete).toHaveBeenCalledWith(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
    );
    expect(result).toBe(true);
  });
});

// ── getDefaultCategory ────────────────────────────────────────────────────────

describe("CategoryService.getDefaultCategory()", () => {
  it("returns the General category when it exists", async () => {
    const { service } = buildService({
      findAll: jest
        .fn()
        .mockResolvedValue([{ ...validCategory, title: "General" }]),
    });
    const result = await service.getDefaultCategory(VALID_USER_ID);
    expect(result).toBeDefined();
  });

  it("throws NotFoundError when General category does not exist", async () => {
    const { service } = buildService({
      findAll: jest.fn().mockResolvedValue([]),
    });
    await expect(service.getDefaultCategory(VALID_USER_ID)).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ── publish ───────────────────────────────────────────────────────────────────

describe("CategoryService.publish()", () => {
  it("publishes a non-empty category (isPublic=true)", async () => {
    const { service, categoryRepository } = buildService({
      countContent: jest.fn().mockResolvedValue(3),
      publish: jest
        .fn()
        .mockResolvedValue({ id: VALID_CATEGORY_ID, is_public: true }),
    });
    const result = await service.publish(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
      true,
    );
    expect(categoryRepository.countContent).toHaveBeenCalledWith(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
    );
    expect(result.is_public).toBe(true);
  });

  it("throws ValidationError when trying to publish an empty category", async () => {
    const { service } = buildService({
      countContent: jest.fn().mockResolvedValue(0),
      publish: jest.fn(),
    });
    await expect(
      service.publish(VALID_CATEGORY_ID, VALID_USER_ID, true),
    ).rejects.toThrow(ValidationError);
  });

  it("skips countContent check when unpublishing (isPublic=false)", async () => {
    const { service, categoryRepository } = buildService({
      countContent: jest.fn(),
      publish: jest
        .fn()
        .mockResolvedValue({ id: VALID_CATEGORY_ID, is_public: false }),
    });
    await service.publish(VALID_CATEGORY_ID, VALID_USER_ID, false);
    expect(categoryRepository.countContent).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when publish returns null", async () => {
    const { service } = buildService({
      countContent: jest.fn().mockResolvedValue(2),
      publish: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.publish(VALID_CATEGORY_ID, VALID_USER_ID, true),
    ).rejects.toThrow(NotFoundError);
  });
});
