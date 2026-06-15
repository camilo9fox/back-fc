const { createClient } = require("@supabase/supabase-js");
const IFlashCardRepository = require("../interfaces/IFlashCardRepository");
const config = require("../../../../shared/config/config");
const logger = require("../../../../shared/config/logger");

/**
 * Supabase implementation of FlashCard repository
 * Handles all database operations for flashcards using Supabase
 * Follows Single Responsibility Principle - only database operations
 */
class SupabaseFlashCardRepository extends IFlashCardRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
    this.tableName = "flashcards";
  }

  /**
   * Creates a new flashcard in the database
   * @param {Object} flashCard - FlashCard data
   * @param {string} flashCard.question
   * @param {string} flashCard.answer
   * @param {Array<string>} flashCard.options
   * @param {string} flashCard.source - 'ai' or 'manual'
   * @param {string} flashCard.userId - User ID (required)
   * @returns {Promise<Object>} Created flashcard with ID and timestamps
   */
  async create(flashCard) {
    try {
      if (!flashCard.userId) {
        throw new Error("User ID is required to create flashcard");
      }

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert([
          {
            question: flashCard.question,
            answer: flashCard.answer,
            source: flashCard.source || "manual",
            user_id: flashCard.userId,
            category_id: flashCard.categoryId,
            set_id: flashCard.setId || null,
          },
        ])
        .select()
        .single();

      if (error) {
        logger.error("Supabase create error:", error);
        throw new Error(`Error creating flashcard: ${error.message}`);
      }

      return data;
    } catch (error) {
      logger.error("SupabaseFlashCardRepository.create error:", error);
      throw error;
    }
  }

  /**
   * Creates multiple flashcards in the database
   * @param {Array<Object>} flashCards - Array of flashcard data
   * @param {string} userId - User ID (required for all flashcards)
   * @returns {Promise<Array<Object>>} Created flashcards with IDs and timestamps
   */
  async createMany(flashCards, userId) {
    try {
      if (!userId) {
        throw new Error("User ID is required to create flashcards");
      }

      const flashcardsToInsert = flashCards.map((card) => ({
        question: card.question,
        answer: card.answer,
        source: card.source || "manual",
        user_id: userId,
        category_id: card.categoryId,
        set_id: card.setId || null,
      }));

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(flashcardsToInsert).select(`
          *,
          categories (
            id,
            title,
            description
          ),
          flashcard_sets (
            id,
            title
          )
        `);

      if (error) {
        logger.error("Supabase createMany error:", error);
        throw new Error(`Error creating flashcards: ${error.message}`);
      }

      return (data || []).map(this._normalize);
    } catch (error) {
      logger.error("SupabaseFlashCardRepository.createMany error:", error);
      throw error;
    }
  }

  /**
   * Retrieves a flashcard by ID and optionally user ID
   * @param {string} id - FlashCard ID
   * @param {string} [userId] - Optional user ID to scope query
   * @returns {Promise<Object|null>} FlashCard data or null if not found
   */
  async findById(id, userId) {
    try {
      let query = this.supabase.from(this.tableName).select("*").eq("id", id);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query.single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = not found
        logger.error("Supabase findById error:", error);
        throw new Error(`Error finding flashcard: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      logger.error("SupabaseFlashCardRepository.findById error:", error);
      throw error;
    }
  }

  /**
   * Retrieves all flashcards with optional filtering
   * @param {Object} filters - Optional filters
   * @param {string} filters.userId - Filter by user ID (required for authenticated access)
   * @param {string} filters.source - Filter by source ('ai' or 'manual')
   * @param {number} filters.limit - Limit number of results
   * @param {number} filters.offset - Offset for pagination
   * @returns {Promise<Array<Object>>} Array of flashcards
   */
  async findAll(filters = {}) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select(
          `
          *,
          categories (
            id,
            title,
            description
          ),
          flashcard_sets (
            id,
            title
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (filters.userId) {
        query = query.eq("user_id", filters.userId);
      }

      if (filters.source) {
        query = query.eq("source", filters.source);
      }

      if (filters.categoryId) {
        query = query.eq("category_id", filters.categoryId);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit || 10) - 1,
        );
      }

      const { data, error } = await query;

      if (error) {
        logger.error("Supabase findAll error:", error);
        throw new Error(`Error finding flashcards: ${error.message}`);
      }

      return (data || []).map(this._normalize);
    } catch (error) {
      logger.error("SupabaseFlashCardRepository.findAll error:", error);
      throw error;
    }
  }

  /**
   * Normalizes Supabase join field from 'categories' to 'category'
   * @param {Object} card
   * @returns {Object}
   */
  _normalize(card) {
    if (!card) return card;
    const { categories, flashcard_sets, ...rest } = card;
    return { ...rest, category: categories ?? null, set: flashcard_sets ?? null };
  }

  /**
   * Updates a flashcard by ID
   * @param {string} id - FlashCard ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated flashcard or null if not found
   */
  async update(id, updates) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Supabase update error:", error);
        throw new Error(`Error updating flashcard: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      logger.error("SupabaseFlashCardRepository.update error:", error);
      throw error;
    }
  }

  /**
   * Toggles is_public for all flashcards in a category owned by userId.
   * @param {string} categoryId
   * @param {string} userId
   * @param {boolean} isPublic
   * @returns {Promise<{ count: number }>}
   */
  async publishByCategory(categoryId, userId, isPublic) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ is_public: isPublic })
        .eq("category_id", categoryId)
        .eq("user_id", userId)
        .select("id");

      if (error)
        throw new Error(`Error publishing flashcards: ${error.message}`);
      return { count: (data || []).length, isPublic };
    } catch (error) {
      logger.error(
        "SupabaseFlashCardRepository.publishByCategory error:",
        error,
      );
      throw error;
    }
  }

  /**
   * Deletes a flashcard by ID
   * @param {string} id - FlashCard ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq("id", id);

      if (error) {
        logger.error("Supabase delete error:", error);
        throw new Error(`Error deleting flashcard: ${error.message}`);
      }

      return true;
    } catch (error) {
      logger.error("SupabaseFlashCardRepository.delete error:", error);
      throw error;
    }
  }

  /**
   * Gets the total count of flashcards
   * @param {Object} filters - Optional filters
   * @returns {Promise<number>} Total count
   */
  async count(filters = {}) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select("*", { count: "exact", head: true });

      if (filters.userId) {
        query = query.eq("user_id", filters.userId);
      }

      if (filters.source) {
        query = query.eq("source", filters.source);
      }

      const { count, error } = await query;

      if (error) {
        logger.error("Supabase count error:", error);
        throw new Error(`Error counting flashcards: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      logger.error("SupabaseFlashCardRepository.count error:", error);
      throw error;
    }
  }

  // ── Flashcard Set methods ────────────────────────────────────────────────

  async createSet({ userId, categoryId, title, description, cards }) {
    const { data: set, error: setErr } = await this.supabase
      .from("flashcard_sets")
      .insert({ user_id: userId, category_id: categoryId, title, description })
      .select()
      .single();

    if (setErr) throw new Error(`Error creating set: ${setErr.message}`);

    if (cards && cards.length > 0) {
      const rows = cards.map((c) => ({
        question: c.question,
        answer: c.answer,
        source: c.source || "ai",
        user_id: userId,
        category_id: categoryId,
        set_id: set.id,
      }));
      await this.supabase.from(this.tableName).insert(rows);
    }

    return this.findSetById(set.id, userId);
  }

  async findAllSets(userId, options = {}) {
    let query = this.supabase
      .from("flashcard_sets")
      .select(`*, categories(id,title,description)`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (options.categoryId) query = query.eq("category_id", options.categoryId);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) throw new Error(`Error finding sets: ${error.message}`);

    return (data || []).map((s) => this._normalizeSet(s));
  }

  async findSetById(id, userId) {
    const { data: set, error: setErr } = await this.supabase
      .from("flashcard_sets")
      .select(`*, categories(id,title,description)`)
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (setErr && setErr.code !== "PGRST116") throw new Error(`Error finding set: ${setErr.message}`);
    if (!set) return null;

    const { data: cards } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("set_id", id)
      .order("created_at");

    return this._normalizeSet({ ...set, flashcards: cards || [] });
  }

  async updateSet(id, userId, updates) {
    const fields = {};
    if (updates.title !== undefined) fields.title = updates.title;
    if (updates.description !== undefined) fields.description = updates.description;

    const { error } = await this.supabase
      .from("flashcard_sets")
      .update(fields)
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(`Error updating set: ${error.message}`);
    return this.findSetById(id, userId);
  }

  async deleteSet(id, userId) {
    const { error } = await this.supabase
      .from("flashcard_sets")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(`Error deleting set: ${error.message}`);
    return true;
  }

  async publishSet(id, userId, isPublic) {
    const { error } = await this.supabase
      .from("flashcard_sets")
      .update({ is_public: isPublic })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(`Error publishing set: ${error.message}`);

    // Also publish all flashcards in the set
    await this.supabase
      .from(this.tableName)
      .update({ is_public: isPublic })
      .eq("set_id", id);

    return { isPublic };
  }

  _normalizeSet(set) {
    if (!set) return set;
    const { categories, flashcards, ...rest } = set;
    const category = categories ?? null;
    const setInfo = { id: rest.id, title: rest.title };
    return {
      ...rest,
      category,
      cards: (flashcards || []).map((c) => ({
        id: c.id,
        question: c.question,
        answer: c.answer,
        source: c.source,
        categoryId: c.category_id,
        category,
        set: setInfo,
        createdAt: c.created_at,
      })),
    };
  }
}

module.exports = SupabaseFlashCardRepository;
