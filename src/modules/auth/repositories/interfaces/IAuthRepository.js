/**
 * Interface for authentication repository operations
 * Defines the contract for user authentication and session management
 * Follows Interface Segregation Principle - focused on auth operations
 */
class IAuthRepository {
  /**
   * Creates a new user account
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} metadata - Additional user metadata
   * @returns {Promise<Object>} User data and session
   */
  async signUp(email, password, metadata) {
    throw new Error("Method signUp must be implemented");
  }

  /**
   * Signs in a user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User data and session
   */
  async signIn(email, password) {
    throw new Error("Method signIn must be implemented");
  }

  /**
   * Signs in a user with OAuth provider
   * @param {string} provider - OAuth provider
   * @param {string} redirectTo - Redirect URL after auth
   * @returns {Promise<Object>} OAuth URL for redirection
   */
  async signInWithOAuth(provider, redirectTo) {
    throw new Error("Method signInWithOAuth must be implemented");
  }

  /**
   * Signs out the current user
   * @param {string} userId - User ID to sign out
   * @returns {Promise<boolean>} Success status
   */
  async signOut(userId) {
    throw new Error("Method signOut must be implemented");
  }

  /**
   * Gets user data by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User data or null if not found
   */
  async getUserById(userId) {
    throw new Error("Method getUserById must be implemented");
  }

  /**
   * Resets user password
   * @param {string} email - User email
   * @returns {Promise<boolean>} Success status
   */
  async resetPassword(email) {
    throw new Error("Method resetPassword must be implemented");
  }

  /**
   * Updates user password
   * @param {string} userId - User ID
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  async updatePassword(userId, newPassword) {
    throw new Error("Method updatePassword must be implemented");
  }

  /**
   * Verifies if a session token is valid
   * @param {string} token - JWT token
   * @returns {Promise<Object|null>} User data if valid, null if invalid
   */
  async verifySession(token) {
    throw new Error("Method verifySession must be implemented");
  }
}

module.exports = IAuthRepository;
