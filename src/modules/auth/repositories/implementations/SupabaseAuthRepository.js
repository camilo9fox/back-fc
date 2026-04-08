const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");

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
      const { data, error } = await this.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email for development
        user_metadata: metadata,
      });

      if (error) {
        console.error("Supabase signUp error:", error);
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
      console.error("SupabaseAuthRepository.signUp error:", error);
      throw error;
    }
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
        console.error("Supabase signIn error:", error);
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
      console.error("SupabaseAuthRepository.signIn error:", error);
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
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo || `${process.env.FRONTEND_URL}/auth/callback`,
        },
      });

      if (error) {
        console.error("Supabase OAuth signIn error:", error);
        throw new Error(`Error with OAuth: ${error.message}`);
      }

      return {
        url: data.url,
      };
    } catch (error) {
      console.error("SupabaseAuthRepository.signInWithOAuth error:", error);
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
      const { error } = await this.supabase.auth.admin.signOut(userId);

      if (error) {
        console.error("Supabase signOut error:", error);
        throw new Error(`Error signing out: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error("SupabaseAuthRepository.signOut error:", error);
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
        console.error("Supabase getUserById error:", error);
        return null;
      }

      return {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
        metadata: data.user.user_metadata,
      };
    } catch (error) {
      console.error("SupabaseAuthRepository.getUserById error:", error);
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
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL}/auth/reset-password`,
      });

      if (error) {
        console.error("Supabase resetPassword error:", error);
        throw new Error(`Error resetting password: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error("SupabaseAuthRepository.resetPassword error:", error);
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
        console.error("Supabase updatePassword error:", error);
        throw new Error(`Error updating password: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error("SupabaseAuthRepository.updatePassword error:", error);
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
      console.error("SupabaseAuthRepository.verifySession error:", error);
      return null;
    }
  }
}

module.exports = SupabaseAuthRepository;
