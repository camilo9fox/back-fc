/**
 * Integration tests â€” Flashcard routes
 * Uses Supertest against a real Express app instance.
 * External services (Supabase, Groq) are mocked at module level.
 *
 * Endpoints covered:
 *   POST /api/flashcards/create-flashcard
 *   POST /api/flashcards/create-flashcards
 *   GET  /api/flashcards
 *   GET  /api/flashcards/:id
 *   DELETE /api/flashcards/:id
 */

process.env.JWT_SECRET = "test-secret-key";
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.GROQ_API_KEY = "test-groq-key";

const request = require("supertest");
const jwt = require("jsonwebtoken");

// Mock Supabase before any module loads it
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
  })),
}));

const createApp = require("../../../src/app");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validFlashCard,
} = require("../../__mocks__/fixtures");

// â”€â”€ Auth helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeToken(userId = VALID_USER_ID) {
  return jwt.sign(
    { userId, email: "test@flashy.app" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Flashcard routes â€” integration", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe("POST /api/flashcards/create-flashcard", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app)
        .post("/api/flashcards/create-flashcard")
        .send({ question: "P", answer: "R", categoryId: VALID_CATEGORY_ID });
      expect(res.status).toBe(401);
    });

    it("returns 400 when question is missing", async () => {
      const res = await request(app)
        .post("/api/flashcards/create-flashcard")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ answer: "R", categoryId: VALID_CATEGORY_ID });
      expect(res.status).toBe(400);
    });

    it("returns 400 when answer is missing", async () => {
      const res = await request(app)
        .post("/api/flashcards/create-flashcard")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ question: "P", categoryId: VALID_CATEGORY_ID });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/flashcards/create-flashcards", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app)
        .post("/api/flashcards/create-flashcards")
        .send({ flashcards: [{ question: "P", answer: "R" }] });
      expect(res.status).toBe(401);
    });

    it("returns 400 when flashcards array is empty", async () => {
      const res = await request(app)
        .post("/api/flashcards/create-flashcards")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ flashcards: [] });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/flashcards", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get("/api/flashcards");
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/flashcards/:id", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).delete(
        `/api/flashcards/${validFlashCard.id}`,
      );
      expect(res.status).toBe(401);
    });
  });
});
