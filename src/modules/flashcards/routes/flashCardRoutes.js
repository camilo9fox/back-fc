const express = require("express");
const multer = require("multer");
const config = require("../../../shared/config/config");
const { authMiddleware } = require("../../../shared/middleware/auth");
const { perUserApiLimiter } = require("../../../shared/middleware/rateLimiter");

function createFlashCardRouter(flashCardController) {
  const router = express.Router();

  // Configure multer for file uploads with size limits
  const storage = multer.memoryStorage();
  const upload = multer({
    storage: storage,
    limits: {
      fileSize: config.limits.fileSizeLimit,
    },
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

  router.post(
    "/generate-flashcard",
    authMiddleware,
    perUserApiLimiter,
    upload.single("file"),
    (req, res) => flashCardController.generateFlashCard(req, res),
  );

  router.post(
    "/generate-flashcards",
    authMiddleware,
    perUserApiLimiter,
    upload.single("file"),
    (req, res) => flashCardController.generateFlashCards(req, res),
  );

  router.post(
    "/generate-flashcards-async",
    authMiddleware,
    perUserApiLimiter,
    upload.single("file"),
    (req, res) => flashCardController.generateFlashCardsAsync(req, res),
  );

  router.get("/generation-jobs/:jobId", authMiddleware, (req, res) =>
    flashCardController.getGenerationJob(req, res),
  );

  router.post("/create-flashcard", authMiddleware, (req, res) =>
    flashCardController.createManualFlashCard(req, res),
  );

  router.post("/create-flashcards", authMiddleware, (req, res) =>
    flashCardController.createManualFlashCards(req, res),
  );

  router.post("/save", authMiddleware, (req, res) =>
    flashCardController.createManualFlashCards(req, res),
  );

  // Spaced repetition endpoints (must be before /:id to avoid route collision)
  router.get("/due", authMiddleware, (req, res) =>
    flashCardController.getDueCards(req, res),
  );

  router.get("/review-stats", authMiddleware, (req, res) =>
    flashCardController.getReviewStats(req, res),
  );

  router.get("/search", authMiddleware, (req, res) =>
    flashCardController.searchFlashCards(req, res),
  );

  router.get("/export", authMiddleware, (req, res) =>
    flashCardController.exportFlashCards(req, res),
  );

  router.post("/:id/review", authMiddleware, (req, res) =>
    flashCardController.submitReview(req, res),
  );

  router.get("/", authMiddleware, (req, res) =>
    flashCardController.getFlashCards(req, res),
  );

  router.patch("/:id", authMiddleware, (req, res) =>
    flashCardController.updateFlashCard(req, res),
  );

  router.delete("/:id", authMiddleware, (req, res) =>
    flashCardController.deleteFlashCard(req, res),
  );

  router.get("/:id", authMiddleware, (req, res) =>
    flashCardController.getFlashCardById(req, res),
  );

  router.patch("/category/:categoryId/publish", authMiddleware, (req, res) =>
    flashCardController.publishCategory(req, res),
  );

  return router;
}

module.exports = createFlashCardRouter;
