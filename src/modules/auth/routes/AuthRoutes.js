const express = require("express");
const AuthController = require("../controllers/AuthController");
const { authMiddleware } = require("../../../shared/middleware/auth");

/**
 * Routes for authentication endpoints
 * Defines all auth-related HTTP routes
 * Follows Single Responsibility Principle - only route definitions
 */
class AuthRoutes {
  constructor(authController) {
    this.router = express.Router();
    this.authController = authController;
    this._setupRoutes();
  }

  _setupRoutes() {
    // Public routes (no authentication required)
    this.router.post(
      "/signup",
      this.authController.signUp.bind(this.authController),
    );
    this.router.post(
      "/signin",
      this.authController.signIn.bind(this.authController),
    );
    this.router.get(
      "/oauth/:provider",
      this.authController.signInWithOAuth.bind(this.authController),
    );
    this.router.get(
      "/callback",
      this.authController.oauthCallback.bind(this.authController),
    );
    this.router.post(
      "/reset-password",
      this.authController.resetPassword.bind(this.authController),
    );

    // Protected routes (authentication required)
    this.router.post(
      "/signout",
      authMiddleware,
      this.authController.signOut.bind(this.authController),
    );
    this.router.get(
      "/profile",
      authMiddleware,
      this.authController.getProfile.bind(this.authController),
    );
    this.router.put(
      "/password",
      authMiddleware,
      this.authController.updatePassword.bind(this.authController),
    );
    this.router.delete(
      "/account",
      authMiddleware,
      this.authController.deleteAccount.bind(this.authController),
    );
  }

  getRouter() {
    return this.router;
  }
}

module.exports = AuthRoutes;
