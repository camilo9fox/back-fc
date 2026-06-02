class ISupportTicketRepository {
  /** @param {{userId: string, categoryId: string, subject: string, message: string, status: string}} */
  async createSupportTicket({ userId, categoryId, subject, message, status }) {
    throw new Error("Method not implemented");
  }
  /** @param {string} userId @param {{ limit?: number, offset?: number, categoryId?: string }} options */
  async getSupportTicketsByUser(userId, options) {
    throw new Error("Method not implemented");
  }
  /** @param {string} id @param {string} userId */
  async getSupportTicketById(id, userId) {
    throw new Error("Method not implemented");
  }
  /** @param {string} id @param {string} userId @param {{}} updates */
  async updateSupportTicket(id, userId, updates) {
    throw new Error("Method not implemented");
  }
  /** @param {string} id @param {string} userId */
  async deleteSupportTicket(id, userId) {
    throw new Error("Method not implemented");
  }
  async getSupportTicketCategories() {
    throw new Error("Method not implemented");
  }
}

module.exports = ISupportTicketRepository;
