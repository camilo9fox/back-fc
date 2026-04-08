const jwt = require("jsonwebtoken");
const config = require("../config/config");

/**
 * Authentication middleware
 * Verifies JWT tokens and adds user information to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Token de acceso requerido",
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
      };
      next();
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError);
      return res.status(401).json({
        error: "Token inválido o expirado",
      });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info if token is present, but doesn't fail if missing
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = {
          id: decoded.userId,
          email: decoded.email,
        };
      } catch (jwtError) {
        // Ignore JWT errors for optional auth
        console.log("Optional auth failed, continuing without user");
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next(); // Continue even if there's an error
  }
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
};
