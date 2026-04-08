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
    maxContentLength: 2500, // ~600 tokens, leaving margin for prompt
    maxFlashCards: 20,
    minFlashCards: 1,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedFileTypes: ["application/pdf", "text/plain"],
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
};

module.exports = config;
