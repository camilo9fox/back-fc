/**
 * Reusable GroqService mock.
 * Exposes jest.fn() stubs for every public method used across services.
 *
 * Usage in tests:
 *   jest.mock('../../src/shared/services/GroqService');
 *   const GroqService = require('../../src/shared/services/GroqService');
 *   GroqService.mockImplementation(() => groqMock);
 */

const groqMock = {
  generateFlashCards: jest.fn(),
  generateQuiz: jest.fn(),
  generateTrueFalse: jest.fn(),
  generateCompletion: jest.fn(),
  generateWithFallback: jest.fn(),
};

/**
 * Resets all stubs between tests.
 */
function resetGroqMock() {
  Object.values(groqMock).forEach((fn) => fn.mockReset());
}

module.exports = { groqMock, resetGroqMock };
