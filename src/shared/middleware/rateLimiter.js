const rateLimit = require("express-rate-limit");

/**
 * Strict rate limiter for authentication endpoints (signup / signin).
 * 10 requests per 15 minutes per IP prevents brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error:
      "Demasiados intentos de autenticación. Por favor espera 15 minutos e inténtalo de nuevo.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict limiter for password-reset to prevent email flooding.
 * 5 requests per 15 minutes per IP.
 */
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error:
      "Demasiados intentos de restablecimiento. Por favor espera 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API limiter: 200 requests per minute per IP.
 * Protects backend from abuse without impacting normal usage.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Demasiadas solicitudes. Por favor espera un momento." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
});

/**
 * Limiter for AI generation endpoints (costly operations).
 * 20 requests per hour per authenticated user (falls back to IP).
 * Keying by user ID prevents shared-IP bypass (e.g. office/university networks).
 */
const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    error:
      "Límite de generación con IA alcanzado. Por favor espera 1 hora antes de generar más contenido.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Per-user API limiter for authenticated routes: 300 req / min per user.
 * Apply AFTER authMiddleware so req.user is available.
 */
const perUserApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "Demasiadas solicitudes. Por favor espera un momento." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  resetPasswordLimiter,
  apiLimiter,
  aiGenerationLimiter,
  perUserApiLimiter,
};
