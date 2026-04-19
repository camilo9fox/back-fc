const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const config = require("../../shared/config/config");
const { authMiddleware } = require("../../shared/middleware/auth");

/**
 * Games routes — read-only endpoints that pool questions for game modes.
 * Uses service role key so it can query across tables freely,
 * but always filters by user_id manually.
 */
function createGamesRouter() {
  const router = express.Router();
  const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
  );

  /**
   * GET /api/games/survival/pool
   * Returns a shuffled pool of quiz + true/false questions for the user.
   * Query params:
   *   categoryId? — filter to a specific category
   *   limit?      — max questions to return (default 50, max 100)
   */
  router.get("/survival/pool", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const { categoryId } = req.query;
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      // ── 1. Quiz questions ─────────────────────────────────────────────────
      let quizQuery = supabase
        .from("quizzes")
        .select("id")
        .eq("user_id", userId);
      if (categoryId) quizQuery = quizQuery.eq("category_id", categoryId);

      const { data: quizRows, error: quizRowsErr } = await quizQuery;
      if (quizRowsErr) throw quizRowsErr;

      let quizQuestions = [];
      if (quizRows && quizRows.length > 0) {
        const quizIds = quizRows.map((r) => r.id);
        const { data, error } = await supabase
          .from("quiz_questions")
          .select("id, question, options, correct_answer, explanation")
          .in("quiz_id", quizIds);
        if (error) throw error;
        quizQuestions = (data || []).map((q) => ({ type: "quiz", ...q }));
      }

      // ── 2. True/false questions ───────────────────────────────────────────
      let tfQuery = supabase
        .from("true_false_sets")
        .select("id")
        .eq("user_id", userId);
      if (categoryId) tfQuery = tfQuery.eq("category_id", categoryId);

      const { data: tfRows, error: tfRowsErr } = await tfQuery;
      if (tfRowsErr) throw tfRowsErr;

      let tfQuestions = [];
      if (tfRows && tfRows.length > 0) {
        const setIds = tfRows.map((r) => r.id);
        const { data, error } = await supabase
          .from("true_false_questions")
          .select("id, statement, is_true, explanation")
          .in("set_id", setIds);
        if (error) throw error;
        tfQuestions = (data || []).map((q) => ({ type: "true-false", ...q }));
      }

      // ── 3. Shuffle (Fisher-Yates) and limit ───────────────────────────────
      const all = [...quizQuestions, ...tfQuestions];
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }

      res.json({
        questions: all.slice(0, limit),
        total: all.length,
      });
    } catch (error) {
      console.error("GamesRoute.getSurvivalPool error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = createGamesRouter;
