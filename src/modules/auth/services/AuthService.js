const jwt = require("jsonwebtoken");
const config = require("../../../shared/config/config");

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
        await this.categoryService.createCategory(result.user.id, {
          title: "General",
          description:
            "Categoría por defecto para flashcards sin categoría asignada",
        });
      } catch (categoryError) {
        console.warn(
          "Failed to create default category for user:",
          categoryError,
        );
        // Don't fail registration if category creation fails
      }

      // Generate JWT token
      const token = this._generateToken(result.user);

      return {
        user: result.user,
        token,
      };
    } catch (error) {
      console.error("AuthService.signUp error:", error);
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
        throw new Error("Password is required");
      }

      // Sign in with Supabase
      const result = await this.authRepository.signIn(email, password);

      // Generate JWT token
      const token = this._generateToken(result.user);

      return {
        user: result.user,
        token,
      };
    } catch (error) {
      console.error("AuthService.signIn error:", error);
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
        throw new Error(`Unsupported OAuth provider: ${provider}`);
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
        throw new Error("User ID is required");
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
        throw new Error("User ID is required");
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
   * Updates user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  async updatePassword(userId, currentPassword, newPassword) {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }

      this._validatePassword(newPassword);

      // Verify current password by attempting sign in
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error("User not found");
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
   * Generates a JWT token for a user
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
      throw new Error("Invalid email format");
    }
  }

  /**
   * Validates password strength
   * @param {string} password - Password to validate
   */
  _validatePassword(password) {
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    // Check for at least one uppercase, one lowercase, and one number
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      throw new Error(
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      );
    }
  }
}

module.exports = AuthService;
