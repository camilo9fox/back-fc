const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const logger = require("../../../../shared/config/logger");

/**
 * Repository methods for SM-2 spaced repetition state and flashcard search/export.
 * Uses a separate Supabase client focused on the flashcard_reviews table.
 */
class SpacedRepetitionRepository {
  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  /**
   * Returns cards that are due for review (next_review_at <= now)
   * plus cards never reviewed (next_review_at IS NULL) up to `limit`.
   * @param {string} userId
   * @param {number} limit - max cards to return (default 20)
   * @param {string|null} categoryId - optional filter
   * @returns {Promise<Array>}
   */
  async findDueCards(userId, limit = 20, categoryId = null) {
    const now = new Date().toISOString();

    // Get IDs of cards already reviewed that are due
    let dueQuery = this.supabase
      .from("flashcard_reviews")
      .select("flashcard_id")
      .eq("user_id", userId)
      .lte("next_review_at", now)
      .order("next_review_at", { ascending: true })
      .limit(limit);

    const { data: dueReviews, error: dueErr } = await dueQuery;
    if (dueErr)
      throw new Error(`Error fetching due reviews: ${dueErr.message}`);

    const dueIds = (dueReviews || []).map((r) => r.flashcard_id);

    // Get IDs of cards the user has ever reviewed
    const { data: allReviews, error: allErr } = await this.supabase
      .from("flashcard_reviews")
      .select("flashcard_id")
      .eq("user_id", userId);
    if (allErr)
      throw new Error(`Error fetching all reviews: ${allErr.message}`);
    const reviewedIds = new Set((allReviews || []).map((r) => r.flashcard_id));

    // Pull full card data for due cards
    const cards = [];
    if (dueIds.length > 0) {
      let q = this.supabase
        .from("flashcards")
        .select("*, categories(id, title)")
        .eq("user_id", userId)
        .in("id", dueIds);
      if (categoryId) q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error)
        throw new Error(`Error fetching due flashcards: ${error.message}`);
      cards.push(...(data || []).map(this._normalize));
    }

    // Fill remaining slots with new (never reviewed) cards
    const remaining = limit - cards.length;
    if (remaining > 0) {
      let q = this.supabase
        .from("flashcards")
        .select("*, categories(id, title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(remaining * 3); // over-fetch so we can filter client-side
      if (categoryId) q = q.eq("category_id", categoryId);
      const { data: newCards, error: newErr } = await q;
      if (newErr)
        throw new Error(`Error fetching new flashcards: ${newErr.message}`);
      const newFiltered = (newCards || [])
        .filter((c) => !reviewedIds.has(c.id))
        .slice(0, remaining)
        .map(this._normalize);
      cards.push(...newFiltered);
    }

    return cards;
  }

  /**
   * Returns the current SM-2 state for a (user, flashcard) pair.
   * Returns null if never reviewed.
   */
  async getReview(userId, flashcardId) {
    const { data, error } = await this.supabase
      .from("flashcard_reviews")
      .select("*")
      .eq("user_id", userId)
      .eq("flashcard_id", flashcardId)
      .maybeSingle();
    if (error) throw new Error(`Error fetching review: ${error.message}`);
    return data || null;
  }

  /**
   * Creates or updates the SM-2 state for a (user, flashcard) pair.
   */
  async upsertReview(review) {
    const { data, error } = await this.supabase
      .from("flashcard_reviews")
      .upsert(
        {
          user_id: review.userId,
          flashcard_id: review.flashcardId,
          ease_factor: review.easeFactor,
          interval_days: review.intervalDays,
          repetitions: review.repetitions,
          next_review_at: review.nextReviewAt,
          last_reviewed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,flashcard_id" },
      )
      .select()
      .single();
    if (error) throw new Error(`Error upserting review: ${error.message}`);
    return data;
  }

  /**
   * Returns counts of due, new, and learned cards for a user.
   */
  async getReviewStats(userId) {
    const now = new Date().toISOString();

    const [dueResult, learnedResult, totalResult] = await Promise.all([
      this.supabase
        .from("flashcard_reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("next_review_at", now),
      this.supabase
        .from("flashcard_reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gt("repetitions", 0),
      this.supabase
        .from("flashcards")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    const due = dueResult.count ?? 0;
    const learned = learnedResult.count ?? 0;
    const total = totalResult.count ?? 0;
    const newCards = Math.max(0, total - learned);

    return { due, learned, newCards, total };
  }

  /**
   * Full-text search on question + answer fields (case-insensitive).
   */
  async search(userId, query, categoryId = null, limit = 50) {
    const term = `%${query}%`;
    let q = this.supabase
      .from("flashcards")
      .select("*, categories(id, title)")
      .eq("user_id", userId)
      .or(`question.ilike.${term},answer.ilike.${term}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (categoryId) q = q.eq("category_id", categoryId);
    const { data, error } = await q;
    if (error) throw new Error(`Error searching flashcards: ${error.message}`);
    return (data || []).map(this._normalize);
  }

  /**
   * Returns all flashcards for export (no pagination limit).
   */
  async findAllForExport(userId, categoryId = null) {
    let q = this.supabase
      .from("flashcards")
      .select("*, categories(id, title)")
      .eq("user_id", userId)
      .order("category_id")
      .order("created_at");
    if (categoryId) q = q.eq("category_id", categoryId);
    const { data, error } = await q;
    if (error)
      throw new Error(`Error fetching cards for export: ${error.message}`);
    return (data || []).map(this._normalize);
  }

  _normalize(card) {
    if (!card) return card;
    const { categories, ...rest } = card;
    return { ...rest, category: categories ?? null };
  }
}

module.exports = SpacedRepetitionRepository;
