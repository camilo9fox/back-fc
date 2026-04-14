const express = require("express");
const multer = require("multer");
const config = require("../../../shared/config/config");
const { authMiddleware } = require("../../../shared/middleware/auth");

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
    upload.single("file"),
    (req, res) => flashCardController.generateFlashCard(req, res),
  );

  router.post(
    "/generate-flashcards",
    authMiddleware,
    upload.single("file"),
    (req, res) => flashCardController.generateFlashCards(req, res),
  );

  router.post(
    "/generate-flashcards-async",
    authMiddleware,
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
    flashCardController.saveFlashCards(req, res),
  );

  router.get("/flashcards", authMiddleware, (req, res) =>
    flashCardController.getFlashCards(req, res),
  );

  router.get("/flashcards/:id", authMiddleware, (req, res) =>
    flashCardController.getFlashCardById(req, res),
  );

  router.get("/test", authMiddleware, (req, res) =>
    flashCardController.test(req, res),
  );

  return router;
}

module.exports = createFlashCardRouter;
