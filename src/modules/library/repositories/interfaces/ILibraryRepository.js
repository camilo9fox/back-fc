/**
 * Interface for Library repository operations (public content + forking).
 * Sharing is organized by category (study topic) — not per content type.
 */
class ILibraryRepository {
  async getPublicCategories(options) {
    throw new Error("getPublicCategories() must be implemented");
  }

  async forkCategory(sourceCategoryId, targetUserId) {
    throw new Error("forkCategory() must be implemented");
  }
}

module.exports = ILibraryRepository;
