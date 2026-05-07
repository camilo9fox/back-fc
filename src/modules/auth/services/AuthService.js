const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../../../shared/config/config");
const logger = require("../../../shared/config/logger");
const {
  ValidationError,
  ConflictError,
  NotFoundError,
} = require("../../../shared/errors/AppError");

const ONBOARDING_DAILY_TIME_OPTIONS = new Set(["10-15", "20-30", "45+"]);
const ONBOARDING_FORMAT_OPTIONS = new Set(["flashcards", "quizzes", "mixed"]);
const ONBOARDING_LEVEL_OPTIONS = new Set([
  "school",
  "university",
  "professional",
]);
const ONBOARDING_WEEKLY_DAYS_OPTIONS = new Set([3, 5, 7]);
const ONBOARDING_SESSION_OPTIONS = new Set([
  "morning",
  "afternoon",
  "night",
  "flexible",
]);

// In-memory blocklist for revoked refresh tokens.
// Map<tokenHash, expiresAtMs> — entries are pruned every 30 min so the map
// never grows unboundedly. Resets on server restart (acceptable for our scale).
const revokedRefreshTokens = new Map();

// Prune expired entries every 30 minutes
const BLOCKLIST_PRUNE_INTERVAL = 30 * 60 * 1000;
const pruneBlocklist = () => {
  const now = Date.now();
  for (const [hash, expiresAt] of revokedRefreshTokens) {
    if (expiresAt <= now) revokedRefreshTokens.delete(hash);
  }
};
setInterval(pruneBlocklist, BLOCKLIST_PRUNE_INTERVAL).unref();

/**
 * Service for authentication business logic
 * Handles JWT token generation and user validation
 * Follows Single Responsibility Principle - only auth business logic
 */
class AuthService {
  constructor(authRepository, categoryService) {
    this.authRepository = authRepository;
    this.categoryService = categoryService;
  }

