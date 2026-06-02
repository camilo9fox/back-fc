const {
  ValidationError,
  NotFoundError,
} = require("../../../shared/errors/AppError");

class SupportTicketService {
  constructor(supportTicketRepository) {
    this.supportTicketRepository = supportTicketRepository;
  }

  async createSupportTicket({ userId, categoryId, subject, message }) {
    if (!userId || !categoryId || !subject || !message) {
      throw new ValidationError("Todos los campos son obligatorios.");
    }

    const trimmedSubject = String(subject).trim();
    const trimmedMessage = String(message).trim();

    if (trimmedSubject.length < 5 || trimmedSubject.length > 255) {
      throw new ValidationError(
        "El asunto debe tener entre 5 y 255 caracteres.",
      );
    }

    if (trimmedMessage.length < 10 || trimmedMessage.length > 5000) {
      throw new ValidationError(
        "El mensaje debe tener entre 10 y 5000 caracteres.",
      );
    }

    const ticket = await this.supportTicketRepository.createSupportTicket({
      userId,
      categoryId,
      subject: trimmedSubject,
      message: trimmedMessage,
      status: "open",
    });
    return ticket;
  }

  async getSupportTicketsByUser(userId, options) {
    const tickets = await this.supportTicketRepository.getSupportTicketsByUser(
      userId,
      options,
    );
    return tickets;
  }

  async getSupportTicketById(id, userId) {
    const ticket = await this.supportTicketRepository.getSupportTicketById(
      id,
      userId,
    );
    if (!ticket) {
      throw new NotFoundError("Ticket de soporte no encontrado.");
    }
    return ticket;
  }

  async updateSupportTicket(id, userId, updates) {
    const allowedUpdates = {};
    if (updates.subject !== undefined) {
      const subject = String(updates.subject).trim();
      if (subject.length < 5 || subject.length > 255) {
        throw new ValidationError(
          "El asunto debe tener entre 5 y 255 caracteres.",
        );
      }
      allowedUpdates.subject = subject;
    }
    if (updates.message !== undefined) {
      const message = String(updates.message).trim();
      if (message.length < 10 || message.length > 5000) {
        throw new ValidationError(
          "El mensaje debe tener entre 10 y 5000 caracteres.",
        );
      }
      allowedUpdates.message = message;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      throw new ValidationError(
        "No se proporcionaron campos válidos para actualizar.",
      );
    }

    const updatedTicket =
      await this.supportTicketRepository.updateSupportTicket(
        id,
        userId,
        allowedUpdates,
      );

    if (!updatedTicket) {
      throw new NotFoundError(
        "Ticket de soporte no encontrado o acceso denegado.",
      );
    }
    return updatedTicket;
  }

  async deleteSupportTicket(id, userId) {
    await this.supportTicketRepository.deleteSupportTicket(id, userId);
  }

  async getSupportTicketCategories() {
    const categories =
      await this.supportTicketRepository.getSupportTicketCategories();
    return categories;
  }
}

module.exports = SupportTicketService;
