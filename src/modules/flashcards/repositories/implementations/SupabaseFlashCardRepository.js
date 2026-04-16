const { createClient } = require("@supabase/supabase-js");
const IFlashCardRepository = require("../interfaces/IFlashCardRepository");
const config = require("../../../../shared/config/config");

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
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Supabase create error:", error);
        throw new Error(`Error creating flashcard: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("SupabaseFlashCardRepository.create error:", error);
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
      }));

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(flashcardsToInsert).select(`
          *,
          categories (
            id,
            title,
            description
          )
        `);

      if (error) {
        console.error("Supabase createMany error:", error);
        throw new Error(`Error creating flashcards: ${error.message}`);
      }

      return (data || []).map(this._normalize);
    } catch (error) {
      console.error("SupabaseFlashCardRepository.createMany error:", error);
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
        console.error("Supabase findById error:", error);
        throw new Error(`Error finding flashcard: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      console.error("SupabaseFlashCardRepository.findById error:", error);
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
        console.error("Supabase findAll error:", error);
        throw new Error(`Error finding flashcards: ${error.message}`);
      }

      return (data || []).map(this._normalize);
    } catch (error) {
      console.error("SupabaseFlashCardRepository.findAll error:", error);
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
    const { categories, ...rest } = card;
    return { ...rest, category: categories ?? null };
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
        console.error("Supabase update error:", error);
        throw new Error(`Error updating flashcard: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      console.error("SupabaseFlashCardRepository.update error:", error);
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
        console.error("Supabase delete error:", error);
        throw new Error(`Error deleting flashcard: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error("SupabaseFlashCardRepository.delete error:", error);
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
        console.error("Supabase count error:", error);
        throw new Error(`Error counting flashcards: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      console.error("SupabaseFlashCardRepository.count error:", error);
      throw error;
    }
  }
}

module.exports = SupabaseFlashCardRepository;
