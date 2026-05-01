const { createClient } = require("@supabase/supabase-js");
const config = require("../../../../shared/config/config");

/**
 * Supabase-backed repository for generation jobs.
 * Uses the service role key — RLS is enforced via the user_id column in
 * application logic (not Supabase policies), keeping the backend simple.
 */
class SupabaseGenerationJobRepository {
  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
    );
    this.table = "generation_jobs";
  }

  async create(job) {
    const { data, error } = await this.supabase
      .from(this.table)
      .insert([
        {
          id: job.id,
          user_id: job.userId,
          type: job.type,
          status: job.status,
          stage: job.progress?.stage ?? null,
          percent: job.progress?.percent ?? 0,
          metadata: job.metadata ?? null,
          result: null,
          error: null,
          expires_at: job.expiresAt,
        },
      ])
      .select()
      .single();

    if (error) throw new Error(`GenerationJobRepo.create: ${error.message}`);
    return this._toJob(data);
  }

  async findById(jobId, userId) {
    const { data, error } = await this.supabase
      .from(this.table)
      .select("*")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // not found
      throw new Error(`GenerationJobRepo.findById: ${error.message}`);
    }
    return this._toJob(data);
  }

  async update(jobId, userId, patch) {
    const fields = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.progress?.stage !== undefined)
      fields.stage = patch.progress.stage;
    if (patch.progress?.percent !== undefined)
      fields.percent = patch.progress.percent;
    if (patch.result !== undefined) fields.result = patch.result;
    if (patch.error !== undefined) fields.error = patch.error;

    const { data, error } = await this.supabase
      .from(this.table)
      .update(fields)
      .eq("id", jobId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error) throw new Error(`GenerationJobRepo.update: ${error.message}`);
    if (!data) return null;
    return this._toJob(data);
  }

  async deleteExpired() {
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (error)
      console.warn("GenerationJobRepo.deleteExpired error:", error.message);
  }

  _toJob(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      status: row.status,
      progress: { stage: row.stage ?? "En cola", percent: row.percent ?? 0 },
      metadata: row.metadata ?? {},
      result: row.result ?? null,
      error: row.error ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    };
  }
}

module.exports = SupabaseGenerationJobRepository;
