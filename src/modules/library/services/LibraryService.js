class LibraryService {
  constructor(libraryRepository) {
    this.libraryRepository = libraryRepository;
  }

  async getPublicCategories(options) {
    return this.libraryRepository.getPublicCategories(options);
  }

  async forkCategory(sourceCategoryId, targetUserId) {
    return this.libraryRepository.forkCategory(sourceCategoryId, targetUserId);
  }

  async getCategoryPreview(categoryId) {
    return this.libraryRepository.getCategoryPreview(categoryId);
  }
}

module.exports = LibraryService;
