const { AppError } = require("../../../shared/errors/AppError");

class TrueFalseController {
  constructor(trueFalseService, generationJobService) {
    this.trueFalseService = trueFalseService;
    this.generationJobService = generationJobService;
  }

  async createSet(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const set = await this.trueFalseService.createSet(req.body, userId);
      res.status(201).json(set);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getSets(req, res) {
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

      const sets = await this.trueFalseService.getSets(userId, options);
      res.json({ sets, pagination: options });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async getSetById(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const set = await this.trueFalseService.getSetById(req.params.id, userId);
      if (!set)
        return res.status(404).json({ error: "True/false set not found" });

      res.json(set);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async updateSet(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const set = await this.trueFalseService.updateSet(
        req.params.id,
        userId,
        req.body,
      );
      res.json(set);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async deleteSet(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      await this.trueFalseService.deleteSet(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async addQuestion(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const question = await this.trueFalseService.addQuestion(
        req.params.id,
        userId,
        req.body,
      );
      res.status(201).json(question);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async updateQuestion(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const question = await this.trueFalseService.updateQuestion(
        req.params.questionId,
        userId,
        req.body,
      );
      res.json(question);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async deleteQuestion(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      await this.trueFalseService.deleteQuestion(req.params.questionId, userId);
      res.json({ success: true });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async generateSetAsync(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { title, categoryId, quantity } = req.body;
      const file = req.file || null;
      const text = req.body.text || "";

      const job = this.generationJobService.createJob({
        userId,
        type: "truefalse-generation",
        metadata: {
          title,
          quantity: Math.min(Math.max(parseInt(quantity) || 5, 1), 20),
          fileName: file?.originalname || null,
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

          const statements = await this.trueFalseService.generateSet({
            file,
            text,
            title,
            categoryId,
            quantity: Math.min(Math.max(parseInt(quantity) || 5, 1), 20),
            userId,
            onProgress: (progress) => {
              this.generationJobService.updateJob(job.id, userId, {
                status: "processing",
                progress,
              });
            },
          });

          this.generationJobService.completeJob(job.id, userId, { statements });
        } catch (error) {
          this.generationJobService.failJob(
            job.id,
            userId,
            error.message || "Error generando afirmaciones V/F",
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

  async generateSet(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const { title, categoryId, quantity } = req.body;
      const file = req.file || null;
      const text = req.body.text || "";

      const set = await this.trueFalseService.generateSet({
        file,
        text,
        title,
        categoryId,
        quantity: Math.min(Math.max(parseInt(quantity) || 10, 1), 30),
        userId,
      });

      res.status(200).json({ questions: set });
    } catch (error) {
      this._handleError(error, res);
    }
  }

  async publish(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "Authentication required" });

      const isPublic = req.body.is_public;
      if (typeof isPublic !== "boolean")
        return res
          .status(400)
          .json({ error: "is_public (boolean) is required" });

      const result = await this.trueFalseService.publish(
        req.params.id,
        userId,
        isPublic,
      );
      res.json(result);
    } catch (error) {
      this._handleError(error, res);
    }
  }

  _handleError(error, res) {
    console.error("TrueFalseController error:", error.message);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = TrueFalseController;
