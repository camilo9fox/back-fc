/**
 * Integration tests — Support Ticket routes
 * Uses Supertest against a real Express app instance.
 * External services (Supabase, Groq) are mocked at module level.
 *
 * Endpoints covered:
 *   POST   /api/support-tickets
 *   GET    /api/support-tickets
 *   GET    /api/support-tickets/categories
 *   GET    /api/support-tickets/:id
 *   PUT    /api/support-tickets/:id
 *   DELETE /api/support-tickets/:id
 */

process.env.JWT_SECRET = "test-secret-key-with-sufficient-length-32";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key-with-sufficient-length-32";
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.GROQ_API_KEY = "test-groq-key";

const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockSupabaseInner = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabaseInner),
}));

const createApp = require("../../../src/app");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

function makeToken(userId = VALID_USER_ID) {
  return jwt.sign(
    { userId, email: "test@flashy.app" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

describe("Support Ticket routes — integration", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe("POST /api/support-tickets", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app)
        .post("/api/support-tickets")
        .send({
          categoryId: VALID_CATEGORY_ID,
          subject: "Problema de acceso",
          message: "No puedo iniciar sesión con mi cuenta de usuario.",
        });
      expect(res.status).toBe(401);
    });

    it("returns 201 when valid data is provided", async () => {
      mockSupabaseInner.single.mockResolvedValueOnce({
        data: {
          id: "ticket-001",
          user_id: VALID_USER_ID,
          category_id: VALID_CATEGORY_ID,
          subject: "Problema de acceso",
          message: "No puedo iniciar sesión con mi cuenta.",
          status: "open",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          tickets_categories: { id: VALID_CATEGORY_ID, name: "Problema técnico" },
        },
        error: null,
      });
      const res = await request(app)
        .post("/api/support-tickets")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({
          categoryId: VALID_CATEGORY_ID,
          subject: "Problema de acceso",
          message: "No puedo iniciar sesión con mi cuenta de usuario.",
        });
      expect(res.status).toBe(201);
    });
  });

  describe("GET /api/support-tickets", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get("/api/support-tickets");
      expect(res.status).toBe(401);
    });

    it("returns 200 with tickets array", async () => {
      mockSupabaseInner.range.mockReturnValueOnce(
        Promise.resolve({ data: [], error: null }),
      );
      const res = await request(app)
        .get("/api/support-tickets")
        .set("Authorization", `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("tickets");
      expect(res.body).toHaveProperty("pagination");
    });
  });

  describe("GET /api/support-tickets/categories", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get("/api/support-tickets/categories");
      expect(res.status).toBe(401);
    });

    it("returns 200 with categories array", async () => {
      mockSupabaseInner.order.mockReturnValueOnce(
        Promise.resolve({
          data: [
            { id: "cat-1", name: "Problema técnico" },
            { id: "cat-2", name: "Otro" },
          ],
          error: null,
        }),
      );
      const res = await request(app)
        .get("/api/support-tickets/categories")
        .set("Authorization", `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("categories");
    });
  });

  describe("GET /api/support-tickets/:id", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get(
        "/api/support-tickets/some-ticket-id",
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 when ticket is found", async () => {
      mockSupabaseInner.single.mockResolvedValueOnce({
        data: {
          id: "ticket-001",
          user_id: VALID_USER_ID,
          category_id: VALID_CATEGORY_ID,
          subject: "Problema de acceso",
          message: "No puedo iniciar sesión.",
          status: "open",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          tickets_categories: { id: VALID_CATEGORY_ID, name: "Problema técnico" },
        },
        error: null,
      });
      const res = await request(app)
        .get("/api/support-tickets/some-ticket-id")
        .set("Authorization", `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
    });
  });

  describe("PUT /api/support-tickets/:id", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app)
        .put("/api/support-tickets/some-ticket-id")
        .send({ subject: "Updated" });
      expect(res.status).toBe(401);
    });

    it("returns 200 when update succeeds", async () => {
      mockSupabaseInner.single.mockResolvedValueOnce({
        data: {
          id: "ticket-001",
          user_id: VALID_USER_ID,
          category_id: VALID_CATEGORY_ID,
          subject: "Asunto actualizado",
          message: "Mensaje actualizado.",
          status: "open",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          tickets_categories: { id: VALID_CATEGORY_ID, name: "Problema técnico" },
        },
        error: null,
      });
      const res = await request(app)
        .put("/api/support-tickets/some-ticket-id")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({
          subject: "Asunto actualizado",
          message: "Mensaje actualizado con más detalle.",
        });
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /api/support-tickets/:id", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).delete(
        "/api/support-tickets/some-ticket-id",
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 when delete succeeds", async () => {
      mockSupabaseInner.single.mockResolvedValueOnce({
        data: { id: "ticket-001" },
        error: null,
      });
      const res = await request(app)
        .delete("/api/support-tickets/some-ticket-id")
        .set("Authorization", `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
    });
  });
});
