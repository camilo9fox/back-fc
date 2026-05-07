/**
 * Unit tests — GenerationJobService
 * Covers createJob, getJob, updateJob, completeJob, failJob,
 * _toPublic / toPublicJob, and cache pruning.
 */

const GenerationJobService = require("../../../src/modules/flashcards/services/GenerationJobService");
const { VALID_USER_ID } = require("../../__mocks__/fixtures");

const OTHER_USER = "other-user-999";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(repository = null) {
  return new GenerationJobService(repository);
}

// ── createJob ─────────────────────────────────────────────────────────────────

describe("GenerationJobService.createJob()", () => {
  it("returns a job with queued status and correct fields", () => {
    const svc = buildService();
    const job = svc.createJob({
      userId: VALID_USER_ID,
      type: "flashcards",
      metadata: { quantity: 5 },
    });

    expect(job.status).toBe("queued");
    expect(job.type).toBe("flashcards");
    expect(job.metadata).toEqual({ quantity: 5 });
    expect(job.result).toBeNull();
    expect(job.error).toBeNull();
    expect(typeof job.id).toBe("string");
    expect(typeof job.createdAt).toBe("string");
    expect(typeof job.expiresAt).toBe("string");
  });

  it("stores job in cache so getJob returns it immediately", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "quiz" });
    const fetched = svc.getJob(job.id, VALID_USER_ID);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(job.id);
  });

  it("generates a unique ID for each job", () => {
    const svc = buildService();
    const a = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    const b = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    expect(a.id).not.toBe(b.id);
  });

  it("persists to repository when one is provided", async () => {
    const repo = {
      create: jest.fn().mockResolvedValue(undefined),
      deleteExpired: jest.fn().mockResolvedValue(undefined),
    };
    const svc = buildService(repo);
    svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    // repository.create is async fire-and-forget; flush micro-tasks
    await Promise.resolve();
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

// ── getJob ────────────────────────────────────────────────────────────────────

describe("GenerationJobService.getJob()", () => {
  it("returns null for a job that belongs to a different user", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    expect(svc.getJob(job.id, OTHER_USER)).toBeNull();
  });

  it("returns null for a non-existent jobId with no repository", () => {
    const svc = buildService();
    expect(svc.getJob("does-not-exist", VALID_USER_ID)).toBeNull();
  });

  it("falls back to repository when jobId is not in cache", async () => {
    const publicShape = {
      id: "db-job",
      type: "quiz",
      status: "completed",
      progress: {},
      metadata: {},
      result: null,
      error: null,
      createdAt: "",
      updatedAt: "",
      expiresAt: "",
    };
    const repo = {
      create: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(publicShape),
      deleteExpired: jest.fn().mockResolvedValue(undefined),
    };
    const svc = buildService(repo);
    const result = await svc.getJob("db-job", VALID_USER_ID);
    expect(repo.findById).toHaveBeenCalledWith("db-job", VALID_USER_ID);
    expect(result).not.toBeNull();
  });

  it("returns null from repository fallback when job is not found there either", async () => {
    const repo = {
      create: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      deleteExpired: jest.fn().mockResolvedValue(undefined),
    };
    const svc = buildService(repo);
    const result = await svc.getJob("unknown", VALID_USER_ID);
    expect(result).toBeNull();
  });
});

// ── updateJob ─────────────────────────────────────────────────────────────────

describe("GenerationJobService.updateJob()", () => {
  it("updates job fields and returns updated public job", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    const updated = svc.updateJob(job.id, VALID_USER_ID, {
      status: "running",
      progress: { stage: "Procesando", percent: 50 },
    });
    expect(updated.status).toBe("running");
    expect(updated.progress.stage).toBe("Procesando");
    expect(updated.progress.percent).toBe(50);
  });

  it("merges progress patch with existing progress", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    svc.updateJob(job.id, VALID_USER_ID, { progress: { percent: 30 } });
    const updated = svc.updateJob(job.id, VALID_USER_ID, {
      progress: { stage: "Generando" },
    });
    expect(updated.progress.percent).toBe(30);
    expect(updated.progress.stage).toBe("Generando");
  });

  it("returns null when jobId does not exist in cache", () => {
    const svc = buildService();
    expect(svc.updateJob("nope", VALID_USER_ID, {})).toBeNull();
  });

  it("returns null when userId does not match the cached job owner", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    expect(svc.updateJob(job.id, OTHER_USER, {})).toBeNull();
  });
});

// ── completeJob ───────────────────────────────────────────────────────────────

describe("GenerationJobService.completeJob()", () => {
  it("marks job as completed with result", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    const completed = svc.completeJob(job.id, VALID_USER_ID, [
      { question: "Q", answer: "A" },
    ]);
    expect(completed.status).toBe("completed");
    expect(completed.progress.percent).toBe(100);
    expect(completed.result).toEqual([{ question: "Q", answer: "A" }]);
    expect(completed.error).toBeNull();
  });
});

// ── failJob ───────────────────────────────────────────────────────────────────

describe("GenerationJobService.failJob()", () => {
  it("marks job as failed with error message", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    const failed = svc.failJob(job.id, VALID_USER_ID, "Groq timeout");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("Groq timeout");
  });

  it("includes progress patch when provided", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    const failed = svc.failJob(job.id, VALID_USER_ID, "Error", {
      stage: "Fallando",
      percent: 40,
    });
    expect(failed.progress.stage).toBe("Fallando");
    expect(failed.progress.percent).toBe(40);
  });
});

// ── _toPublic / toPublicJob ───────────────────────────────────────────────────

describe("GenerationJobService.toPublicJob()", () => {
  it("returns only public fields (no internal cache metadata)", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    const pub = svc.toPublicJob({
      id: job.id,
      type: "flashcards",
      status: "queued",
      progress: { stage: "En cola", percent: 0 },
      metadata: {},
      result: null,
      error: null,
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
      expiresAt: job.expiresAt,
    });
    expect(pub).not.toHaveProperty("userId");
    expect(pub).toHaveProperty("id");
    expect(pub).toHaveProperty("status");
  });
});

// ── _pruneCache / pruneExpiredJobs ────────────────────────────────────────────

describe("GenerationJobService cache pruning", () => {
  it("pruneExpiredJobs removes entries whose expiresAt is in the past", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });

    // Manually expire the job in the cache
    const cachedJob = svc.cache.get(job.id);
    cachedJob.expiresAt = new Date(Date.now() - 1000).toISOString();
    svc.cache.set(job.id, cachedJob);

    svc.pruneExpiredJobs();
    expect(svc.cache.has(job.id)).toBe(false);
  });

  it("does not remove jobs that are still valid", () => {
    const svc = buildService();
    const job = svc.createJob({ userId: VALID_USER_ID, type: "flashcards" });
    svc.pruneExpiredJobs();
    expect(svc.cache.has(job.id)).toBe(true);
  });
});
