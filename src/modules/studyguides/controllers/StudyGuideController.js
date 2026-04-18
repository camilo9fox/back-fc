const { AppError } = require("../../../shared/errors/AppError");

class StudyGuideController {
  constructor(studyGuideService, generationJobService) {
    this.studyGuideService = studyGuideService;
    this.generationJobService = generationJobService;
  }

  async getGuides(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { limit = 50, offset = 0, categoryId } = req.query;
      const options = {
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
      };
      if (categoryId) options.categoryId = categoryId;

      const guides = await this.studyGuideService.getGuides(userId, options);
      res.json({ guides, pagination: options });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getGuideById(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const guide = await this.studyGuideService.getGuideById(
        req.params.id,
        userId,
      );
      if (!guide)
        return res.status(404).json({ error: "Guía de estudio no encontrada" });

      res.json(guide);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async generateGuideAsync(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { title, categoryId, text } = req.body;
      const file = req.file || null;

      const job = this.generationJobService.createJob({
        userId,
        type: "study-guide-generation",
        metadata: {
          title,
          categoryId,
          fileName: file?.originalname ?? null,
          inputMode: file ? "file" : "text",
        },
      });

      res.status(202).json(job);

      setImmediate(async () => {
        try {
          this.generationJobService.updateJob(job.id, userId, {
            status: "processing",
            progress: { stage: "Iniciando procesamiento", percent: 2 },
          });

          const result = await this.studyGuideService.generateGuide({
            file,
            text,
            title,
            categoryId,
            userId,
            onProgress: (progress) => {
              this.generationJobService.updateJob(job.id, userId, {
                status: "processing",
                progress,
              });
            },
          });

          this.generationJobService.completeJob(job.id, userId, result);
        } catch (err) {
          this.generationJobService.failJob(
            job.id,
            userId,
            err.message || "Error generando guía de estudio",
          );
        }
      });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getGenerationJob(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const job = this.generationJobService.getJob(req.params.jobId, userId);
      if (!job) return res.status(404).json({ error: "Job no encontrado" });

      res.json(job);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async deleteGuide(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      await this.studyGuideService.deleteGuide(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  _handleError(error, res) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("StudyGuideController error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

module.exports = StudyGuideController;
