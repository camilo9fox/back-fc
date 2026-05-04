const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const IExamSimulationRepository = require("../interfaces/IExamSimulationRepository");
const { NotFoundError } = require("../../../../shared/errors/AppError");

class SupabaseExamSimulationRepository extends IExamSimulationRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  async create(payload) {
    const { data: simulation, error } = await this.supabase
      .from("exam_simulations")
      .insert([
        {
          user_id: payload.userId,
          category_id: payload.categoryId,
          title: payload.title,
          description: payload.description || null,
          duration_minutes: payload.durationMinutes,
        },
      ])
      .select()
      .single();

    if (error) throw new Error(`Error creating simulation: ${error.message}`);

    if (
      Array.isArray(payload.trueFalseQuestions) &&
      payload.trueFalseQuestions.length
    ) {
      const records = payload.trueFalseQuestions.map((item, index) => ({
        simulation_id: simulation.id,
        statement: item.statement,
        is_true: item.is_true,
        explanation: item.explanation || null,
        order_index: Number.isInteger(item.order_index)
          ? item.order_index
          : index,
      }));

      const { error: tfError } = await this.supabase
        .from("exam_simulation_truefalse_questions")
        .insert(records);

      if (tfError) {
        throw new Error(`Error creating V/F questions: ${tfError.message}`);
      }
    }

    if (
      Array.isArray(payload.developmentQuestions) &&
      payload.developmentQuestions.length
    ) {
      const records = payload.developmentQuestions.map((item, index) => ({
        simulation_id: simulation.id,
        prompt: item.prompt,
        reference_answer: item.reference_answer || null,
        evaluation_criteria: item.evaluation_criteria || null,
        max_points: item.max_points,
        order_index: Number.isInteger(item.order_index)
          ? item.order_index
          : index,
      }));

      const { error: devError } = await this.supabase
        .from("exam_simulation_development_questions")
        .insert(records);

      if (devError) {
        throw new Error(
          `Error creating development questions: ${devError.message}`,
        );
      }
    }

    if (
      Array.isArray(payload.multipleChoiceQuestions) &&
      payload.multipleChoiceQuestions.length
    ) {
      const records = payload.multipleChoiceQuestions.map((item, index) => ({
        simulation_id: simulation.id,
        question: item.question,
        options: item.options,
        correct_answer: item.correct_answer,
        explanation: item.explanation || null,
        order_index: Number.isInteger(item.order_index)
          ? item.order_index
          : index,
      }));

      const { error: mcError } = await this.supabase
        .from("exam_simulation_multiple_choice_questions")
        .insert(records);

      if (mcError) {
        throw new Error(
          `Error creating multiple choice questions: ${mcError.message}`,
        );
      }
    }

    return this.findById(simulation.id, payload.userId);
  }

  async findAllByUser(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    let query = this.supabase
      .from("exam_simulations")
      .select(
        `
        *,
        categories(id, title, description),
        exam_simulation_truefalse_questions(id),
        exam_simulation_multiple_choice_questions(id),
        exam_simulation_development_questions(id)
      `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (options.categoryId) {
      query = query.eq("category_id", options.categoryId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Error fetching simulations: ${error.message}`);
    }

    return (data || []).map((item) => {
      const tf = Array.isArray(item.exam_simulation_truefalse_questions)
        ? item.exam_simulation_truefalse_questions.length
        : 0;
      const mc = Array.isArray(item.exam_simulation_multiple_choice_questions)
        ? item.exam_simulation_multiple_choice_questions.length
        : 0;
      const dev = Array.isArray(item.exam_simulation_development_questions)
        ? item.exam_simulation_development_questions.length
        : 0;

      return {
        ...item,
        category: item.categories || null,
        trueFalseCount: tf,
        multipleChoiceCount: mc,
        developmentCount: dev,
        totalQuestions: tf + mc + dev,
      };
    });
  }

  async findById(id, userId) {
    const { data, error } = await this.supabase
      .from("exam_simulations")
      .select(
        `*,
        categories(id, title, description),
        exam_simulation_truefalse_questions(*),
        exam_simulation_multiple_choice_questions(*),
        exam_simulation_development_questions(*)`,
      )
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Error fetching simulation: ${error.message}`);
    }

    return {
      ...data,
      category: data.categories || null,
      trueFalseQuestions:
        (data.exam_simulation_truefalse_questions || []).sort(
          (a, b) => a.order_index - b.order_index,
        ) || [],
      multipleChoiceQuestions:
        (data.exam_simulation_multiple_choice_questions || []).sort(
          (a, b) => a.order_index - b.order_index,
        ) || [],
      developmentQuestions:
        (data.exam_simulation_development_questions || []).sort(
          (a, b) => a.order_index - b.order_index,
        ) || [],
    };
  }

  async update(id, userId, payload) {
    const fields = {};
    if (payload.title !== undefined) fields.title = payload.title;
    if (payload.description !== undefined)
      fields.description = payload.description;
    if (payload.categoryId !== undefined)
      fields.category_id = payload.categoryId;
    if (payload.durationMinutes !== undefined) {
      fields.duration_minutes = payload.durationMinutes;
    }

    const { data, error } = await this.supabase
      .from("exam_simulations")
      .update(fields)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw new Error(`Error updating simulation: ${error.message}`);
    return data;
  }

  async delete(id, userId) {
    const { error } = await this.supabase
      .from("exam_simulations")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new Error(`Error deleting simulation: ${error.message}`);
    return true;
  }

  async createAttempt(payload) {
    const { data, error } = await this.supabase
      .from("exam_simulation_attempts")
      .insert([
        {
          user_id: payload.userId,
          simulation_id: payload.simulationId,
          score: payload.score,
          total_points: payload.totalPoints,
          detail: payload.detail,
        },
      ])
      .select()
      .single();

    if (error) throw new Error(`Error saving attempt: ${error.message}`);
    return data;
  }

  async listQuestionBankByCategory(userId, categoryId) {
    const [tfResult, quizResult] = await Promise.all([
      this.supabase
        .from("true_false_questions")
        .select(
          "statement, is_true, explanation, true_false_sets!inner(user_id, category_id)",
        )
        .eq("true_false_sets.user_id", userId)
        .eq("true_false_sets.category_id", categoryId)
        .limit(200),
      this.supabase
        .from("quiz_questions")
        .select(
          "question, options, correct_answer, explanation, quizzes!inner(user_id, category_id)",
        )
        .eq("quizzes.user_id", userId)
        .eq("quizzes.category_id", categoryId)
        .limit(200),
    ]);

    if (tfResult.error) {
      throw new Error(
        `Error fetching category V/F questions: ${tfResult.error.message}`,
      );
    }

    if (quizResult.error) {
      throw new Error(
        `Error fetching category quiz questions: ${quizResult.error.message}`,
      );
    }

    return {
      trueFalseQuestions: (tfResult.data || []).map((item) => ({
        statement: item.statement,
        is_true: item.is_true,
        explanation: item.explanation || null,
      })),
      multipleChoiceQuestions: (quizResult.data || []).map((item) => ({
        question: item.question,
        options: Array.isArray(item.options) ? item.options : [],
        correct_answer: item.correct_answer,
        explanation: item.explanation || null,
      })),
    };
  }

  async ensureOwnership(simulationId, userId) {
    const { data, error } = await this.supabase
      .from("exam_simulations")
      .select("id")
      .eq("id", simulationId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      throw new NotFoundError("Simulacion no encontrada o acceso denegado");
    }

    return true;
  }
}

module.exports = SupabaseExamSimulationRepository;
