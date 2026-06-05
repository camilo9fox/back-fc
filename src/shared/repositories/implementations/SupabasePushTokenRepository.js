const { createClient } = require("@supabase/supabase-js");
const config = require("../../config/config");

class SupabasePushTokenRepository {
  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
    this.table = "push_tokens";
  }

  async saveToken(userId, token, platform) {
    const { error } = await this.supabase
      .from(this.table)
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, token" },
      );

    if (error) throw error;
  }

  async removeToken(userId, token) {
    await this.supabase
      .from(this.table)
      .delete()
      .eq("user_id", userId)
      .eq("token", token);
  }

  async getTokensByUserId(userId) {
    const { data, error } = await this.supabase
      .from(this.table)
      .select("token, platform")
      .eq("user_id", userId);

    if (error) return [];
    return data;
  }

  async removeAllTokensForUser(userId) {
    await this.supabase
      .from(this.table)
      .delete()
      .eq("user_id", userId);
  }
}

module.exports = SupabasePushTokenRepository;
