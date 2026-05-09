/**
 * Unit tests — LibraryService
 */

const LibraryService = require("../../../src/modules/library/services/LibraryService");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(repoOverrides = {}) {
  const libraryRepository = {
    getPublicCategories: jest
      .fn()
      .mockResolvedValue([{ id: VALID_CATEGORY_ID }]),
    forkCategory: jest.fn().mockResolvedValue({ id: "cat-forked-001" }),
    getCategoryPreview: jest
      .fn()
      .mockResolvedValue({ id: VALID_CATEGORY_ID, items: [] }),
    ...repoOverrides,
  };
  return { service: new LibraryService(libraryRepository), libraryRepository };
}

// ── getPublicCategories ───────────────────────────────────────────────────────

describe("LibraryService.getPublicCategories()", () => {
  it("delegates to repository and returns the result", async () => {
    const { service, libraryRepository } = buildService();
    const result = await service.getPublicCategories({ limit: 10 });
    expect(libraryRepository.getPublicCategories).toHaveBeenCalledWith({
      limit: 10,
    });
    expect(result).toEqual([{ id: VALID_CATEGORY_ID }]);
  });
});

// ── forkCategory ──────────────────────────────────────────────────────────────

describe("LibraryService.forkCategory()", () => {
  it("delegates to repository with sourceCategoryId and targetUserId", async () => {
    const { service, libraryRepository } = buildService();
    const result = await service.forkCategory(VALID_CATEGORY_ID, VALID_USER_ID);
    expect(libraryRepository.forkCategory).toHaveBeenCalledWith(
      VALID_CATEGORY_ID,
      VALID_USER_ID,
    );
    expect(result.id).toBe("cat-forked-001");
  });
});

// ── getCategoryPreview ────────────────────────────────────────────────────────

describe("LibraryService.getCategoryPreview()", () => {
  it("delegates to repository and returns the preview", async () => {
    const { service, libraryRepository } = buildService();
    const result = await service.getCategoryPreview(VALID_CATEGORY_ID);
    expect(libraryRepository.getCategoryPreview).toHaveBeenCalledWith(
      VALID_CATEGORY_ID,
    );
    expect(result.id).toBe(VALID_CATEGORY_ID);
  });
});
