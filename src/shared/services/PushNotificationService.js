const logger = require("../config/logger");

let firebaseApp = null;

class PushNotificationService {
  constructor(pushTokenRepository) {
    this.pushTokenRepository = pushTokenRepository;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      const serviceAccount = this._loadServiceAccount();
      if (!serviceAccount) {
        logger.warn(
          "PushNotificationService: no Firebase credentials found — push notifications disabled",
        );
        return;
      }

      const admin = require("firebase-admin");
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.initialized = true;
      logger.info("PushNotificationService: Firebase Admin inicializado");
    } catch (err) {
      logger.warn(
        `PushNotificationService: failed to initialize (${err.message}) — push notifications disabled`,
      );
    }
  }

  _loadServiceAccount() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch {
        return null;
      }
    }

    const path = require("path");
    const fs = require("fs");
    const jsonPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "firebase-service-account.json");

    try {
      if (fs.existsSync(jsonPath)) {
        return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Send push notification to all devices of a user.
   * @param {string} userId
   * @param {{ title: string, body: string, data?: object }} payload
   */
  async sendToUser(userId, { title, body, data } = {}) {
    if (!this.initialized) return;

    try {
      const tokens = await this.pushTokenRepository.getTokensByUserId(userId);
      if (!tokens.length) return;

      const messages = tokens.map(({ token }) => ({
        notification: { title, body },
        data: data || {},
        token,
      }));

      const admin = require("firebase-admin");
      const results = await Promise.allSettled(
        messages.map((msg) => admin.messaging().send(msg)),
      );

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        logger.warn(
          `PushNotificationService: ${failed.length}/${messages.length} push fallaron`,
        );
      }
    } catch (err) {
      logger.warn(`PushNotificationService: sendToUser failed (${err.message})`);
    }
  }
}

module.exports = PushNotificationService;
