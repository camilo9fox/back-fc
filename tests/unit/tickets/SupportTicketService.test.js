/**
 * Unit tests — SupportTicketService
 */

const SupportTicketService = require("../../../src/modules/tickets/services/SupportTicketService");
const {
  ValidationError,
  NotFoundError,
} = require("../../../src/shared/errors/AppError");
const {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
} = require("../../__mocks__/fixtures");

const VALID_TICKET_ID = "ticket-001";

function buildService(repoOverrides = {}) {
  const supportTicketRepository = {
    createSupportTicket: jest.fn().mockResolvedValue({
      id: VALID_TICKET_ID,
      userId: VALID_USER_ID,
      categoryId: VALID_CATEGORY_ID,
      subject: "Problema de acceso",
      message: "No puedo iniciar sesión con mi cuenta.",
      status: "open",
    }),
    getSupportTicketsByUser: jest.fn().mockResolvedValue([]),
    getSupportTicketById: jest.fn().mockResolvedValue({
      id: VALID_TICKET_ID,
      userId: VALID_USER_ID,
      categoryId: VALID_CATEGORY_ID,
      subject: "Problema de acceso",
      message: "No puedo iniciar sesión con mi cuenta.",
      status: "open",
    }),
    updateSupportTicket: jest.fn().mockResolvedValue({
      id: VALID_TICKET_ID,
      userId: VALID_USER_ID,
      categoryId: VALID_CATEGORY_ID,
      subject: "Asunto actualizado",
      message: "Mensaje actualizado con más detalle.",
      status: "open",
    }),
    deleteSupportTicket: jest.fn().mockResolvedValue({ id: VALID_TICKET_ID }),
    getSupportTicketCategories: jest.fn().mockResolvedValue([
      { id: "cat-1", name: "Problema técnico" },
      { id: "cat-2", name: "Otro" },
    ]),
    ...repoOverrides,
  };
  return {
    service: new SupportTicketService(supportTicketRepository),
    supportTicketRepository,
  };
}

// ── createSupportTicket ──────────────────────────────────────────────────────────

