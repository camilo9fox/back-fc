/**
 * Application configuration
 */
const config = {
  port: process.env.PORT || 5000,
  corsOptions: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
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
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      (process.env.JWT_SECRET
        ? process.env.JWT_SECRET + "_refresh"
        : undefined),
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
    maxAge: 15 * 60 * 1000, // 15 minutes in ms (access token)
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
};

module.exports = config;
