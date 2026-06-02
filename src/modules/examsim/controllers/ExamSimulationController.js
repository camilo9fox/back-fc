const { AppError } = require("../../../shared/errors/AppError");
const logger = require("../../../shared/config/logger");

class ExamSimulationController {
  constructor(examSimulationService, generationJobService) {
    this.examSimulationService = examSimulationService;
    this.generationJobService = generationJobService;
  }

  getUserId(req, res) {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return null;
    }
    return userId;
  }

  async createSimulation(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      const simulation = await this.examSimulationService.createSimulation(
        req.body,
        userId,
      );

      res.status(201).json(simulation);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async generateSimulation(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      const generated = await this.examSimulationService.generateSimulation({
        file: req.file || null,
        text: req.body.text || "",
        title: req.body.title,
        description: req.body.description,
        categoryId: req.body.categoryId,
        trueFalseCount: req.body.trueFalseCount,
        quizCount: req.body.quizCount,
        developmentCount: req.body.developmentCount,
        durationMinutes: req.body.durationMinutes,
        userId,
      });

      res.status(200).json(generated);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async generateSimulationAsync(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      const meta = {
        title: req.body.title,
        categoryId: req.body.categoryId,
        trueFalseCount: Math.min(
          Math.max(parseInt(req.body.trueFalseCount) || 6, 1),
          20,
        ),
        quizCount: Math.min(Math.max(parseInt(req.body.quizCount) || 6, 1), 20),
        developmentCount: Math.min(
          Math.max(parseInt(req.body.developmentCount) || 3, 1),
          10,
        ),
      };

      const job = this.generationJobService.createJob({
        userId,
        type: "exam-simulation-generation",
        metadata: {
          ...meta,
          fileName: req.file?.originalname || null,
          inputMode: req.file ? "file" : "text",
        },
      });

      res.status(202).json(job);

      setImmediate(async () => {
        try {
          this.generationJobService.updateJob(job.id, userId, {
            status: "processing",
            progress: { stage: "Iniciando simulacion", percent: 2 },
          });

          const generated = await this.examSimulationService.generateSimulation(
            {
              file: req.file || null,
              text: req.body.text || "",
              title: req.body.title,
              description: req.body.description,
              categoryId: req.body.categoryId,
              trueFalseCount: req.body.trueFalseCount,
              quizCount: req.body.quizCount,
              developmentCount: req.body.developmentCount,
              durationMinutes: req.body.durationMinutes,
              userId,
              onProgress: (progress) => {
                this.generationJobService.updateJob(job.id, userId, {
                  status: "processing",
                  progress,
                });
              },
            },
          );

          this.generationJobService.completeJob(job.id, userId, generated);
        } catch (error) {
          const stage = String(error?.generationStage || "").trim();
          const baseMessage =
            error?.message || "Error generando simulacion de examen";
          const errorMessage = stage
            ? `[${stage}] ${baseMessage}`
            : baseMessage;

          logger.error("ExamSimulation async generation failed", {
            jobId: job.id,
            userId,
            stage: stage || null,
            message: baseMessage,
            stack: error?.stack || null,
          });

          this.generationJobService.failJob(
            job.id,
            userId,
            errorMessage,
            stage
              ? {
                  stage: `Fallo: ${stage}`,
                }
              : undefined,
          );
        }
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getGenerationJob(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      const job = this.generationJobService.getJob(req.params.jobId, userId);
      if (!job) return res.status(404).json({ error: "Job no encontrado" });

      res.json(job);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getSimulations(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      const { limit = 50, offset = 0, categoryId } = req.query;
      const options = {
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
      };
      if (categoryId) options.categoryId = categoryId;

      const simulations = await this.examSimulationService.getSimulations(
        userId,
        options,
      );

      res.json({ simulations, pagination: options });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getSimulationById(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      const simulation = await this.examSimulationService.getSimulationById(
        req.params.id,
        userId,
      );
      res.json(simulation);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async deleteSimulation(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      await this.examSimulationService.deleteSimulation(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async submitSimulation(req, res) {
    try {
      const userId = this.getUserId(req, res);
      if (!userId) return;

      const result = await this.examSimulationService.submitSimulation(
        req.params.id,
        userId,
        req.body,
      );

      res.status(201).json(result);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  handleError(error, res) {
    logger.error("ExamSimulationController error:", error.message);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = ExamSimulationController;
