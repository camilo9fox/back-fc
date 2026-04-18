const { createClient } = require("@supabase/supabase-js");
const IStatsRepository = require("../interfaces/IStatsRepository");
const config = require("../../../../shared/config/config");

/**
 * Supabase implementation of the stats repository.
 * Uses parallel COUNT queries for efficiency — no JOINs or aggregation views needed.
 * Single Responsibility: only database read operations for statistics.
 */
class SupabaseStatsRepository extends IStatsRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  async getUserStats(userId) {
    const [categories, flashcards, quizzes, trueFalseSets, studyGuides] =
      await Promise.all([
        this._count("categories", userId),
        this._count("flashcards", userId),
        this._count("quizzes", userId),
        this._count("true_false_sets", userId),
        this._count("study_guides", userId),
      ]);

    return { categories, flashcards, quizzes, trueFalseSets, studyGuides };
  }

  async getCategoryBreakdown(userId) {
    const { data: categories, error } = await this.supabase
      .from("categories")
      .select("id, title")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Error fetching categories for breakdown: ${error.message}`,
      );
    }

    if (!categories || categories.length === 0) return [];

    const breakdown = await Promise.all(
      categories.map((cat) => this._buildCategoryRow(cat, userId)),
    );

    return breakdown;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  async _buildCategoryRow(category, userId) {
    const [flashcards, quizzes, trueFalseSets, studyGuides] = await Promise.all(
      [
        this._countByCategory("flashcards", userId, category.id),
        this._countByCategory("quizzes", userId, category.id),
        this._countByCategory("true_false_sets", userId, category.id),
        this._countByCategory("study_guides", userId, category.id),
      ],
    );

    return {
      id: category.id,
      title: category.title,
      flashcards,
      quizzes,
      trueFalseSets,
      studyGuides,
      total: flashcards + quizzes + trueFalseSets + studyGuides,
    };
  }

  async _count(table, userId) {
    const { count, error } = await this.supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Error counting ${table}: ${error.message}`);
    }

    return count ?? 0;
  }

  async _countByCategory(table, userId, categoryId) {
    const { count, error } = await this.supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("category_id", categoryId);

    if (error) {
      throw new Error(`Error counting ${table} by category: ${error.message}`);
    }

    return count ?? 0;
  }
}

module.exports = SupabaseStatsRepository;
