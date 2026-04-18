const { createClient } = require("@supabase/supabase-js");
const IAttemptRepository = require("../interfaces/IAttemptRepository");
const config = require("../../../../shared/config/config");

const MS_PER_DAY = 86_400_000;

/**
 * Supabase implementation of the attempt repository.
 * Single Responsibility: only database operations for attempt records.
 * Dependency Inversion: implements IAttemptRepository abstraction.
 */
class SupabaseAttemptRepository extends IAttemptRepository {
  constructor() {
    super();
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
  }

  async createQuizAttempt({
    userId,
    quizId,
    categoryId,
    score,
    totalQuestions,
  }) {
    const { data, error } = await this.supabase
      .from("quiz_attempts")
      .insert({
        user_id: userId,
        quiz_id: quizId ?? null,
        category_id: categoryId ?? null,
        score,
        total_questions: totalQuestions,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating quiz attempt: ${error.message}`);
    }
    return data;
  }

  async createTrueFalseAttempt({
    userId,
    setId,
    categoryId,
    score,
    totalQuestions,
  }) {
    const { data, error } = await this.supabase
      .from("true_false_attempts")
      .insert({
        user_id: userId,
        set_id: setId ?? null,
        category_id: categoryId ?? null,
        score,
        total_questions: totalQuestions,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating true/false attempt: ${error.message}`);
    }
    return data;
  }

  async createFlashcardSession({
    userId,
    categoryId,
    cardsKnown,
    cardsUnknown,
    totalCards,
  }) {
    const { data, error } = await this.supabase
      .from("flashcard_sessions")
      .insert({
        user_id: userId,
        category_id: categoryId ?? null,
        cards_known: cardsKnown,
        cards_unknown: cardsUnknown,
        total_cards: totalCards,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating flashcard session: ${error.message}`);
    }
    return data;
  }

  async getAttemptStats(userId) {
    const [quizRows, tfRows, fcRows] = await Promise.all([
      this._fetchAttempts("quiz_attempts", userId),
      this._fetchAttempts("true_false_attempts", userId),
      this._fetchFlashcardSessions(userId),
    ]);

    const quizAndTf = [
      ...quizRows.map((a) => ({ ...a, type: "quiz" })),
      ...tfRows.map((a) => ({ ...a, type: "true_false" })),
    ];

    const fcMapped = fcRows.map((a) => ({
      ...a,
      type: "flashcard",
      score: a.cards_known,
      total_questions: a.total_cards,
    }));

    // All activities sorted by date — used for streak calculation
    const allActivities = [...quizAndTf, ...fcMapped].sort(
      (a, b) => new Date(b.completed_at) - new Date(a.completed_at),
    );

    const totalAttempts = quizAndTf.length; // quiz + V/F only, flashcards are "sessions"
    const totalFlashcardSessions = fcRows.length;

    const avgScore =
      totalAttempts > 0
        ? Math.round(
            quizAndTf.reduce(
              (sum, a) => sum + (a.score / a.total_questions) * 100,
              0,
            ) / totalAttempts,
          )
        : 0;

    const currentStreak = this._calculateStreak(allActivities);

    const recentAttempts = quizAndTf.slice(0, 10).map((a) => ({
      type: a.type,
      score: a.score,
      total: a.total_questions,
      completedAt: a.completed_at,
      categoryTitle: a.categories?.title ?? null,
    }));

    return {
      totalAttempts,
      totalFlashcardSessions,
      avgScore,
      currentStreak,
      recentAttempts,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  async _fetchAttempts(table, userId) {
    const { data, error } = await this.supabase
      .from(table)
      .select("score, total_questions, completed_at, categories(title)")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false });

    if (error) {
      throw new Error(`Error fetching ${table}: ${error.message}`);
    }
    return data ?? [];
  }

  async _fetchFlashcardSessions(userId) {
    const { data, error } = await this.supabase
      .from("flashcard_sessions")
      .select(
        "cards_known, cards_unknown, total_cards, completed_at, categories(title)",
      )
      .eq("user_id", userId)
      .order("completed_at", { ascending: false });

    if (error) {
      throw new Error(`Error fetching flashcard_sessions: ${error.message}`);
    }
    return data ?? [];
  }

  /**
   * Counts consecutive study days ending today (or yesterday if no attempt today).
   * @param {Array} sortedAttempts - Attempts sorted descending by completed_at
   * @returns {number}
   */
  _calculateStreak(sortedAttempts) {
    if (sortedAttempts.length === 0) return 0;

    const toDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };

    const today = toDay(new Date());
    const activeDays = new Set(
      sortedAttempts.map((a) => toDay(a.completed_at)),
    );

    let streak = 0;
    // Start counting from today; if no attempt today, start from yesterday
    let cursor = activeDays.has(today) ? today : today - MS_PER_DAY;

    while (activeDays.has(cursor)) {
      streak++;
      cursor -= MS_PER_DAY;
    }

    return streak;
  }
}

module.exports = SupabaseAttemptRepository;
