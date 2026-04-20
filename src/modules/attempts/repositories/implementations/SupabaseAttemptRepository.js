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
    // If a quizId is provided, verify totalQuestions doesn't exceed the actual count
    if (quizId) {
      const { count, error: countErr } = await this.supabase
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .eq("quiz_id", quizId);
      if (!countErr && count !== null && totalQuestions > count) {
        throw new Error(
          `total_questions (${totalQuestions}) exceeds the actual number of questions in the quiz (${count})`,
        );
      }
    }

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

    // Average score grouped by category_id (quiz + TF only)
    const scoreMap = {};
    for (const a of quizAndTf) {
      const catId = a.category_id ?? "__none__";
      if (!scoreMap[catId]) scoreMap[catId] = { sum: 0, count: 0 };
      scoreMap[catId].sum += (a.score / a.total_questions) * 100;
      scoreMap[catId].count += 1;
    }
    const avgScoreByCategory = Object.fromEntries(
      Object.entries(scoreMap).map(([catId, { sum, count }]) => [
        catId,
        Math.round(sum / count),
      ]),
    );

    return {
      totalAttempts,
      totalFlashcardSessions,
      avgScore,
      currentStreak,
      recentAttempts,
      avgScoreByCategory,
    };
  }

  /**
   * Returns paginated attempt history with optional filters.
   * Merges quiz_attempts, true_false_attempts, and flashcard_sessions into one list.
   */
  async getHistory(
    userId,
    { type, categoryId, from, to, page = 1, limit = 20 } = {},
  ) {
    const offset = (page - 1) * limit;

    const shouldInclude = (t) => !type || type === t;

    // Fetch all three tables in parallel (we filter + sort in JS to keep queries simple)
    const [quizRows, tfRows, fcRows] = await Promise.all([
      shouldInclude("quiz")
        ? this._fetchHistoryRows(
            "quiz_attempts",
            userId,
            categoryId,
            from,
            to,
            [
              "id",
              "score",
              "total_questions",
              "completed_at",
              "categories(id,title)",
            ],
          )
        : [],
      shouldInclude("true-false")
        ? this._fetchHistoryRows(
            "true_false_attempts",
            userId,
            categoryId,
            from,
            to,
            [
              "id",
              "score",
              "total_questions",
              "completed_at",
              "categories(id,title)",
            ],
          )
        : [],
      shouldInclude("flashcards")
        ? this._fetchHistoryRows(
            "flashcard_sessions",
            userId,
            categoryId,
            from,
            to,
            [
              "id",
              "cards_known",
              "cards_unknown",
              "total_cards",
              "completed_at",
              "categories(id,title)",
            ],
          )
        : [],
    ]);

    // Normalize into a uniform shape
    const items = [
      ...quizRows.map((r) => ({
        id: r.id,
        type: "quiz",
        categoryId: r.categories?.id ?? null,
        categoryTitle: r.categories?.title ?? null,
        score: r.score,
        total: r.total_questions,
        pct: Math.round((r.score / r.total_questions) * 100),
        completedAt: r.completed_at,
      })),
      ...tfRows.map((r) => ({
        id: r.id,
        type: "true-false",
        categoryId: r.categories?.id ?? null,
        categoryTitle: r.categories?.title ?? null,
        score: r.score,
        total: r.total_questions,
        pct: Math.round((r.score / r.total_questions) * 100),
        completedAt: r.completed_at,
      })),
      ...fcRows.map((r) => ({
        id: r.id,
        type: "flashcards",
        categoryId: r.categories?.id ?? null,
        categoryTitle: r.categories?.title ?? null,
        score: r.cards_known,
        total: r.total_cards,
        pct: Math.round((r.cards_known / r.total_cards) * 100),
        completedAt: r.completed_at,
      })),
    ];

    // Sort descending by date
    items.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    const total = items.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paged = items.slice(offset, offset + limit);

    return { items: paged, total, page, totalPages };
  }

  async _fetchHistoryRows(table, userId, categoryId, from, to, columns) {
    let query = this.supabase
      .from(table)
      .select(columns.join(", "))
      .eq("user_id", userId)
      .order("completed_at", { ascending: false });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }
    if (from) {
      query = query.gte("completed_at", from);
    }
    if (to) {
      // Include the full day by using the day after as exclusive upper bound
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt("completed_at", toDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
    return data ?? [];
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Builds daily activity + score chart data for the last N days.
   * Aggregates quiz_attempts, true_false_attempts, and flashcard_sessions by calendar day.
   */
  async getChartData(userId, days = 14) {
    const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();

    const [quizRows, tfRows, fcRows] = await Promise.all([
      this._fetchRowsSince("quiz_attempts", userId, since, [
        "score",
        "total_questions",
        "completed_at",
      ]),
      this._fetchRowsSince("true_false_attempts", userId, since, [
        "score",
        "total_questions",
        "completed_at",
      ]),
      this._fetchRowsSince("flashcard_sessions", userId, since, [
        "cards_known",
        "total_cards",
        "completed_at",
      ]),
    ]);

    // Build ordered list of the last N days as labels
    const labels = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * MS_PER_DAY);
      labels.push(this._dayKey(d));
    }

    // Helpers to bucket rows into day keys
    const bucket = (rows, key = "completed_at") => {
      const map = {};
      for (const r of rows) {
        const k = this._dayKey(new Date(r[key]));
        if (!map[k]) map[k] = [];
        map[k].push(r);
      }
      return map;
    };

    const quizByDay = bucket(quizRows);
    const tfByDay = bucket(tfRows);
    const fcByDay = bucket(fcRows);

    const activityByDay = labels.map((label) => ({
      date: label,
      quizzes: (quizByDay[label] ?? []).length,
      trueFalse: (tfByDay[label] ?? []).length,
      flashcards: (fcByDay[label] ?? []).length,
    }));

    // Score chart: average score % per day (quiz + TF only)
    const scoreByDay = labels.map((label) => {
      const allAttempts = [
        ...(quizByDay[label] ?? []),
        ...(tfByDay[label] ?? []),
      ];
      if (allAttempts.length === 0) return { date: label, avgScore: null };
      const avg =
        allAttempts.reduce(
          (sum, a) => sum + (a.score / a.total_questions) * 100,
          0,
        ) / allAttempts.length;
      return { date: label, avgScore: Math.round(avg) };
    });

    return { activityByDay, scoreByDay };
  }

  async _fetchRowsSince(table, userId, since, columns) {
    const { data, error } = await this.supabase
      .from(table)
      .select(columns.join(", "))
      .eq("user_id", userId)
      .gte("completed_at", since)
      .order("completed_at", { ascending: true });

    if (error) {
      throw new Error(`Error fetching ${table}: ${error.message}`);
    }
    return data ?? [];
  }

  /** Returns a short day label like "12 abr" */
  _dayKey(date) {
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    });
  }

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

  // ─── Game scores ──────────────────────────────────────────────────────────

  async createGameScore({ userId, gameType, categoryId, score }) {
    const { data, error } = await this.supabase
      .from("game_scores")
      .insert({
        user_id: userId,
        game_type: gameType,
        category_id: categoryId ?? null,
        score,
      })
      .select()
      .single();

    if (error) throw new Error(`Error saving game score: ${error.message}`);
    return data;
  }

  async getGameBest({ userId, gameType, categoryId }) {
    let query = this.supabase
      .from("game_scores")
      .select("score, completed_at")
      .eq("user_id", userId)
      .eq("game_type", gameType)
      .order("score", { ascending: false })
      .limit(1);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    } else {
      query = query.is("category_id", null);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Error fetching game best: ${error.message}`);
    return data?.[0] ?? null;
  }

  async getGameLeaderboard({ gameType, categoryId, limit = 10 }) {
    let query = this.supabase
      .from("game_scores")
      .select("user_id, score, completed_at")
      .eq("game_type", gameType)
      .order("score", { ascending: false })
      .limit(limit);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Error fetching leaderboard: ${error.message}`);
    return data ?? [];
  }
}

module.exports = SupabaseAttemptRepository;
