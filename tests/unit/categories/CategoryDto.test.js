/**
 * Unit tests — CategoryDto
 * Covers validateCreate, validateUpdate and toResponse with all edge cases.
 */

const CategoryDto = require("../../../src/modules/categories/dtos/CategoryDto");
const { ValidationError } = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

// ── validateCreate ────────────────────────────────────────────────────────────

describe("CategoryDto.validateCreate()", () => {
  it("returns cleaned object for valid input", () => {
    const result = CategoryDto.validateCreate({
      title: "  Biología  ",
      description: "Notas del curso",
      userId: VALID_USER_ID,
    });
    expect(result.title).toBe("Biología");
    expect(result.description).toBe("Notas del curso");
    expect(result.userId).toBe(VALID_USER_ID);
  });

  it("sets description to null when omitted", () => {
    const result = CategoryDto.validateCreate({
      title: "Física",
      userId: VALID_USER_ID,
    });
    expect(result.description).toBeNull();
  });

  it("throws ValidationError when data is null", () => {
    expect(() => CategoryDto.validateCreate(null)).toThrow(ValidationError);
  });

  it("throws ValidationError when data is a string (non-object)", () => {
    expect(() => CategoryDto.validateCreate("string")).toThrow(ValidationError);
  });

  it("throws ValidationError when title is empty", () => {
    expect(() =>
      CategoryDto.validateCreate({ title: "   ", userId: VALID_USER_ID }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when title exceeds 255 characters", () => {
    expect(() =>
      CategoryDto.validateCreate({
        title: "t".repeat(256),
        userId: VALID_USER_ID,
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when userId is missing", () => {
    expect(() => CategoryDto.validateCreate({ title: "Bio" })).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError when userId is a number (not a string)", () => {
    expect(() =>
      CategoryDto.validateCreate({ title: "Bio", userId: 123 }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when description is not a string", () => {
    expect(() =>
      CategoryDto.validateCreate({
        title: "Bio",
        userId: VALID_USER_ID,
        description: 42,
      }),
    ).toThrow(ValidationError);
  });
});

// ── validateUpdate ────────────────────────────────────────────────────────────

describe("CategoryDto.validateUpdate()", () => {
  it("returns update object with trimmed title", () => {
    const result = CategoryDto.validateUpdate({ title: "  Química  " });
    expect(result.title).toBe("Química");
  });

  it("accepts description set to null", () => {
    const result = CategoryDto.validateUpdate({ description: null });
    expect(result.description).toBeNull();
  });

  it("trims description when provided", () => {
    const result = CategoryDto.validateUpdate({ description: "  desc  " });
    expect(result.description).toBe("desc");
  });

  it("throws ValidationError when data is null", () => {
    expect(() => CategoryDto.validateUpdate(null)).toThrow(ValidationError);
  });

  it("throws ValidationError when data is a non-object", () => {
    expect(() => CategoryDto.validateUpdate("text")).toThrow(ValidationError);
  });

  it("throws ValidationError when title is empty string", () => {
    expect(() => CategoryDto.validateUpdate({ title: "" })).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError when title exceeds 255 characters", () => {
    expect(() =>
      CategoryDto.validateUpdate({ title: "t".repeat(256) }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when description is a number (not string or null)", () => {
    expect(() => CategoryDto.validateUpdate({ description: 99 })).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError when no fields are provided", () => {
    expect(() => CategoryDto.validateUpdate({})).toThrow(ValidationError);
  });
});

// ── toResponse ────────────────────────────────────────────────────────────────

describe("CategoryDto.toResponse()", () => {
  it("returns null for null input", () => {
    expect(CategoryDto.toResponse(null)).toBeNull();
  });

  it("maps database fields to API shape", () => {
    const raw = {
      id: VALID_CATEGORY_ID,
      title: "Biología",
      description: "Notas",
      user_id: VALID_USER_ID,
      is_public: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };
    const result = CategoryDto.toResponse(raw);
    expect(result.id).toBe(VALID_CATEGORY_ID);
    expect(result.userId).toBe(VALID_USER_ID);
    expect(result.isPublic).toBe(true);
  });

  it("defaults isPublic to false when is_public is null/undefined", () => {
    const raw = { id: "1", title: "T", user_id: VALID_USER_ID };
    const result = CategoryDto.toResponse(raw);
    expect(result.isPublic).toBe(false);
  });
});
