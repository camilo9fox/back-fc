const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const ITrueFalseRepository = require("../interfaces/ITrueFalseRepository");
const { NotFoundError } = require("../../../../shared/errors/AppError");

class SupabaseTrueFalseRepository extends ITrueFalseRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  async create(setData) {
    try {
      const { data, error } = await this.supabase
        .from("true_false_sets")
        .insert([
          {
            user_id: setData.userId,
            category_id: setData.categoryId,
            title: setData.title,
            description: setData.description || null,
          },
        ])
        .select()
        .single();

      if (error)
        throw new Error(`Error creating true/false set: ${error.message}`);

      if (setData.questions && setData.questions.length > 0) {
        const questions = setData.questions.map((q, index) => ({
          set_id: data.id,
          statement: q.statement,
          is_true: q.isTrue,
          explanation: q.explanation || null,
          order_index: index,
        }));

        const { error: qError } = await this.supabase
          .from("true_false_questions")
          .insert(questions);

        if (qError)
          throw new Error(
            `Error creating true/false questions: ${qError.message}`,
          );
      }

      return this.findById(data.id, setData.userId);
    } catch (error) {
      console.error("SupabaseTrueFalseRepository.create error:", error);
      throw error;
    }
  }

  async findAllByUser(userId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      let query = this.supabase
        .from("true_false_sets")
        .select(
          `*, true_false_questions(*), categories(id, title, description)`,
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (options.categoryId)
        query = query.eq("category_id", options.categoryId);

      const { data, error } = await query;

      if (error)
        throw new Error(`Error fetching true/false sets: ${error.message}`);
      return (data || []).map(this._normalize);
    } catch (error) {
      console.error("SupabaseTrueFalseRepository.findAllByUser error:", error);
      throw error;
    }
  }

  async findById(id, userId) {
    try {
      const { data, error } = await this.supabase
        .from("true_false_sets")
        .select(
          `*, true_false_questions(*), categories(id, title, description)`,
        )
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(`Error finding true/false set: ${error.message}`);
      }

      return this._normalize(data);
    } catch (error) {
      console.error("SupabaseTrueFalseRepository.findById error:", error);
      throw error;
    }
  }

  _normalize(set) {
    if (!set) return set;
    const { true_false_questions, categories, ...rest } = set;
    return {
      ...rest,
      questions: true_false_questions ?? [],
      category: categories ?? null,
    };
  }

  async update(id, userId, updateData) {
    try {
      const fields = {};
      if (updateData.title !== undefined) fields.title = updateData.title;
      if (updateData.description !== undefined)
        fields.description = updateData.description;
      if (updateData.categoryId !== undefined)
        fields.category_id = updateData.categoryId;

      const { data, error } = await this.supabase
        .from("true_false_sets")
        .update(fields)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error)
        throw new Error(`Error updating true/false set: ${error.message}`);
      return data;
    } catch (error) {
      console.error("SupabaseTrueFalseRepository.update error:", error);
      throw error;
    }
  }

  async delete(id, userId) {
    try {
      const { error } = await this.supabase
        .from("true_false_sets")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error)
        throw new Error(`Error deleting true/false set: ${error.message}`);
      return true;
    } catch (error) {
      console.error("SupabaseTrueFalseRepository.delete error:", error);
      throw error;
    }
  }

  async addQuestion(setId, userId, questionData) {
    try {
      const set = await this.findById(setId, userId);
      if (!set)
        throw new NotFoundError("True/false set not found or access denied");

      const { count } = await this.supabase
        .from("true_false_questions")
        .select("*", { count: "exact", head: true })
        .eq("set_id", setId);

      const { data, error } = await this.supabase
        .from("true_false_questions")
        .insert([
          {
            set_id: setId,
            statement: questionData.statement,
            is_true: questionData.isTrue,
            explanation: questionData.explanation || null,
            order_index: count || 0,
          },
        ])
        .select()
        .single();

      if (error) throw new Error(`Error adding question: ${error.message}`);
      return data;
    } catch (error) {
      console.error("SupabaseTrueFalseRepository.addQuestion error:", error);
      throw error;
    }
  }

  async deleteQuestion(questionId, userId) {
    try {
      const { data: question, error: fetchError } = await this.supabase
        .from("true_false_questions")
        .select("*, true_false_sets!inner(user_id)")
        .eq("id", questionId)
        .eq("true_false_sets.user_id", userId)
        .single();

      if (fetchError || !question)
        throw new NotFoundError("Question not found or access denied");

      const { error } = await this.supabase
        .from("true_false_questions")
        .delete()
        .eq("id", questionId);

      if (error) throw new Error(`Error deleting question: ${error.message}`);
      return true;
    } catch (error) {
      console.error("SupabaseTrueFalseRepository.deleteQuestion error:", error);
      throw error;
    }
  }
}

module.exports = SupabaseTrueFalseRepository;
