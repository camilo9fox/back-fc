const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const logger = require("../../../../shared/config/logger");
const ISupportTicketRepository = require("../interfaces/ISupportTicketRepository");
const { NotFoundError } = require("../../../../shared/errors/AppError");

class SupabaseSupportTicketRepository extends ISupportTicketRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  _normalize(row) {
    if (!row) return null;
    const { user_id, category_id, created_at, updated_at, ...rest } = row;
    const result = {
      ...rest,
      userId: user_id,
      categoryId: category_id,
      createdAt: created_at,
      updatedAt: updated_at,
    };
    if (row.tickets_categories) {
      result.tickets_categories = row.tickets_categories;
    }
    return result;
  }

  async getSupportTicketCategories() {
    const { data, error } = await this.supabase
      .from("tickets_categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      logger.error("Error fetching ticket categories:", error);
      throw new Error(`Error fetching ticket categories: ${error.message}`);
    }
    return data;
  }

  async createSupportTicket({ userId, categoryId, subject, message, status }) {
    const { data: row, error } = await this.supabase
      .from("support_tickets")
      .insert([
        {
          user_id: userId,
          category_id: categoryId,
          subject,
          message,
          status,
        },
      ])
      .select("*, tickets_categories(id, name)")
      .single();

    if (error) {
      logger.error("Error creating support ticket:", error);
      throw new Error(`Error creating support ticket: ${error.message}`);
    }
    return this._normalize(row);
  }

  async getSupportTicketsByUser(userId, options = {}) {
    const { limit = 50, offset = 0, categoryId } = options;

    let query = this.supabase
      .from("support_tickets")
      .select("*, tickets_categories(id, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data: rows, error } = await query;

    if (error) {
      logger.error("Error fetching support tickets:", error);
      throw new Error(`Error fetching support tickets: ${error.message}`);
    }
    return (rows || []).map((row) => this._normalize(row));
  }

  async getSupportTicketById(id, userId) {
    const { data, error } = await this.supabase
      .from("support_tickets")
      .select("*, tickets_categories(id, name)")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      logger.error("Error fetching support ticket:", error);
      throw new Error(`Error fetching support ticket: ${error.message}`);
    }
    return this._normalize(data);
  }

  async updateSupportTicket(id, userId, updates) {
    const allowedFields = {};
    if (updates.subject !== undefined) allowedFields.subject = updates.subject;
    if (updates.message !== undefined) allowedFields.message = updates.message;

    const { data, error } = await this.supabase
      .from("support_tickets")
      .update(allowedFields)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*, tickets_categories(id, name)")
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      logger.error("Error updating support ticket:", error);
      throw new Error(`Error updating support ticket: ${error.message}`);
    }
    return this._normalize(data);
  }

  async deleteSupportTicket(id, userId) {
    const { data, error } = await this.supabase
      .from("support_tickets")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new NotFoundError("Support ticket not found.");
      }
      logger.error("Error deleting support ticket:", error);
      throw new Error(`Error deleting support ticket: ${error.message}`);
    }
    return data;
  }
}

module.exports = SupabaseSupportTicketRepository;
