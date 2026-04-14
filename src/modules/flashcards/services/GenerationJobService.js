const { randomUUID } = require("crypto");

class GenerationJobService {
  constructor() {
    this.jobs = new Map();
    this.JOB_TTL_MS = 1000 * 60 * 30;
  }

  createJob({ userId, type, metadata = {} }) {
    this.pruneExpiredJobs();

    const job = {
      id: randomUUID(),
      userId,
      type,
      status: "queued",
      progress: {
        stage: "En cola",
        percent: 0,
      },
      metadata,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.JOB_TTL_MS).toISOString(),
    };

    this.jobs.set(job.id, job);
    return this.toPublicJob(job);
  }

  getJob(jobId, userId) {
    this.pruneExpiredJobs();
    const job = this.jobs.get(jobId);

    if (!job || job.userId !== userId) {
      return null;
    }

    return this.toPublicJob(job);
  }

  updateJob(jobId, userId, patch = {}) {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      return null;
    }

    const nextJob = {
      ...job,
      ...patch,
      progress: {
        ...job.progress,
        ...(patch.progress || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, nextJob);
    return this.toPublicJob(nextJob);
  }

  completeJob(jobId, userId, result) {
    return this.updateJob(jobId, userId, {
      status: "completed",
      progress: {
        stage: "Completado",
        percent: 100,
      },
      result,
      error: null,
    });
  }

  failJob(jobId, userId, error) {
    return this.updateJob(jobId, userId, {
      status: "failed",
      error,
    });
  }

  toPublicJob(job) {
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

  pruneExpiredJobs() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (new Date(job.expiresAt).getTime() <= now) {
        this.jobs.delete(jobId);
      }
    }
  }
}

module.exports = GenerationJobService;
