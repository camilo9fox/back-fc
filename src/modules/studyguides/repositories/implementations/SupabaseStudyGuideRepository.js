const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const IStudyGuideRepository = require("../interfaces/IStudyGuideRepository");
const { NotFoundError } = require("../../../../shared/errors/AppError");

class SupabaseStudyGuideRepository extends IStudyGuideRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  async create(data) {
    const { data: row, error } = await this.supabase
      .from("study_guides")
      .insert([
        {
          user_id: data.userId,
          category_id: data.categoryId,
          title: data.title,
          content: data.content,
        },
      ])
      .select("*, categories(id, title)")
      .single();

    if (error) throw new Error(`Error creating study guide: ${error.message}`);
    return this._normalize(row);
  }

  async findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    let query = this.supabase
      .from("study_guides")
      .select("*, categories(id, title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (options.categoryId) query = query.eq("category_id", options.categoryId);

    const { data, error } = await query;
    if (error) throw new Error(`Error fetching study guides: ${error.message}`);
    return (data || []).map(this._normalize);
  }

  async findById(id, userId) {
    const { data, error } = await this.supabase
      .from("study_guides")
      .select("*, categories(id, title)")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;
    return this._normalize(data);
  }

  async delete(id, userId) {
    const guide = await this.findById(id, userId);
    if (!guide) throw new NotFoundError("Guía de estudio no encontrada.");

    const { error } = await this.supabase
      .from("study_guides")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(`Error deleting study guide: ${error.message}`);
  }

  _normalize(row) {
    return {
      id: row.id,
      userId: row.user_id,
      categoryId: row.category_id,
      category: row.categories || null,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = SupabaseStudyGuideRepository;
