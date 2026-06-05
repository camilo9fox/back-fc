const { randomUUID } = require("crypto");
const logger = require("../../../shared/config/logger");

const JOB_TTL_MS = 1000 * 60 * 30; // 30 minutes

/**
 * GenerationJobService
 *
 * Persists generation jobs to Supabase via an injected repository while
 * keeping an in-memory cache so callers can read job state synchronously
 * (important for the `setImmediate` worker callbacks which need `updateJob`
 * to be available immediately after `createJob` returns).
 */
class GenerationJobService {
  /**
   * @param {import('../repositories/implementations/SupabaseGenerationJobRepository')} [repository]
   *   Optional Supabase repository. When omitted the service is in-memory only
   *   (useful for testing).
   */
  constructor(repository = null, pushNotificationService = null) {
    this.repository = repository;
    this.pushNotificationService = pushNotificationService;
    /** @type {Map<string, object>} in-memory cache */
    this.cache = new Map();

    // Prune expired entries from DB every 30 minutes
    if (repository) {
      setInterval(() => {
        repository.deleteExpired().catch(() => {});
      }, JOB_TTL_MS).unref();
    }
  }

  createJob({ userId, type, metadata = {} }) {
    this._pruneCache();

    const now = new Date().toISOString();
    const job = {
      id: randomUUID(),
      userId,
      type,
      status: "queued",
      progress: { stage: "En cola", percent: 0 },
      metadata,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + JOB_TTL_MS).toISOString(),
    };

    this.cache.set(job.id, job);

    // Persist async — don't block the response
    if (this.repository) {
      this.repository.create(job).catch((err) => {
        logger.warn(
          "GenerationJobService: failed to persist job",
          err.message,
        );
      });
    }

    return this._toPublic(job);
  }

  getJob(jobId, userId) {
    this._pruneCache();
    const cached = this.cache.get(jobId);
    if (cached) {
      if (cached.userId !== userId) return null;
      return this._toPublic(cached);
    }

    // Fallback: try DB (returns a Promise — callers must await)
    if (this.repository) {
      return this.repository
        .findById(jobId, userId)
        .then((row) => (row ? this._toPublic(row) : null));
    }
    return null;
  }

  updateJob(jobId, userId, patch = {}) {
    const cached = this.cache.get(jobId);
    if (!cached || cached.userId !== userId) return null;

    const updated = {
      ...cached,
      ...patch,
      progress: { ...cached.progress, ...(patch.progress ?? {}) },
      updatedAt: new Date().toISOString(),
    };
    this.cache.set(jobId, updated);

    if (this.repository) {
      this.repository.update(jobId, userId, patch).catch((err) => {
        logger.warn("GenerationJobService: failed to update job", err.message);
      });
    }

    return this._toPublic(updated);
  }

  completeJob(jobId, userId, result) {
    const updated = this.updateJob(jobId, userId, {
      status: "completed",
      progress: { stage: "Completado", percent: 100 },
      result,
      error: null,
    });

    // Send push notification (fire-and-forget)
    if (this.pushNotificationService) {
      const typeLabel = this._typeLabel(jobId);
      this.pushNotificationService
        .sendToUser(userId, {
          title: "¡Generación completada!",
          body: `Tu${typeLabel} está listo para revisar.`,
          data: { type: this._getJobType(jobId) },
        })
        .catch(() => {});
    }

    return updated;
  }

  _typeLabel(jobId) {
    const cached = this.cache.get(jobId);
    const type = cached?.type || cached?.metadata?.type || "";
    const labels = {
      flashcards: "s flashcards",
      quiz: " cuestionario",
      truefalse: " set de V/F",
      studyguide: " guía de estudio",
      examsim: " simulación de examen",
    };
    return labels[type] || " contenido";
  }

  _getJobType(jobId) {
    const cached = this.cache.get(jobId);
    return cached?.type || cached?.metadata?.type || "";
  }

  failJob(jobId, userId, error, progress) {
    const patch = {
      status: "failed",
      error,
    };

    if (progress && typeof progress === "object") {
      patch.progress = progress;
    }

    return this.updateJob(jobId, userId, patch);
  }

  _toPublic(job) {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      metadata: job.metadata,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
    };
  }

  _pruneCache() {
    const now = Date.now();
    for (const [id, job] of this.cache.entries()) {
      if (new Date(job.expiresAt).getTime() <= now) this.cache.delete(id);
    }
  }

  // Legacy alias used by tests / older code
  toPublicJob(job) {
    return this._toPublic(job);
  }

  pruneExpiredJobs() {
    this._pruneCache();
  }
}

module.exports = GenerationJobService;
