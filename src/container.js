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
      const GroqService = require("./modules/flashcards/services/GroqService");
      return new GroqService(config.groqApiKey);
    });

    container.register("fileService", () => {
      const FileService = require("./modules/flashcards/services/FileService");
      return new FileService();
    });

    container.register("documentProcessingService", () => {
      const DocumentProcessingService = require("./modules/flashcards/services/DocumentProcessingService");
      return new DocumentProcessingService();
    });

    container.register("flashCardService", (c) => {
      const FlashCardService = require("./modules/flashcards/services/FlashCardService");
      return new FlashCardService(
        c.get("groqService"),
        c.get("fileService"),
        c.get("documentProcessingService"),
        c.get("flashCardRepository"),
      );
    });

    container.register("flashCardRepository", () => {
      const SupabaseFlashCardRepository = require("./modules/flashcards/repositories/implementations/SupabaseFlashCardRepository");
      return new SupabaseFlashCardRepository();
    });

    container.register("manualFlashCardService", (c) => {
      const ManualFlashCardService = require("./modules/flashcards/services/ManualFlashCardService");
      return new ManualFlashCardService(c.get("flashCardRepository"));
    });

    container.register("authRepository", () => {
      const SupabaseAuthRepository = require("./modules/auth/repositories/implementations/SupabaseAuthRepository");
      return new SupabaseAuthRepository();
    });

    container.register("authService", (c) => {
      const AuthService = require("./modules/auth/services/AuthService");
      return new AuthService(c.get("authRepository"));
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
        c.get("flashCardRepository"),
      );
    });

    container.register("flashCardRoutes", (c) => {
      const createFlashCardRouter = require("./modules/flashcards/routes/flashCardRoutes");
      return createFlashCardRouter(c.get("flashCardController"));
    });

    return container;
  }
}

module.exports = Container;
