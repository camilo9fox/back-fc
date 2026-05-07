const jwt = require("jsonwebtoken");
const config = require("../config/config");
const logger = require("../config/logger");

/**
 * Authentication middleware
 * Verifies JWT tokens and adds user information to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Accept token from Authorization header OR httpOnly accessToken cookie
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        error: "Token de acceso requerido",
      });
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: ["HS256"],
      });
      req.user = {
        id: decoded.userId,
        email: decoded.email,
      };
      next();
    } catch (jwtError) {
      logger.warn("JWT verification error:", jwtError.message);
      return res.status(401).json({
        error: "Token inválido o expirado",
      });
    }
  } catch (error) {
    logger.error("Auth middleware error:", error);
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
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret, {
          algorithms: ["HS256"],
        });
        req.user = {
          id: decoded.userId,
          email: decoded.email,
        };
      } catch (jwtError) {
        // Ignore JWT errors for optional auth
        logger.debug("Optional auth failed, continuing without user");
      }
    }

    next();
  } catch (error) {
    logger.error("Optional auth middleware error:", error);
    next(); // Continue even if there's an error
  }
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
};
