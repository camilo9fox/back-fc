const express = require("express");
const multer = require("multer");
const config = require("../../../shared/config/config");
const { authMiddleware } = require("../../../shared/middleware/auth");
const { perUserApiLimiter } = require("../../../shared/middleware/rateLimiter");

function createFlashCardRouter(flashCardController, aiUsageMiddleware) {
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

  router.use(authMiddleware);
  router.use(perUserApiLimiter);

  router.post(
    "/generate-flashcard",
    upload.single("file"),
    aiUsageMiddleware,
    (req, res) => flashCardController.generateFlashCard(req, res),
  );

  router.post(
    "/generate-flashcards",
    upload.single("file"),
    aiUsageMiddleware,
    (req, res) => flashCardController.generateFlashCards(req, res),
  );

  router.post(
    "/generate-flashcards-async",
    upload.single("file"),
    aiUsageMiddleware,
    (req, res) => flashCardController.generateFlashCardsAsync(req, res),
  );

  router.get("/generation-jobs/:jobId", (req, res) =>
    flashCardController.getGenerationJob(req, res),
  );

  router.post("/create-flashcard", (req, res) =>
    flashCardController.createManualFlashCard(req, res),
  );

  router.post("/create-flashcards", (req, res) =>
    flashCardController.createManualFlashCards(req, res),
  );

  router.post("/save", (req, res) =>
    flashCardController.createManualFlashCards(req, res),
  );

  // Spaced repetition endpoints (must be before /:id to avoid route collision)
  router.get("/due", (req, res) =>
    flashCardController.getDueCards(req, res),
  );

  router.get("/review-stats", (req, res) =>
    flashCardController.getReviewStats(req, res),
  );

  router.get("/search", (req, res) =>
    flashCardController.searchFlashCards(req, res),
  );

  router.get("/export", (req, res) =>
    flashCardController.exportFlashCards(req, res),
  );

  // Flashcard Sets
  router.post("/sets", (req, res) => flashCardController.createSet(req, res));
  router.get("/sets", (req, res) => flashCardController.getSets(req, res));
  router.get("/sets/:id", (req, res) => flashCardController.getSetById(req, res));
  router.put("/sets/:id", (req, res) => flashCardController.updateSet(req, res));
  router.delete("/sets/:id", (req, res) => flashCardController.deleteSet(req, res));
  router.patch("/sets/:id/publish", (req, res) => flashCardController.publishSet(req, res));

  router.post("/:id/review", (req, res) =>
    flashCardController.submitReview(req, res),
  );

  router.get("/", (req, res) =>
    flashCardController.getFlashCards(req, res),
  );

  router.patch("/:id", (req, res) =>
    flashCardController.updateFlashCard(req, res),
  );

  router.delete("/:id", (req, res) =>
    flashCardController.deleteFlashCard(req, res),
  );

  router.get("/:id", (req, res) =>
    flashCardController.getFlashCardById(req, res),
  );

  router.patch("/category/:categoryId/publish", (req, res) =>
    flashCardController.publishCategory(req, res),
  );

  return router;
}

module.exports = createFlashCardRouter;
