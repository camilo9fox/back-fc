/**
 * Base application error class.
 * All domain errors extend this so controllers can use `instanceof`
 * instead of string-matching on error messages (OCP / Clean Code).
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

/** 400 — invalid input / business rule violation */
class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

/** 404 — resource not found or access denied */
class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404);
  }
}

/** 409 — resource conflict (e.g. duplicate email) */
class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
  }
}

/** 401 — unauthenticated */
class AuthenticationError extends AppError {
  constructor(message) {
    super(message, 401);
  }
}

/** 503 — downstream service unavailable (e.g. circuit breaker open) */
class ServiceUnavailableError extends AppError {
  constructor(message) {
    super(message, 503);
  }
}

/** 429 — request/quota limit reached */
class TooManyRequestsError extends AppError {
  constructor(message) {
    super(message, 429);
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  ServiceUnavailableError,
  TooManyRequestsError,
};
