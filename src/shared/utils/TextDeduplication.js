/**
 * Text Deduplication Utility
 * Simple lexical similarity detection to avoid semantic duplicates in generated content
 */

class TextDeduplication {
  /**
   * Normalize text for comparison: lowercase, remove punctuation, trim whitespace
   * @param {string} text
   * @returns {string}
   */
  static normalize(text) {
    if (!text) return "";
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();
  }

  /**
   * Calculate Levenshtein distance between two strings (fast version)
   * Returns early if difference is already larger than threshold
   * @param {string} a
   * @param {string} b
   * @param {number} maxDistance - Return early if distance exceeds this
   * @returns {number}
   */
  static levenshteinDistance(a, b, maxDistance = 10) {
    const aLen = a.length;
    const bLen = b.length;

    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;

    const matrix = Array.from({ length: aLen + 1 }, (_, i) => [i]);
    for (let j = 1; j <= bLen; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= aLen; i++) {
      for (let j = 1; j <= bLen; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
        // Early exit if already exceeded max
        if (matrix[i][j] > maxDistance) return matrix[i][j];
      }
    }

    return matrix[aLen][bLen];
  }

  /**
   * Check if two questions are suspiciously similar (likely duplicates)
   * Uses normalized Levenshtein distance + word overlap
   * @param {string} q1
   * @param {string} q2
   * @param {number} threshold - Similarity threshold (0-100). Default 70 = 70% similar
   * @returns {boolean}
   */
  static isSimilar(q1, q2, threshold = 70) {
    if (!q1 || !q2) return false;

    const norm1 = this.normalize(q1);
    const norm2 = this.normalize(q2);

    // Exact match after normalization
    if (norm1 === norm2) return true;

    // If very different lengths, unlikely to be similar
    const lenRatio =
      Math.min(norm1.length, norm2.length) /
      Math.max(norm1.length, norm2.length);
    if (lenRatio < 0.5) return false;

    // Levenshtein distance check
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLen = Math.max(norm1.length, norm2.length);
    const similarity = ((maxLen - distance) / maxLen) * 100;

    if (similarity >= threshold) return true;

    // Word overlap check (quick heuristic)
    const words1 = new Set(norm1.split(/\s+/));
    const words2 = new Set(norm2.split(/\s+/));
    const intersection = [...words1].filter((w) => words2.has(w)).length;
    const union = words1.size + words2.size - intersection;
    const wordSimilarity = union > 0 ? (intersection / union) * 100 : 0;

    return wordSimilarity >= threshold;
  }

  /**
   * Filter out duplicates from a list of generated items
   * Compares against existing items by comparing question/statement fields
   * @param {Array<Object>} generatedItems - Items to check
   * @param {Array<Object>} existingItems - Items already in DB
   * @param {string} fieldName - Field to compare ('question' or 'statement')
   * @param {number} threshold - Similarity threshold (default 70)
   * @returns {Array<Object>} Filtered items (unique ones)
   */
  static deduplicateItems(
    generatedItems,
    existingItems = [],
    fieldName = "question",
    threshold = 70,
  ) {
    if (!Array.isArray(generatedItems)) return [];
    if (!Array.isArray(existingItems)) existingItems = [];

    return generatedItems.filter((generated) => {
      const generatedText = generated[fieldName];
      if (!generatedText) return false;

      // Check if similar to any existing item
      return !existingItems.some((existing) => {
        const existingText = existing[fieldName];
        return this.isSimilar(generatedText, existingText, threshold);
      });
    });
  }
}

module.exports = TextDeduplication;
