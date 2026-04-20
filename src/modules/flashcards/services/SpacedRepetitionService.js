const logger = require("../../../shared/config/logger");
const { ValidationError } = require("../../../shared/errors/AppError");

// Quality ratings the user can submit
// 1 = Again (blackout — reset)
// 2 = Hard
// 3 = Good
// 4 = Easy
const QUALITY_MAP = { 1: 1, 2: 3, 3: 4, 4: 5 };
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

/**
 * Implements the SM-2 spaced repetition algorithm.
 * Reference: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
 */
class SpacedRepetitionService {
  constructor(spacedRepetitionRepository) {
    this.repo = spacedRepetitionRepository;
  }

  /**
   * Returns cards due for review today (plus new cards to fill the slot).
   * @param {string} userId
   * @param {Object} options
   * @param {number} options.limit
   * @param {string} [options.categoryId]
   */
  async getDueCards(userId, { limit = 20, categoryId = null } = {}) {
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    return this.repo.findDueCards(userId, safeLimit, categoryId);
  }

  /**
   * Applies SM-2 algorithm after the user reviews a card.
   * @param {string} userId
   * @param {string} flashcardId
   * @param {number} quality - 1 (Again) | 2 (Hard) | 3 (Good) | 4 (Easy)
   * @returns {Promise<Object>} Updated review state
   */
  async submitReview(userId, flashcardId, quality) {
    if (![1, 2, 3, 4].includes(quality)) {
      throw new ValidationError(
        "quality must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)",
      );
    }

    // Load existing state or initialise
    const existing = await this.repo.getReview(userId, flashcardId);
    const currentEase = existing?.ease_factor ?? DEFAULT_EASE;
    const currentInterval = existing?.interval_days ?? 0;
    const currentReps = existing?.repetitions ?? 0;

    const q = QUALITY_MAP[quality]; // map 1-4 → 0-5 SM-2 quality scale

    let newReps, newInterval, newEase;

    if (q < 3) {
      // Failed — reset repetition counter, review again tomorrow
      newReps = 0;
      newInterval = 1;
      newEase = currentEase; // ease doesn't change on fail
    } else {
      // Passed
      newReps = currentReps + 1;
      if (currentReps === 0) {
        newInterval = 1;
      } else if (currentReps === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.ceil(currentInterval * currentEase);
      }
      // Update ease factor: EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
      const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
      newEase = Math.max(
        MIN_EASE,
        parseFloat((currentEase + delta).toFixed(2)),
      );
    }

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

    const updated = await this.repo.upsertReview({
      userId,
      flashcardId,
      easeFactor: newEase,
      intervalDays: newInterval,
      repetitions: newReps,
      nextReviewAt: nextReviewAt.toISOString(),
    });

    logger.info(
      `SM-2 review: user=${userId} card=${flashcardId} q=${quality}(→${q}) ` +
        `reps=${newReps} interval=${newInterval}d ease=${newEase}`,
    );

    return {
      flashcardId,
      quality,
      easeFactor: newEase,
      intervalDays: newInterval,
      repetitions: newReps,
      nextReviewAt: nextReviewAt.toISOString(),
    };
  }

  /**
   * Returns review stats (due, new, learned, total) for a user.
   */
  async getReviewStats(userId) {
    return this.repo.getReviewStats(userId);
  }

  /**
   * Searches flashcards by query string (question or answer contains query).
   */
  async searchFlashCards(userId, query, categoryId = null, limit = 50) {
    if (!query || query.trim().length < 2) {
      throw new ValidationError("La búsqueda debe tener al menos 2 caracteres");
    }
    return this.repo.search(userId, query.trim(), categoryId, limit);
  }

  /**
   * Returns all flashcards formatted as CSV text.
   */
  async exportToCsv(userId, categoryId = null) {
    const cards = await this.repo.findAllForExport(userId, categoryId);
    const header = "Categoría,Pregunta,Respuesta,Fuente,Fecha de creación\n";
    const rows = cards.map((c) => {
      const cat = c.category?.title ?? "";
      const q = this._csvEscape(c.question);
      const a = this._csvEscape(c.answer);
      const src = c.source ?? "";
      const date = c.created_at ? c.created_at.split("T")[0] : "";
      return `${this._csvEscape(cat)},${q},${a},${src},${date}`;
    });
    return header + rows.join("\n");
  }

  _csvEscape(str) {
    if (str == null) return "";
    const s = String(str).replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? `"${s}"` : s;
  }
}

module.exports = SpacedRepetitionService;
