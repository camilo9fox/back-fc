const express = require("express");
const AuthController = require("../controllers/AuthController");
const { authMiddleware } = require("../../../shared/middleware/auth");
const {
  authLimiter,
  resetPasswordLimiter,
  perUserApiLimiter,
} = require("../../../shared/middleware/rateLimiter");

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
      authLimiter,
      this.authController.signUp.bind(this.authController),
    );
    this.router.post(
      "/signin",
      authLimiter,
      this.authController.signIn.bind(this.authController),
    );
    this.router.post(
      "/refresh",
      this.authController.refresh.bind(this.authController),
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
      resetPasswordLimiter,
      this.authController.resetPassword.bind(this.authController),
    );

    this.router.post(
      "/resend-verification",
      this.authController.resendVerification.bind(this.authController),
    );

    // Protected routes (authentication required)
    this.router.use(authMiddleware);
    this.router.use(perUserApiLimiter);

    this.router.post(
      "/signout",
      this.authController.signOut.bind(this.authController),
    );
    this.router.get(
      "/profile",
      this.authController.getProfile.bind(this.authController),
    );
    this.router.put(
      "/profile",
      this.authController.updateProfile.bind(this.authController),
    );
    this.router.get(
      "/onboarding-profile",
      this.authController.getOnboardingProfile.bind(this.authController),
    );
    this.router.put(
      "/onboarding-profile",
      this.authController.updateOnboardingProfile.bind(this.authController),
    );
    this.router.put(
      "/password",
      this.authController.updatePassword.bind(this.authController),
    );
    this.router.delete(
      "/account",
      this.authController.deleteAccount.bind(this.authController),
    );

    this.router.post(
      "/push-token",
      this.authController.registerPushToken.bind(this.authController),
    );
  }

  getRouter() {
    return this.router;
  }
}

module.exports = AuthRoutes;
