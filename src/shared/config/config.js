/**
 * Application configuration
 */
const config = {
  port: process.env.PORT || 5000,
  corsOptions: {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, Postman)
      if (!origin) return callback(null, true);

      // Allow any local/native origin (Capacitor WebView, dev server, PWA)
      if (
        origin.startsWith("capacitor://") ||
        origin.startsWith("ionic://") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("https://localhost") ||
        origin.startsWith("file://")
      ) {
        return callback(null, true);
      }

      // Allow Vercel preview/production domains
      if (origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }

      // Allow the configured frontend URL
      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl && origin === frontendUrl) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
  limits: {
    maxContentLength: 4500,
    maxFlashCards: 10,
    minFlashCards: 1,
    fileSizeLimit: (Number(process.env.FILE_SIZE_LIMIT_MB) || 50) * 1024 * 1024,
    allowedFileTypes: ["application/pdf", "text/plain"],
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "4h",
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms (refresh token)
  },
  accessCookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 4 * 60 * 60 * 1000, // 4 hours in ms (access token)
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  aiUsage: {
    enabled: String(process.env.AI_USAGE_ENABLED || "true") !== "false",
    weeklyCredits: Number(process.env.AI_WEEKLY_CREDITS) || 30,
    burstWindowSeconds: Number(process.env.AI_BURST_WINDOW_SECONDS) || 300,
    burstLimit: Number(process.env.AI_BURST_LIMIT) || 3,
    costs: {
      flashcards: Number(process.env.AI_COST_FLASHCARDS) || 1,
      quizzes: Number(process.env.AI_COST_QUIZZES) || 1,
      truefalse: Number(process.env.AI_COST_TRUEFALSE) || 1,
      studyguides: Number(process.env.AI_COST_STUDYGUIDES) || 2,
      examsimulation: Number(process.env.AI_COST_EXAM_SIMULATION) || 2,
    },
  },
  contentSafety: {
    enabled: String(process.env.CONTENT_SAFETY_ENABLED || "true") !== "false",
    strictMode: String(process.env.CONTENT_SAFETY_STRICT || "false") !== "false",
    localOnly: String(process.env.CONTENT_SAFETY_LOCAL_ONLY || "true") !== "false",
  },
};

module.exports = config;
