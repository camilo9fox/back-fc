const AuthService = require("../services/AuthService");
const { AppError, ConflictError } = require("../../../shared/errors/AppError");
const config = require("../../../shared/config/config");
const logger = require("../../../shared/config/logger");

/**
 * Controller for authentication HTTP requests
 * Handles signup, signin, OAuth, and user management endpoints
 * Follows Single Responsibility Principle - only HTTP request/response handling
 */
class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  /**
   * Registers a new user
   * POST /auth/signup
   */
  async signUp(req, res) {
    try {
      const { email, password, metadata } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: "Email and password are required",
        });
      }

      const result = await this.authService.signUp(email, password, metadata);

      // Set refresh token in httpOnly cookie (not accessible from JS)
      res.cookie("refreshToken", result.refreshToken, config.cookie);
      // Set access token in httpOnly cookie for XSS protection
      res.cookie("accessToken", result.token, config.accessCookie);

      res.status(201).json({
        message: "User created successfully",
        user: {
          id: result.user.id,
          email: result.user.email,
          created_at: result.user.created_at,
        },
        token: result.token,
      });
    } catch (error) {
      logger.error("AuthController.signUp error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      // Supabase returns plain errors for duplicate email
      if (error.message && error.message.includes("already registered")) {
        return res
          .status(409)
          .json({ error: "User already exists with this email" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Signs in a user
   * POST /auth/signin
   */
  async signIn(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: "Email and password are required",
        });
      }

      const result = await this.authService.signIn(email, password);

      // Set refresh token in httpOnly cookie (not accessible from JS)
      res.cookie("refreshToken", result.refreshToken, config.cookie);
      // Set access token in httpOnly cookie for XSS protection
      res.cookie("accessToken", result.token, config.accessCookie);

      res.json({
        message: "Sign in successful",
        user: {
          id: result.user.id,
          email: result.user.email,
          created_at: result.user.created_at,
        },
        token: result.token,
      });
    } catch (error) {
      logger.error("AuthController.signIn error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      // Supabase errors for invalid credentials/unconfirmed email
      if (
        error.message &&
        error.message.includes("Invalid login credentials")
      ) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      if (error.message && error.message.includes("Email not confirmed")) {
        return res
          .status(401)
          .json({ error: "Please confirm your email before signing in" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Initiates OAuth sign in
   * GET /auth/oauth/:provider
   */
  async signInWithOAuth(req, res) {
    try {
      const { provider } = req.params;
      const { redirectTo } = req.query;

      const result = await this.authService.signInWithOAuth(
        provider,
        redirectTo,
      );

      res.json({
        message: "OAuth initiated",
        url: result.url,
      });
    } catch (error) {
      logger.error("AuthController.signInWithOAuth error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Handles OAuth callback
   * GET /auth/callback
   */
  async oauthCallback(req, res) {
    try {
      // This would typically handle the OAuth callback from the provider
      // For now, we'll just return a success message
      // In a real implementation, you'd exchange the code for tokens

      res.json({
        message: "OAuth callback received",
        // In production, you'd redirect to frontend with tokens
      });
    } catch (error) {
      logger.error("AuthController.oauthCallback error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Refreshes access token using the httpOnly refresh token cookie.
   * POST /auth/refresh
   */
  async refresh(req, res) {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ error: "No refresh token provided" });
      }

      const result = await this.authService.refreshSession(refreshToken);

      // Rotate the refresh token cookie
      res.cookie("refreshToken", result.refreshToken, config.cookie);
      // Issue new access token cookie
      res.cookie("accessToken", result.accessToken, config.accessCookie);

      res.json({
        token: result.accessToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          created_at: result.user.created_at,
        },
      });
    } catch (error) {
      logger.error("AuthController.refresh error:", error);
      // Clear the invalid cookie
      res.clearCookie("refreshToken");
      if (error instanceof AppError) {
        return res.status(401).json({ error: error.message });
      }
      res.status(401).json({ error: "Session expired. Please sign in again." });
    }
  }

  /**
   * Signs out a user
   * POST /auth/signout
   */
  async signOut(req, res) {
    try {
      const userId = req.user?.id; // From auth middleware

      if (!userId) {
        return res.status(401).json({
          error: "User not authenticated",
        });
      }

      // Revoke the refresh token before signing out
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        this.authService.revokeRefreshToken(refreshToken);
      }

      await this.authService.signOut(userId);

      // Clear the refresh token cookie
      res.clearCookie("refreshToken");
      // Clear the access token cookie
      res.clearCookie("accessToken");

      res.json({
        message: "Sign out successful",
      });
    } catch (error) {
      logger.error("AuthController.signOut error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Gets current user profile
   * GET /auth/profile
   */
  async getProfile(req, res) {
    try {
      const userId = req.user?.id; // From auth middleware

      if (!userId) {
        return res.status(401).json({
          error: "User not authenticated",
        });
      }

      const user = await this.authService.getUserById(userId);

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          metadata: user.metadata,
        },
      });
    } catch (error) {
      logger.error("AuthController.getProfile error:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  /**
   * Initiates password reset
   * POST /auth/reset-password
   */
  async resetPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: "Email is required",
        });
      }

      await this.authService.resetPassword(email);

      res.json({
        message: "Password reset email sent",
      });
    } catch (error) {
      logger.error("AuthController.resetPassword error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Updates user profile (display name / email)
   * PUT /auth/profile
   */
  async updateProfile(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { name, email } = req.body;

      if (!name && !email) {
        return res.status(400).json({
          error: "Provide at least one field to update: name or email",
        });
      }

      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: "Invalid email format" });
        }
      }

      const updated = await this.authService.updateProfile(userId, {
        name,
        email,
      });

      res.json({ user: updated });
    } catch (error) {
      logger.error("AuthController.updateProfile error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Updates user password
   * PUT /auth/password
   */
  async updatePassword(req, res) {
    try {
      const userId = req.user?.id; // From auth middleware
      const { currentPassword, newPassword } = req.body;

      if (!userId) {
        return res.status(401).json({
          error: "User not authenticated",
        });
      }

      if (!newPassword) {
        return res.status(400).json({
          error: "New password is required",
        });
      }

      await this.authService.updatePassword(
        userId,
        currentPassword,
        newPassword,
      );

      res.json({
        message: "Password updated successfully",
      });
    } catch (error) {
      logger.error("AuthController.updatePassword error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Deletes the authenticated user's account
   * DELETE /auth/account
   */
  async deleteAccount(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      await this.authService.deleteAccount(userId);

      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      logger.error("AuthController.deleteAccount error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = AuthController;
