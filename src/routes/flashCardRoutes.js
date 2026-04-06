const express = require("express");
const multer = require("multer");
const Container = require("../container");
const config = require("../config/config");

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

// Initialize container and get controller
const container = Container.create({
  groqApiKey: process.env.GROQ_API_KEY,
});
const flashCardController = container.get("flashCardController");

// Routes
router.post("/generate-flashcard", upload.single("file"), (req, res) =>
  flashCardController.generateFlashCard(req, res),
);

router.post("/generate-flashcards", upload.single("file"), (req, res) =>
  flashCardController.generateFlashCards(req, res),
);

router.get("/test", (req, res) => flashCardController.test(req, res));

module.exports = router;
