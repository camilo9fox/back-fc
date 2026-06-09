const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");
const logger = require("../../../../shared/config/logger");

/**
 * Repository for authentication operations using Supabase Auth
 * Handles user registration, login, and session management
 * Follows Single Responsibility Principle - only auth operations
 */
class SupabaseAuthRepository {
  constructor() {
    // Use service role for backend operations
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );

    // Client for user-facing auth (needed for signUp to trigger confirmation emails)
    this.supabaseAnonClient = createClient(
      config.supabase.url,
      config.supabase.anonKey,
    );

    // Client for user-facing operations (when we need to act as the user)
    this.supabaseUserClient = null;
  }

  /**
   * Creates a new user account with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} metadata - Additional user metadata
   * @returns {Promise<Object>} User data and session
   */
  async signUp(email, password, metadata = {}) {
    try {
      const isProduction = process.env.NODE_ENV === "production";

      if (isProduction) {
        // Production: use public signUp() so Supabase sends verification email
        const { data, error } = await this.supabaseAnonClient.auth.signUp({
          email,
          password,
          options: {
            data: metadata,
          },
        });

        if (error) {
          logger.error("Supabase signUp error:", error);
          throw new Error(`Error creating user: ${error.message}`);
        }

        return {
          user: {
            id: data.user.id,
            email: data.user.email,
            created_at: data.user.created_at,
            metadata: data.user.user_metadata,
          },
        };
      }

      // Development: use admin.createUser with auto-confirm
      const { data, error } = await this.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (error) {
        logger.error("Supabase signUp error:", error);
        throw new Error(`Error creating user: ${error.message}`);
      }

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at,
          metadata: data.user.user_metadata,
        },
      };
    } catch (error) {
      logger.error("SupabaseAuthRepository.signUp error:", error);
      throw error;
    }
  }

  /**
   * Resends the email verification link.
   * @param {string} email - User email
   */
  async resendVerification(email) {
    const { error } = await this.supabaseAnonClient.auth.resend({
      type: "signup",
      email,
    });
    if (error) throw new Error(`Error resending verification: ${error.message}`);
  }

  /**
   * Signs in a user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User data and session
   */
  async signIn(email, password) {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error("Supabase signIn error:", error);
        throw new Error(`Error signing in: ${error.message}`);
      }

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at,
          metadata: data.user.user_metadata,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      };
    } catch (error) {
      logger.error("SupabaseAuthRepository.signIn error:", error);
      throw error;
    }
  }

  /**
   * Signs in a user with OAuth provider (Google, GitHub, etc.)
   * @param {string} provider - OAuth provider ('google', 'github', etc.)
   * @param {string} redirectTo - Redirect URL after auth
   * @returns {Promise<Object>} OAuth URL for redirection
   */
  async signInWithOAuth(provider, redirectTo = null) {
    try {
      const frontendUrl = (
        process.env.FRONTEND_URL ||
        config.corsOptions.origin ||
        "http://localhost:3000"
      ).replace(/\/$/, "");

      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo || `${frontendUrl}/auth/callback`,
        },
      });

      if (error) {
        logger.error("Supabase OAuth signIn error:", error);
        throw new Error(`Error with OAuth: ${error.message}`);
      }

      return {
        url: data.url,
      };
    } catch (error) {
      logger.error("SupabaseAuthRepository.signInWithOAuth error:", error);
      throw error;
    }
  }

  /**
   * Signs out the current user
   * @param {string} userId - User ID to sign out
   * @returns {Promise<boolean>} Success status
   */
  async signOut(userId) {
    try {
      // Supabase admin.signOut expects a JWT, not a user UUID.
      // Session revocation in this backend is handled at the app layer via:
      // - refresh token blocklist
      // - tokenVersion invalidation stored in user metadata
      // Therefore this repository method is intentionally a no-op.
      void userId;
      return true;
    } catch (error) {
      logger.error("SupabaseAuthRepository.signOut error:", error);
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
      const { data, error } =
        await this.supabase.auth.admin.getUserById(userId);

      if (error) {
        logger.error("Supabase getUserById error:", error);
        return null;
      }

      return {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
        metadata: data.user.user_metadata,
      };
    } catch (error) {
      logger.error("SupabaseAuthRepository.getUserById error:", error);
      return null;
    }
  }

  /**
   * Resets user password
   * @param {string} email - User email
   * @returns {Promise<boolean>} Success status
   */
  async resetPassword(email) {
    try {
      const frontendUrl = (
        process.env.FRONTEND_URL ||
        config.corsOptions.origin ||
        "http://localhost:3000"
      ).replace(/\/$/, "");

      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${frontendUrl}/auth/reset-password`,
      });

      if (error) {
        logger.error("Supabase resetPassword error:", error);
        throw new Error(`Error resetting password: ${error.message}`);
      }

      return true;
    } catch (error) {
      logger.error("SupabaseAuthRepository.resetPassword error:", error);
      throw error;
    }
  }

  /**
   * Updates user password
   * @param {string} userId - User ID
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  async updatePassword(userId, newPassword) {
    try {
      const { error } = await this.supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (error) {
        logger.error("Supabase updatePassword error:", error);
        throw new Error(`Error updating password: ${error.message}`);
      }

      return true;
    } catch (error) {
      logger.error("SupabaseAuthRepository.updatePassword error:", error);
      throw error;
    }
  }

  /**
   * Updates user profile (email and/or user_metadata)
   * @param {string} userId
   * @param {{ email?: string, metadata?: object }} updates
   */
  async updateUser(userId, { email, metadata } = {}) {
    try {
      const payload = {};
      if (email) payload.email = email;
      if (metadata) payload.user_metadata = metadata;

      const { data, error } = await this.supabase.auth.admin.updateUserById(
        userId,
        payload,
      );

      if (error) {
        logger.error("Supabase updateUser error:", error);
        throw new Error(`Error updating user: ${error.message}`);
      }

      return {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
        metadata: data.user.user_metadata,
      };
    } catch (error) {
      logger.error("SupabaseAuthRepository.updateUser error:", error);
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
      const { error } = await this.supabase.auth.admin.deleteUser(userId);

      if (error) {
        logger.error("Supabase deleteUser error:", error);
        throw new Error(`Error deleting account: ${error.message}`);
      }

      return true;
    } catch (error) {
      logger.error("SupabaseAuthRepository.deleteAccount error:", error);
      throw error;
    }
  }

  /**
   * Verifies if a session token is valid
   * @param {string} token - JWT token
   * @returns {Promise<Object|null>} User data if valid, null if invalid
   */
  async verifySession(token) {
    try {
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error || !data.user) {
        return null;
      }

      return {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
        metadata: data.user.user_metadata,
      };
    } catch (error) {
      logger.error("SupabaseAuthRepository.verifySession error:", error);
      return null;
    }
  }
}

module.exports = SupabaseAuthRepository;
