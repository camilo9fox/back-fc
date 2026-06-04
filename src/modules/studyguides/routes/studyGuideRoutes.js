const express = require("express");
const multer = require("multer");
const config = require("../../../shared/config/config");
const { authMiddleware } = require("../../../shared/middleware/auth");
const { perUserApiLimiter } = require("../../../shared/middleware/rateLimiter");

function createStudyGuideRouter(controller, aiUsageMiddleware) {
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
    "/generate-async",
    aiUsageMiddleware,
    upload.single("file"),
    (req, res) => controller.generateGuideAsync(req, res),
  );

  router.get("/generation-jobs/:jobId", (req, res) =>
    controller.getGenerationJob(req, res),
  );

  router.get("/", (req, res) => controller.getGuides(req, res));
  router.get("/:id", (req, res) => controller.getGuideById(req, res));
  router.delete("/:id", (req, res) => controller.deleteGuide(req, res));

  return router;
}

module.exports = createStudyGuideRouter;
