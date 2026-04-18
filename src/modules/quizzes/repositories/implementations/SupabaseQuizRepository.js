const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const IQuizRepository = require("../interfaces/IQuizRepository");
const { NotFoundError } = require("../../../../shared/errors/AppError");

class SupabaseQuizRepository extends IQuizRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  async create(quizData) {
    try {
      const { data, error } = await this.supabase
        .from("quizzes")
        .insert([
          {
            user_id: quizData.userId,
            category_id: quizData.categoryId,
            title: quizData.title,
            description: quizData.description || null,
          },
        ])
        .select()
        .single();

      if (error) throw new Error(`Error creating quiz: ${error.message}`);

      if (quizData.questions && quizData.questions.length > 0) {
        const questions = quizData.questions.map((q, index) => ({
          quiz_id: data.id,
          question: q.question,
          options: q.options,
          correct_answer: q.correctAnswer,
          explanation: q.explanation || null,
          order_index: index,
        }));

        const { error: qError } = await this.supabase
          .from("quiz_questions")
          .insert(questions);

        if (qError)
          throw new Error(`Error creating quiz questions: ${qError.message}`);
      }

      return this.findById(data.id, quizData.userId);
    } catch (error) {
      console.error("SupabaseQuizRepository.create error:", error);
      throw error;
    }
  }

  async findAllByUser(userId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      let query = this.supabase
        .from("quizzes")
        .select(`*, quiz_questions(*), categories(id, title, description)`)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (options.categoryId)
        query = query.eq("category_id", options.categoryId);

      const { data, error } = await query;

      if (error) throw new Error(`Error fetching quizzes: ${error.message}`);
      return (data || []).map(this._normalize);
    } catch (error) {
      console.error("SupabaseQuizRepository.findAllByUser error:", error);
      throw error;
    }
  }

  async findById(id, userId) {
    try {
      const { data, error } = await this.supabase
        .from("quizzes")
        .select(`*, quiz_questions(*), categories(id, title, description)`)
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(`Error finding quiz: ${error.message}`);
      }

      return this._normalize(data);
    } catch (error) {
      console.error("SupabaseQuizRepository.findById error:", error);
      throw error;
    }
  }

  _normalize(quiz) {
    if (!quiz) return quiz;
    const { quiz_questions, categories, ...rest } = quiz;
    return {
      ...rest,
      questions: quiz_questions ?? [],
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
        .from("quizzes")
        .update(fields)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw new Error(`Error updating quiz: ${error.message}`);
      return data;
    } catch (error) {
      console.error("SupabaseQuizRepository.update error:", error);
      throw error;
    }
  }

  async delete(id, userId) {
    try {
      const { error } = await this.supabase
        .from("quizzes")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw new Error(`Error deleting quiz: ${error.message}`);
      return true;
    } catch (error) {
      console.error("SupabaseQuizRepository.delete error:", error);
      throw error;
    }
  }

  async addQuestion(quizId, userId, questionData) {
    try {
      // Verify ownership
      const quiz = await this.findById(quizId, userId);
      if (!quiz) throw new NotFoundError("Quiz not found or access denied");

      const { count } = await this.supabase
        .from("quiz_questions")
        .select("*", { count: "exact", head: true })
        .eq("quiz_id", quizId);

      const { data, error } = await this.supabase
        .from("quiz_questions")
        .insert([
          {
            quiz_id: quizId,
            question: questionData.question,
            options: questionData.options,
            correct_answer: questionData.correctAnswer,
            explanation: questionData.explanation || null,
            order_index: count || 0,
          },
        ])
        .select()
        .single();

      if (error) throw new Error(`Error adding question: ${error.message}`);
      return data;
    } catch (error) {
      console.error("SupabaseQuizRepository.addQuestion error:", error);
      throw error;
    }
  }

  async deleteQuestion(questionId, userId) {
    try {
      // Verify ownership via join
      const { data: question, error: fetchError } = await this.supabase
        .from("quiz_questions")
        .select("*, quizzes!inner(user_id)")
        .eq("id", questionId)
        .eq("quizzes.user_id", userId)
        .single();

      if (fetchError || !question)
        throw new NotFoundError("Question not found or access denied");

      const { error } = await this.supabase
        .from("quiz_questions")
        .delete()
        .eq("id", questionId);

      if (error) throw new Error(`Error deleting question: ${error.message}`);
      return true;
    } catch (error) {
      console.error("SupabaseQuizRepository.deleteQuestion error:", error);
      throw error;
    }
  }
}

module.exports = SupabaseQuizRepository;
