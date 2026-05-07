/**
 * Integration tests â€” Quiz routes
 * Endpoints covered:
 *   POST /api/quizzes
 *   GET  /api/quizzes
 *   GET  /api/quizzes/:id
 *   PUT  /api/quizzes/:id
 *   DELETE /api/quizzes/:id
 */

process.env.JWT_SECRET = "test-secret-key";
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.GROQ_API_KEY = "test-groq-key";

const request = require("supertest");
const jwt = require("jsonwebtoken");

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
  savedQuiz,
} = require("../../__mocks__/fixtures");

function makeToken(userId = VALID_USER_ID) {
  return jwt.sign(
    { userId, email: "test@flashy.app" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

describe("Quiz routes â€” integration", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe("POST /api/quizzes", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).post("/api/quizzes").send({});
      expect(res.status).toBe(401);
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ categoryId: VALID_CATEGORY_ID, questions: [] });
      expect(res.status).toBe(400);
    });

    it("returns 400 when questions array is empty", async () => {
      const res = await request(app)
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ title: "Test", categoryId: VALID_CATEGORY_ID, questions: [] });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/quizzes", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get("/api/quizzes");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/quizzes/:id", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get(`/api/quizzes/${savedQuiz.id}`);
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/quizzes/:id", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).delete(`/api/quizzes/${savedQuiz.id}`);
      expect(res.status).toBe(401);
    });
  });
});
