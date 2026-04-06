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
      const GroqService = require("./services/GroqService");
      return new GroqService(config.groqApiKey);
    });

    container.register("fileService", () => {
      const FileService = require("./services/FileService");
      return new FileService();
    });

    container.register("documentProcessingService", () => {
      const DocumentProcessingService = require("./services/DocumentProcessingService");
      return new DocumentProcessingService();
    });

    container.register("flashCardService", (c) => {
      const FlashCardService = require("./services/FlashCardService");
      return new FlashCardService(
        c.get("groqService"),
        c.get("fileService"),
        c.get("documentProcessingService"),
      );
    });

    container.register("flashCardController", (c) => {
      const FlashCardController = require("./controllers/FlashCardController");
      return new FlashCardController(c.get("flashCardService"));
    });

    return container;
  }
}

module.exports = Container;
