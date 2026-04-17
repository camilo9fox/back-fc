/**
 * Dependency Injection Container
 * Manages service instantiation and dependency injection
 */
class Container {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
  }

  /**
   * Registers a service factory function
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that returns the service instance
   */
  register(name, factory) {
    this.factories.set(name, factory);
  }

  /**
   * Gets a service instance, creating it if necessary
   * @param {string} name - Service name
   * @returns {*} Service instance
   */
  get(name) {
    if (!this.services.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) {
        throw new Error(`Service '${name}' not registered`);
      }
      this.services.set(name, factory(this));
    }
    return this.services.get(name);
  }

  /**
   * Creates a new container instance with all services registered
   * @param {Object} config - Configuration object
   * @returns {Container} Configured container
   */
  static create(config) {
    const container = new Container();

    // Register services
    container.register("groqService", () => {
      const GroqService = require("./shared/services/GroqService");
      return new GroqService(config.groqApiKey);
    });

    container.register("flashcardGenerationService", () => {
      const FlashcardGenerationService = require("./shared/services/FlashcardGenerationService");
      return new FlashcardGenerationService(config.groqApiKey);
    });

    container.register("quizGenerationService", () => {
      const QuizGenerationService = require("./shared/services/QuizGenerationService");
      return new QuizGenerationService(config.groqApiKey);
    });

    container.register("trueFalseGenerationService", () => {
      const TrueFalseGenerationService = require("./shared/services/TrueFalseGenerationService");
      return new TrueFalseGenerationService(config.groqApiKey);
    });

    container.register("fileService", () => {
      const FileService = require("./shared/services/FileService");
      return new FileService();
    });

    container.register("documentProcessingService", () => {
      const DocumentProcessingService = require("./shared/services/DocumentProcessingService");
      return new DocumentProcessingService();
    });

    container.register("generationJobService", () => {
      const GenerationJobService = require("./modules/flashcards/services/GenerationJobService");
      return new GenerationJobService();
    });

    container.register("flashCardService", (c) => {
      const FlashCardService = require("./modules/flashcards/services/FlashCardService");
      return new FlashCardService(
        c.get("flashcardGenerationService"),
        c.get("fileService"),
        c.get("documentProcessingService"),
        c.get("flashCardRepository"),
        c.get("categoryService"),
      );
    });

    container.register("flashCardRepository", () => {
      const SupabaseFlashCardRepository = require("./modules/flashcards/repositories/implementations/SupabaseFlashCardRepository");
      return new SupabaseFlashCardRepository();
    });

    container.register("manualFlashCardService", (c) => {
      const ManualFlashCardService = require("./modules/flashcards/services/ManualFlashCardService");
      return new ManualFlashCardService(
        c.get("flashCardRepository"),
        c.get("categoryService"),
      );
    });

    container.register("authRepository", () => {
      const SupabaseAuthRepository = require("./modules/auth/repositories/implementations/SupabaseAuthRepository");
      return new SupabaseAuthRepository();
    });

    container.register("authService", (c) => {
      const AuthService = require("./modules/auth/services/AuthService");
      return new AuthService(c.get("authRepository"), c.get("categoryService"));
    });

    container.register("authController", (c) => {
      const AuthController = require("./modules/auth/controllers/AuthController");
      return new AuthController(c.get("authService"));
    });

    container.register("authRoutes", (c) => {
      const AuthRoutes = require("./modules/auth/routes/AuthRoutes");
      return new AuthRoutes(c.get("authController"));
    });

    container.register("flashCardController", (c) => {
      const FlashCardController = require("./modules/flashcards/controllers/FlashCardController");
      return new FlashCardController(
        c.get("flashCardService"),
        c.get("manualFlashCardService"),
        c.get("generationJobService"),
      );
    });

    container.register("flashCardRoutes", (c) => {
      const createFlashCardRouter = require("./modules/flashcards/routes/flashCardRoutes");
      return createFlashCardRouter(c.get("flashCardController"));
    });

    // Category services
    container.register("categoryRepository", () => {
      const SupabaseCategoryRepository = require("./modules/categories/repositories/implementations/SupabaseCategoryRepository");
      return new SupabaseCategoryRepository();
    });

    container.register("categoryService", (c) => {
      const CategoryService = require("./modules/categories/services/CategoryService");
      return new CategoryService(c.get("categoryRepository"));
    });

    container.register("categoryController", (c) => {
      const CategoryController = require("./modules/categories/controllers/CategoryController");
      return new CategoryController(c.get("categoryService"));
    });

    container.register("categoryRoutes", (c) => {
      const createCategoryRouter = require("./modules/categories/routes");
      return createCategoryRouter(c.get("categoryController"));
    });

    // Quiz services
    container.register("quizRepository", () => {
      const SupabaseQuizRepository = require("./modules/quizzes/repositories/implementations/SupabaseQuizRepository");
      return new SupabaseQuizRepository();
    });

    container.register("quizService", (c) => {
      const QuizService = require("./modules/quizzes/services/QuizService");
      return new QuizService(
        c.get("quizRepository"),
        c.get("categoryService"),
        c.get("quizGenerationService"),
        c.get("fileService"),
        c.get("documentProcessingService"),
      );
    });

    container.register("quizController", (c) => {
      const QuizController = require("./modules/quizzes/controllers/QuizController");
      return new QuizController(c.get("quizService"));
    });

    container.register("quizRoutes", (c) => {
      const createQuizRouter = require("./modules/quizzes/routes/quizRoutes");
      return createQuizRouter(c.get("quizController"));
    });

    // True/False services
    container.register("trueFalseRepository", () => {
      const SupabaseTrueFalseRepository = require("./modules/truefalse/repositories/implementations/SupabaseTrueFalseRepository");
      return new SupabaseTrueFalseRepository();
    });

    container.register("trueFalseService", (c) => {
      const TrueFalseService = require("./modules/truefalse/services/TrueFalseService");
      return new TrueFalseService(
        c.get("trueFalseRepository"),
        c.get("categoryService"),
        c.get("trueFalseGenerationService"),
        c.get("fileService"),
        c.get("documentProcessingService"),
      );
    });

    container.register("trueFalseController", (c) => {
      const TrueFalseController = require("./modules/truefalse/controllers/TrueFalseController");
      return new TrueFalseController(c.get("trueFalseService"));
    });

    container.register("trueFalseRoutes", (c) => {
      const createTrueFalseRouter = require("./modules/truefalse/routes/trueFalseRoutes");
      return createTrueFalseRouter(c.get("trueFalseController"));
    });

    return container;
  }
}

module.exports = Container;
