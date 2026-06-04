const express = require("express");
const multer = require("multer");
const config = require("../../../shared/config/config");
const { authMiddleware } = require("../../../shared/middleware/auth");
const { perUserApiLimiter } = require("../../../shared/middleware/rateLimiter");

function createExamSimulationRouter(controller, aiUsageMiddleware) {
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
  router.use(perUserApiLimiter);

  router.post(
    "/generate",
    aiUsageMiddleware,
    upload.single("file"),
    (req, res) => controller.generateSimulation(req, res),
  );

  router.post(
    "/generate-async",
    aiUsageMiddleware,
    upload.single("file"),
    (req, res) => controller.generateSimulationAsync(req, res),
  );

  router.get("/generation-jobs/:jobId", (req, res) =>
    controller.getGenerationJob(req, res),
  );

  router.post("/", (req, res) => controller.createSimulation(req, res));
  router.get("/", (req, res) => controller.getSimulations(req, res));
  router.get("/:id", (req, res) => controller.getSimulationById(req, res));
  router.delete("/:id", (req, res) => controller.deleteSimulation(req, res));
  router.post("/:id/submit", (req, res) =>
    controller.submitSimulation(req, res),
  );

  return router;
}

module.exports = createExamSimulationRouter;