  /**
   * Registers a new user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} metadata - Additional user metadata
   * @returns {Promise<Object>} User data and JWT token
   */
  async signUp(email, password, metadata = {}) {
    try {
      // Validate input
      this._validateEmail(email);
      this._validatePassword(password);

      // Create user in Supabase with plaintext password.
      // Supabase handles storage and hashing internally.
      const result = await this.authRepository.signUp(
        email,
        password,
        metadata,
      );

      // Create default "General" category for the new user
      try {
        await this.categoryService.createCategory({
          title: "General",
          description:
            "Categoría por defecto para flashcards sin categoría asignada",
          userId: result.user.id,
        });
      } catch (categoryError) {
        console.warn(
          "Failed to create default category for user:",
          categoryError,
        );
        // Don't fail registration if category creation fails
      }

      // Generate JWT access + refresh tokens
      const { accessToken, refreshToken } = this._generateTokens(result.user);

      return {
        user: result.user,
        token: accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error("AuthService.signUp error:", error);
      throw error;
    }
  }

  /**
   * Signs in a user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User data and JWT token
   */
  async signIn(email, password) {
    try {
      // Validate input
      this._validateEmail(email);
      if (!password) {
        throw new ValidationError("Password is required");
      }

      // Sign in with Supabase
      const result = await this.authRepository.signIn(email, password);

      // Generate JWT access + refresh tokens
      const { accessToken, refreshToken } = this._generateTokens(result.user);

      return {
        user: result.user,
        token: accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error("AuthService.signIn error:", error);
      throw error;
    }
  }

  /**
   * Signs in a user with OAuth provider
   * @param {string} provider - OAuth provider ('google', 'github', etc.)
   * @param {string} redirectTo - Redirect URL after auth
   * @returns {Promise<Object>} OAuth URL for redirection
   */
  async signInWithOAuth(provider, redirectTo = null) {
    try {
      // Validate provider
      const validProviders = ["google", "github", "discord"];
      if (!validProviders.includes(provider.toLowerCase())) {
        throw new ValidationError(`Unsupported OAuth provider: ${provider}`);
      }

      return await this.authRepository.signInWithOAuth(
        provider.toLowerCase(),
        redirectTo,
      );
    } catch (error) {
      console.error("AuthService.signInWithOAuth error:", error);
      throw error;
    }
  }

  /**
   * Signs out a user
   * @param {string} userId - User ID to sign out
   * @returns {Promise<boolean>} Success status
   */
  async signOut(userId) {
    try {
      if (!userId) {
        throw new ValidationError("User ID is required");
      }

      return await this.authRepository.signOut(userId);
    } catch (error) {
      console.error("AuthService.signOut error:", error);
      throw error;
    }
  }

  /**
   * Gets user data by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User data or null if not found
   */
  async getUserById(userId) {
    try {
      if (!userId) {
        throw new ValidationError("User ID is required");
      }

      return await this.authRepository.getUserById(userId);
    } catch (error) {
      console.error("AuthService.getUserById error:", error);
      throw error;
    }
  }

  /**
   * Resets user password
   * @param {string} email - User email
   * @returns {Promise<boolean>} Success status
   */
  async resetPassword(email) {
    try {
      this._validateEmail(email);

      return await this.authRepository.resetPassword(email);
    } catch (error) {
      console.error("AuthService.resetPassword error:", error);
      throw error;
    }
  }

  /**
   * Updates user profile (name and/or email)
   * @param {string} userId
   * @param {{ name?: string, email?: string }} fields
   */
  async updateProfile(userId, { name, email } = {}) {
    try {
      if (!userId) throw new ValidationError("User ID is required");

      const currentUser = await this.authRepository.getUserById(userId);
      if (!currentUser) {
        throw new NotFoundError("User not found");
      }

      const currentMetadata = currentUser.metadata || {};

      const updates = {};
      if (email) {
        this._validateEmail(email);
        updates.email = email;
      }
      if (name !== undefined) {
        updates.metadata = {
          ...currentMetadata,
          full_name: name,
        };
      }

      return await this.authRepository.updateUser(userId, updates);
    } catch (error) {
      logger.error("AuthService.updateProfile error:", error);
      throw error;
    }
  }

  /**
   * Gets onboarding profile for the current user
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  async getOnboardingProfile(userId) {
    try {
      if (!userId) throw new ValidationError("User ID is required");

      const user = await this.authRepository.getUserById(userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      return user.metadata?.onboardingProfile || null;
    } catch (error) {
      logger.error("AuthService.getOnboardingProfile error:", error);
      throw error;
    }
  }

  /**
   * Updates onboarding profile for the current user
   * @param {string} userId
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async updateOnboardingProfile(userId, payload = {}) {
    try {
      if (!userId) throw new ValidationError("User ID is required");

      this._validateOnboardingProfile(payload);

      const user = await this.authRepository.getUserById(userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      const metadata = user.metadata || {};
      const currentProfile = metadata.onboardingProfile || {};

      const nextProfile = {
        ...currentProfile,
        ...payload,
        updatedAt: new Date().toISOString(),
      };

      if (nextProfile.introSeen && !nextProfile.completedAt) {
        nextProfile.completedAt = new Date().toISOString();
      }

      await this.authRepository.updateUser(userId, {
        metadata: {
          ...metadata,
          onboardingProfile: nextProfile,
          introSeen: Boolean(nextProfile.introSeen),
        },
      });

      return nextProfile;
    } catch (error) {
      logger.error("AuthService.updateOnboardingProfile error:", error);
      throw error;
    }
  }

  /**
   * Updates user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  async updatePassword(userId, currentPassword, newPassword) {
    try {
      if (!userId) {
        throw new ValidationError("User ID is required");
      }

      this._validatePassword(newPassword);

      // Verify current password by attempting sign in
      const user = await this.getUserById(userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      // For now, we'll just update the password directly
      // In a production app, you'd want to verify the current password first
      return await this.authRepository.updatePassword(userId, newPassword);
    } catch (error) {
      console.error("AuthService.updatePassword error:", error);
      throw error;
    }
  }

  /**
   * Deletes a user account and all associated data
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteAccount(userId) {
    try {
      if (!userId) {
        throw new ValidationError("User ID is required");
      }

      return await this.authRepository.deleteAccount(userId);
    } catch (error) {
      console.error("AuthService.deleteAccount error:", error);
      throw error;
    }
  }

  /**
   * Verifies a JWT token and returns user data
   * @param {string} token - JWT token
   * @returns {Promise<Object|null>} User data if valid, null if invalid
   */
  async verifyToken(token) {
    try {
      if (!token) {
        return null;
      }

      // First verify with our JWT secret
      const decoded = jwt.verify(token, config.jwt.secret);

      // Then verify with Supabase to ensure user still exists
      const user = await this.authRepository.verifySession(token);

      if (!user || user.id !== decoded.userId) {
        return null;
      }

      return user;
    } catch (error) {
      console.error("AuthService.verifyToken error:", error);
      return null;
    }
  }

  /**
   * Generates both access and refresh tokens for a user.
   * @param {Object} user - User data
   * @returns {{ accessToken: string, refreshToken: string }}
   */
  _generateTokens(user) {
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refreshes the access token using a valid refresh token.
   * Rotates the refresh token (old one is revoked, new one issued).
   * @param {string} refreshToken - The current refresh token
   * @returns {{ accessToken: string, refreshToken: string, user: Object }}
   */
  async refreshSession(refreshToken) {
    if (!refreshToken) {
      throw new ValidationError("Refresh token is required");
    }

    // Check if this refresh token was explicitly revoked (logout)
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const revokedEntry = revokedRefreshTokens.get(tokenHash);
    if (revokedEntry && revokedEntry > Date.now()) {
      throw new ValidationError("Refresh token has been revoked");
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch (error) {
      throw new ValidationError("Invalid or expired refresh token");
    }

    // Verify the user still exists
    const user = await this.authRepository.getUserById(decoded.userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Revoke the old refresh token (rotation) — store with its expiry time
    const expiresAtMs = decoded.exp
      ? decoded.exp * 1000
      : Date.now() + 7 * 24 * 60 * 60 * 1000;
    revokedRefreshTokens.set(tokenHash, expiresAtMs);

    // Generate new token pair
    return { ...this._generateTokens(user), user };
  }

  /**
   * Revokes a refresh token (called on logout).
   * @param {string} refreshToken - Refresh token to revoke
   */
  revokeRefreshToken(refreshToken) {
    if (!refreshToken) return;
    let decoded;
    try {
      // We decode without verification just to get the expiry time for the TTL
      decoded = jwt.decode(refreshToken);
    } catch {
      decoded = null;
    }
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    // Store with the token's own expiry so the blocklist entry is pruned naturally
    const expiresAtMs = decoded?.exp
      ? decoded.exp * 1000
      : Date.now() + 7 * 24 * 60 * 60 * 1000;
    revokedRefreshTokens.set(tokenHash, expiresAtMs);
  }

  /**
   * Generates a JWT token for a user (legacy — prefer _generateTokens)
   * @param {Object} user - User data
   * @returns {string} JWT token
   */
  _generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
      },
    );
  }

  /**
   * Validates email format
   * @param {string} email - Email to validate
   */
  _validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new ValidationError("Invalid email format");
    }
  }

