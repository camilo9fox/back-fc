const express = require("express");
const multer = require("multer");
const config = require("../../../shared/config/config");
const { authMiddleware } = require("../../../shared/middleware/auth");

function createTrueFalseRouter(controller) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.limits.fileSizeLimit },
    fileFilter: (req, file, cb) => {
      if (config.limits.allowedFileTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error("Tipo de archivo no permitido. Solo se aceptan PDF y TXT."),
          false,
        );
      }
    },
  });

  router.use(authMiddleware);

  router.post("/generate", upload.single("file"), (req, res) =>
    controller.generateSet(req, res),
  );

  router.post("/generate-async", upload.single("file"), (req, res) =>
    controller.generateSetAsync(req, res),
  );

  router.get("/generation-jobs/:jobId", (req, res) =>
    controller.getGenerationJob(req, res),
  );

  router.post("/", (req, res) => controller.createSet(req, res));
  router.get("/", (req, res) => controller.getSets(req, res));
  router.get("/:id", (req, res) => controller.getSetById(req, res));
  router.put("/:id", (req, res) => controller.updateSet(req, res));
  router.delete("/:id", (req, res) => controller.deleteSet(req, res));
  router.post("/:id/questions", (req, res) => controller.addQuestion(req, res));
  router.delete("/:id/questions/:questionId", (req, res) =>
    controller.deleteQuestion(req, res),
  );

  return router;
}

module.exports = createTrueFalseRouter;
