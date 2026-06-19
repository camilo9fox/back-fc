const { AppError } = require("../../../shared/errors/AppError");
const logger = require("../../../shared/config/logger");

class SupportTicketController {
  constructor(supportTicketService) {
    this.supportTicketService = supportTicketService;
  }

  async createSupportTicket(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { categoryId, subject, message } = req.body;

      const ticket = await this.supportTicketService.createSupportTicket({
        userId,
        categoryId,
        subject,
        message,
      });
      res.status(201).json(ticket);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getSupportTicketsCategories(req, res) {
    try {
      const categories =
        await this.supportTicketService.getSupportTicketCategories();
      res.json({ categories });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getSupportTicketsByUser(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { limit = 50, offset = 0, categoryId } = req.query;
      const options = {
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
      };
      if (categoryId) options.categoryId = categoryId;

      const tickets = await this.supportTicketService.getSupportTicketsByUser(
        userId,
        options,
      );
      res.json({ tickets, pagination: options });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getSupportTicketById(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const ticket = await this.supportTicketService.getSupportTicketById(
        req.params.id,
        userId,
      );
      res.json(ticket);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async updateSupportTicket(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const updatedTicket = await this.supportTicketService.updateSupportTicket(
        req.params.id,
        userId,
        req.body,
      );
      res.json(updatedTicket);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async deleteSupportTicket(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      await this.supportTicketService.deleteSupportTicket(
        req.params.id,
        userId,
      );
      res.json({ message: "Support ticket deleted successfully" });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  _handleError(error, res) {
    logger.error(`SupportTicketController error: ${error.message}`);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = SupportTicketController;