  /**
   * Validates password strength
   * @param {string} password - Password to validate
   */
  _validatePassword(password) {
    if (!password || password.length < 8) {
      throw new ValidationError("Password must be at least 8 characters long");
    }

    // Check for at least one uppercase, one lowercase, and one number
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      throw new ValidationError(
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      );
    }
  }

  /**
   * Validates onboarding profile payload
   * @param {Object} payload
   */
  _validateOnboardingProfile(payload = {}) {
    if (
      payload.goals !== undefined &&
      (!Array.isArray(payload.goals) ||
        payload.goals.some((goal) => typeof goal !== "string" || !goal.trim()))
    ) {
      throw new ValidationError("goals must be an array of non-empty strings");
    }

    if (
      payload.dailyTime !== undefined &&
      !ONBOARDING_DAILY_TIME_OPTIONS.has(payload.dailyTime)
    ) {
      throw new ValidationError("dailyTime must be one of: 10-15, 20-30, 45+");
    }

    if (
      payload.preferredFormat !== undefined &&
      !ONBOARDING_FORMAT_OPTIONS.has(payload.preferredFormat)
    ) {
      throw new ValidationError(
        "preferredFormat must be one of: flashcards, quizzes, mixed",
      );
    }

    if (
      payload.studyLevel !== undefined &&
      !ONBOARDING_LEVEL_OPTIONS.has(payload.studyLevel)
    ) {
      throw new ValidationError(
        "studyLevel must be one of: school, university, professional",
      );
    }

    if (
      payload.weeklyGoalDays !== undefined &&
      !ONBOARDING_WEEKLY_DAYS_OPTIONS.has(payload.weeklyGoalDays)
    ) {
      throw new ValidationError("weeklyGoalDays must be one of: 3, 5, 7");
    }

    if (
      payload.sessionPreference !== undefined &&
      !ONBOARDING_SESSION_OPTIONS.has(payload.sessionPreference)
    ) {
      throw new ValidationError(
        "sessionPreference must be one of: morning, afternoon, night, flexible",
      );
    }

    if (
      payload.challengeAreas !== undefined &&
      (!Array.isArray(payload.challengeAreas) ||
        payload.challengeAreas.some(
          (challenge) =>
            typeof challenge !== "string" || !challenge.trim().length,
        ))
    ) {
      throw new ValidationError(
        "challengeAreas must be an array of non-empty strings",
      );
    }

    if (
      payload.examDate !== undefined &&
      payload.examDate !== null &&
      typeof payload.examDate !== "string"
    ) {
      throw new ValidationError("examDate must be a string or null");
    }

    if (
      payload.examDate &&
      Number.isNaN(new Date(payload.examDate).getTime())
    ) {
      throw new ValidationError("examDate must be a valid ISO date string");
    }

    if (
      payload.recommendedPath !== undefined &&
      (typeof payload.recommendedPath !== "string" ||
        !payload.recommendedPath.startsWith("/"))
    ) {
      throw new ValidationError("recommendedPath must be a valid app path");
    }

    if (
      payload.introSeen !== undefined &&
      typeof payload.introSeen !== "boolean"
    ) {
      throw new ValidationError("introSeen must be a boolean");
    }

    if (
      payload.completedAt !== undefined &&
      payload.completedAt !== null &&
      typeof payload.completedAt !== "string"
    ) {
      throw new ValidationError("completedAt must be a string or null");
    }

    if (
      payload.completedAt &&
      Number.isNaN(new Date(payload.completedAt).getTime())
    ) {
      throw new ValidationError("completedAt must be a valid ISO date string");
    }

    if (payload.skipped !== undefined && typeof payload.skipped !== "boolean") {
      throw new ValidationError("skipped must be a boolean");
    }
  }
}

module.exports = AuthService;
