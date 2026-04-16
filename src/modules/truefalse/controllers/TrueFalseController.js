class TrueFalseController {
  constructor(trueFalseService) {
    this.trueFalseService = trueFalseService;
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

      const { limit = 50, offset = 0 } = req.query;
      const options = {
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
      };

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

  _handleError(error, res) {
    console.error("TrueFalseController error:", error.message);
    if (
      error.message.includes("not found") ||
      error.message.includes("access denied")
    ) {
      return res.status(404).json({ error: error.message });
    }
    if (
      error.message.includes("Invalid") ||
      error.message.includes("required") ||
      error.message.includes("obligatorio") ||
      error.message.includes("Se requiere")
    ) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = TrueFalseController;
