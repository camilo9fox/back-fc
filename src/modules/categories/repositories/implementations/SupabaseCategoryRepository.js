const { createClient } = require("@supabase/supabase-js");
const ICategoryRepository = require("../interfaces/ICategoryRepository");
const config = require("../../../../shared/config/config");

/**
 * Supabase implementation of Category repository
 * Handles all database operations for categories using Supabase
 * Follows Single Responsibility Principle - only database operations
 */
class SupabaseCategoryRepository extends ICategoryRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
    this.tableName = "categories";
  }

  /**
   * Creates a new category in the database
   * @param {Object} category - Category data
   * @param {string} category.title
   * @param {string} category.description
   * @param {string} category.userId - User ID (required)
   * @returns {Promise<Object>} Created category with ID and timestamps
   */
  async create(category) {
    try {
      if (!category.userId) {
        throw new Error("User ID is required to create category");
      }

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert([
          {
            title: category.title,
            description: category.description,
            user_id: category.userId,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Supabase create category error:", error);
        throw new Error(`Error creating category: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("SupabaseCategoryRepository.create error:", error);
      throw error;
    }
  }

  /**
   * Finds a category by ID
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @returns {Promise<Object|null>} Category data or null if not found
   */
  async findById(id, userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows returned
          return null;
        }
        console.error("Supabase findById error:", error);
        throw new Error(`Error finding category: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("SupabaseCategoryRepository.findById error:", error);
      throw error;
    }
  }

  /**
   * Finds all categories for a user with optional filtering
   * @param {Object} filters - Optional filters
   * @param {string} filters.userId - Filter by user ID (required for security)
   * @param {string} filters.title - Filter by title
   * @param {number} filters.limit - Limit number of results
   * @param {number} filters.offset - Offset for pagination
   * @returns {Promise<Array<Object>>} Array of categories
   */
  async findAll(filters = {}) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select("*")
        .order("created_at", { ascending: false });

      if (filters.userId) {
        query = query.eq("user_id", filters.userId);
      }

      if (filters.title) {
        query = query.eq("title", filters.title);
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
        console.error("Supabase findAll categories error:", error);
        throw new Error(`Error finding categories: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error("SupabaseCategoryRepository.findAll error:", error);
      throw error;
    }
  }

  /**
   * Updates a category by ID
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated category or null if not found
   */
  async update(id, userId, updates) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows returned
          return null;
        }
        console.error("Supabase update category error:", error);
        throw new Error(`Error updating category: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("SupabaseCategoryRepository.update error:", error);
      throw error;
    }
  }

  /**
   * Deletes a category by ID
   * @param {string} id - Category ID
   * @param {string} userId - User ID for security
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id, userId) {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        console.error("Supabase delete category error:", error);
        throw new Error(`Error deleting category: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error("SupabaseCategoryRepository.delete error:", error);
      throw error;
    }
  }

  /**
   * Counts categories for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of categories
   */
  async count(userId) {
    try {
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      if (error) {
        console.error("Supabase count categories error:", error);
        throw new Error(`Error counting categories: ${error.message}`);
      }

      return count || 0;
    } catch (error) {
      console.error("SupabaseCategoryRepository.count error:", error);
      throw error;
    }
  }

  async countContent(categoryId, userId) {
    try {
      const [fcRes, qRes, tfRes] = await Promise.all([
        this.supabase
          .from("flashcards")
          .select("*", { count: "exact", head: true })
          .eq("category_id", categoryId)
          .eq("user_id", userId),
        this.supabase
          .from("quizzes")
          .select("*", { count: "exact", head: true })
          .eq("category_id", categoryId)
          .eq("user_id", userId),
        this.supabase
          .from("true_false_sets")
          .select("*", { count: "exact", head: true })
          .eq("category_id", categoryId)
          .eq("user_id", userId),
      ]);
      return (fcRes.count || 0) + (qRes.count || 0) + (tfRes.count || 0);
    } catch (error) {
      console.error("SupabaseCategoryRepository.countContent error:", error);
      throw error;
    }
  }

  async publish(id, userId, isPublic) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({ is_public: isPublic })
        .eq("id", id)
        .eq("user_id", userId)
        .select("id, is_public")
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(`Error publishing category: ${error.message}`);
      }

      // Propagate is_public to all content in this category
      await Promise.all([
        this.supabase
          .from("flashcards")
          .update({ is_public: isPublic })
          .eq("category_id", id)
          .eq("user_id", userId),
        this.supabase
          .from("quizzes")
          .update({ is_public: isPublic })
          .eq("category_id", id)
          .eq("user_id", userId),
        this.supabase
          .from("true_false_sets")
          .update({ is_public: isPublic })
          .eq("category_id", id)
          .eq("user_id", userId),
      ]);

      return { id, is_public: isPublic };
    } catch (error) {
      console.error("SupabaseCategoryRepository.publish error:", error);
      throw error;
    }
  }
}

module.exports = SupabaseCategoryRepository;