describe("SupportTicketService.createSupportTicket()", () => {
  it("creates and returns a ticket", async () => {
    const { service } = buildService();
    const result = await service.createSupportTicket({
      userId: VALID_USER_ID,
      categoryId: VALID_CATEGORY_ID,
      subject: "Problema de acceso",
      message: "No puedo iniciar sesión con mi cuenta.",
    });
    expect(result).toBeDefined();
    expect(result.id).toBe(VALID_TICKET_ID);
    expect(result.status).toBe("open");
  });

  it("throws ValidationError when subject is too short", async () => {
    const { service } = buildService();
    await expect(
      service.createSupportTicket({
        userId: VALID_USER_ID,
        categoryId: VALID_CATEGORY_ID,
        subject: "ab",
        message: "Mensaje detallado con suficiente contenido para pasar validación.",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when message is too short", async () => {
    const { service } = buildService();
    await expect(
      service.createSupportTicket({
        userId: VALID_USER_ID,
        categoryId: VALID_CATEGORY_ID,
        subject: "Problema válido",
        message: "corto",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when subject is too long (>255)", async () => {
    const { service } = buildService();
    await expect(
      service.createSupportTicket({
        userId: VALID_USER_ID,
        categoryId: VALID_CATEGORY_ID,
        subject: "a".repeat(256),
        message: "Mensaje válido con suficiente contenido para la validación aquí.",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when message is too long (>5000)", async () => {
    const { service } = buildService();
    await expect(
      service.createSupportTicket({
        userId: VALID_USER_ID,
        categoryId: VALID_CATEGORY_ID,
        subject: "Asunto válido",
        message: "a".repeat(5001),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when userId is missing", async () => {
    const { service } = buildService();
    await expect(
      service.createSupportTicket({
        userId: "",
        categoryId: VALID_CATEGORY_ID,
        subject: "Problema de acceso",
        message: "No puedo iniciar sesión con mi cuenta.",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("trims subject and message", async () => {
    const { service, supportTicketRepository } = buildService();
    await service.createSupportTicket({
      userId: VALID_USER_ID,
      categoryId: VALID_CATEGORY_ID,
      subject: "  Problema de acceso  ",
      message: "  No puedo iniciar sesión con mi cuenta.  ",
    });
    expect(supportTicketRepository.createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Problema de acceso",
        message: "No puedo iniciar sesión con mi cuenta.",
      }),
    );
  });
});

// ── getSupportTicketsByUser ─────────────────────────────────────────────────────

describe("SupportTicketService.getSupportTicketsByUser()", () => {
  it("returns tickets for the user", async () => {
    const existingTickets = [
      { id: "t1", userId: VALID_USER_ID, subject: "Test" },
    ];
    const { service, supportTicketRepository } = buildService({
      getSupportTicketsByUser: jest.fn().mockResolvedValue(existingTickets),
    });
    const result = await service.getSupportTicketsByUser(VALID_USER_ID, {
      limit: 10,
      offset: 0,
    });
    expect(supportTicketRepository.getSupportTicketsByUser).toHaveBeenCalledWith(
      VALID_USER_ID,
      { limit: 10, offset: 0 },
    );
    expect(result).toEqual(existingTickets);
  });
});

// ── getSupportTicketById ────────────────────────────────────────────────────────

describe("SupportTicketService.getSupportTicketById()", () => {
  it("returns the ticket when found", async () => {
    const { service } = buildService();
    const result = await service.getSupportTicketById(
      VALID_TICKET_ID,
      VALID_USER_ID,
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(VALID_TICKET_ID);
  });

  it("throws NotFoundError when ticket does not exist", async () => {
    const { service } = buildService({
      getSupportTicketById: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.getSupportTicketById("nonexistent", VALID_USER_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── updateSupportTicket ─────────────────────────────────────────────────────────

describe("SupportTicketService.updateSupportTicket()", () => {
  it("updates and returns the ticket", async () => {
    const { service } = buildService();
    const result = await service.updateSupportTicket(
      VALID_TICKET_ID,
      VALID_USER_ID,
      { subject: "Asunto actualizado", message: "Mensaje actualizado con más detalle." },
    );
    expect(result).toBeDefined();
    expect(result.subject).toBe("Asunto actualizado");
  });

  it("throws ValidationError when no valid fields are provided", async () => {
    const { service } = buildService();
    await expect(
      service.updateSupportTicket(VALID_TICKET_ID, VALID_USER_ID, {}),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when subject is too short on update", async () => {
    const { service } = buildService();
    await expect(
      service.updateSupportTicket(VALID_TICKET_ID, VALID_USER_ID, {
        subject: "ab",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when ticket does not exist", async () => {
    const { service } = buildService({
      updateSupportTicket: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.updateSupportTicket("nonexistent", VALID_USER_ID, {
        subject: "Asunto válido",
        message: "Mensaje válido con suficiente contenido.",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── deleteSupportTicket ─────────────────────────────────────────────────────────

describe("SupportTicketService.deleteSupportTicket()", () => {
  it("delegates to repository", async () => {
    const { service, supportTicketRepository } = buildService();
    await service.deleteSupportTicket(VALID_TICKET_ID, VALID_USER_ID);
    expect(supportTicketRepository.deleteSupportTicket).toHaveBeenCalledWith(
      VALID_TICKET_ID,
      VALID_USER_ID,
    );
  });
});

// ── getSupportTicketCategories ──────────────────────────────────────────────────

describe("SupportTicketService.getSupportTicketCategories()", () => {
  it("returns categories from repository", async () => {
    const { service, supportTicketRepository } = buildService();
    const result = await service.getSupportTicketCategories();
    expect(supportTicketRepository.getSupportTicketCategories).toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });
});
