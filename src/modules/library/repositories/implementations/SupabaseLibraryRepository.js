const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const ILibraryRepository = require("../interfaces/ILibraryRepository");

/**
 * Category-centric library repository.
 * Sharing is organised by study topic (category): publishing a category
 * exposes all its flashcards, quizzes and true/false sets.
 * Forking a category deep-copies all content under a new category owned
 * by the requesting user.
 */
class SupabaseLibraryRepository extends ILibraryRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  // ─── List public categories ───────────────────────────────────────────────

  async getPublicCategories({ limit = 20, offset = 0, search = "" } = {}) {
    try {
      let query = this.supabase
        .from("categories")
        .select("id, title, description, user_id, created_at", {
          count: "exact",
        })
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      if (search) {
        query = query.ilike("title", `%${search}%`);
      }

      const {
        data: categories,
        error,
        count,
      } = await query.range(offset, offset + limit - 1);

      if (error)
        throw new Error(`Error fetching public categories: ${error.message}`);

      if (!categories || categories.length === 0)
        return { categories: [], total: count ?? 0 };

      const catIds = categories.map((c) => c.id);

      // Fetch content counts per category in parallel
      const [flashRes, quizRes, tfRes] = await Promise.all([
        this.supabase
          .from("flashcards")
          .select("category_id")
          .eq("is_public", true)
          .in("category_id", catIds),
        this.supabase
          .from("quizzes")
          .select("category_id")
          .eq("is_public", true)
          .in("category_id", catIds),
        this.supabase
          .from("true_false_sets")
          .select("category_id")
          .eq("is_public", true)
          .in("category_id", catIds),
      ]);

      const flashCount = {};
      for (const f of flashRes.data || [])
        flashCount[f.category_id] = (flashCount[f.category_id] || 0) + 1;

      const quizCount = {};
      for (const q of quizRes.data || [])
        quizCount[q.category_id] = (quizCount[q.category_id] || 0) + 1;

      const tfCount = {};
      for (const t of tfRes.data || [])
        tfCount[t.category_id] = (tfCount[t.category_id] || 0) + 1;

      return {
        categories: categories.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          userId: c.user_id,
          createdAt: c.created_at,
          flashcardCount: flashCount[c.id] || 0,
          quizCount: quizCount[c.id] || 0,
          trueFalseCount: tfCount[c.id] || 0,
        })),
        total: count ?? categories.length,
      };
    } catch (error) {
      console.error("SupabaseLibraryRepository.getPublicCategories:", error);
      throw error;
    }
  }

  // ─── Fork an entire category ──────────────────────────────────────────────

  async forkCategory(sourceCategoryId, targetUserId) {
    try {
      // 1. Verify source category is public
      const { data: srcCat, error: catErr } = await this.supabase
        .from("categories")
        .select("id, title, description")
        .eq("id", sourceCategoryId)
        .eq("is_public", true)
        .single();

      if (catErr || !srcCat)
        throw new Error("Category not found or not public");

      // 2. Create new category for the importing user
      const { data: newCat, error: newCatErr } = await this.supabase
        .from("categories")
        .insert([
          {
            user_id: targetUserId,
            title: srcCat.title,
            description: srcCat.description,
          },
        ])
        .select("id")
        .single();

      if (newCatErr)
        throw new Error(`Error creating forked category: ${newCatErr.message}`);

      const newCatId = newCat.id;

      // 3. Copy flashcards
      const { data: srcFlashcards } = await this.supabase
        .from("flashcards")
        .select("question, answer")
        .eq("category_id", sourceCategoryId)
        .eq("is_public", true);

      let flashcardCount = 0;
      if (srcFlashcards && srcFlashcards.length > 0) {
        const { data: newFlash } = await this.supabase
          .from("flashcards")
          .insert(
            srcFlashcards.map((f) => ({
              user_id: targetUserId,
              category_id: newCatId,
              question: f.question,
              answer: f.answer,
              source: "manual",
              is_public: false,
            })),
          )
          .select("id");
        flashcardCount = (newFlash || []).length;
      }

      // 4. Copy quizzes (with their questions)
      const { data: srcQuizzes } = await this.supabase
        .from("quizzes")
        .select("id, title, description")
        .eq("category_id", sourceCategoryId)
        .eq("is_public", true);

      let quizCount = 0;
      for (const quiz of srcQuizzes || []) {
        const { data: questions } = await this.supabase
          .from("quiz_questions")
          .select("question, options, correct_answer, explanation, order_index")
          .eq("quiz_id", quiz.id)
          .order("order_index");

        const { data: newQuiz } = await this.supabase
          .from("quizzes")
          .insert([
            {
              user_id: targetUserId,
              category_id: newCatId,
              title: quiz.title,
              description: quiz.description,
              is_public: false,
            },
          ])
          .select("id")
          .single();

        if (newQuiz && questions && questions.length > 0) {
          await this.supabase
            .from("quiz_questions")
            .insert(questions.map((q) => ({ quiz_id: newQuiz.id, ...q })));
        }
        quizCount++;
      }

      // 5. Copy true/false sets (with their questions)
      const { data: srcTfSets } = await this.supabase
        .from("true_false_sets")
        .select("id, title, description")
        .eq("category_id", sourceCategoryId)
        .eq("is_public", true);

      let trueFalseCount = 0;
      for (const set of srcTfSets || []) {
        const { data: questions } = await this.supabase
          .from("true_false_questions")
          .select("statement, is_true, explanation, order_index")
          .eq("set_id", set.id)
          .order("order_index");

        const { data: newSet } = await this.supabase
          .from("true_false_sets")
          .insert([
            {
              user_id: targetUserId,
              category_id: newCatId,
              title: set.title,
              description: set.description,
              is_public: false,
            },
          ])
          .select("id")
          .single();

        if (newSet && questions && questions.length > 0) {
          await this.supabase
            .from("true_false_questions")
            .insert(questions.map((q) => ({ set_id: newSet.id, ...q })));
        }
        trueFalseCount++;
      }

      return {
        categoryId: newCatId,
        flashcardCount,
        quizCount,
        trueFalseCount,
      };
    } catch (error) {
      console.error("SupabaseLibraryRepository.forkCategory:", error);
      throw error;
    }
  }

  // ─── Preview a public category ────────────────────────────────────────────

  async getCategoryPreview(categoryId) {
    try {
      // Verify category is public
      const { data: cat, error: catErr } = await this.supabase
        .from("categories")
        .select("id, title, description")
        .eq("id", categoryId)
        .eq("is_public", true)
        .single();

      if (catErr || !cat) throw new Error("Category not found or not public");

      // Fetch sample content in parallel (max 5 per type)
      const [flashRes, quizRes, tfRes] = await Promise.all([
        this.supabase
          .from("flashcards")
          .select("id, question")
          .eq("category_id", categoryId)
          .eq("is_public", true)
          .order("created_at", { ascending: true })
          .limit(5),
        this.supabase
          .from("quizzes")
          .select("id, title, description")
          .eq("category_id", categoryId)
          .eq("is_public", true)
          .order("created_at", { ascending: true })
          .limit(5),
        this.supabase
          .from("true_false_sets")
          .select("id, title, description")
          .eq("category_id", categoryId)
          .eq("is_public", true)
          .order("created_at", { ascending: true })
          .limit(5),
      ]);

      return {
        id: cat.id,
        title: cat.title,
        description: cat.description,
        flashcards: (flashRes.data || []).map((f) => ({
          id: f.id,
          question: f.question,
        })),
        quizzes: (quizRes.data || []).map((q) => ({
          id: q.id,
          title: q.title,
          description: q.description,
        })),
        trueFalseSets: (tfRes.data || []).map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
        })),
      };
    } catch (error) {
      console.error("SupabaseLibraryRepository.getCategoryPreview:", error);
      throw error;
    }
  }
}

module.exports = SupabaseLibraryRepository;
