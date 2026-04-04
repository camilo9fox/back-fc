const express = require("express");
const multer = require("multer");
const FlashCardController = require("../controllers/FlashCardController");
const FlashCardService = require("../services/FlashCardService");
const GroqService = require("../services/GroqService");
const FileService = require("../services/FileService");
const DocumentProcessingService = require("../services/DocumentProcessingService");

const router = express.Router();

// Configure multer for file uploads with size limits
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "text/plain"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Tipo de archivo no permitido. Solo se aceptan PDF y TXT."),
        false,
      );
    }
  },
});

// Initialize services and controller
const groqService = new GroqService(process.env.GROQ_API_KEY);
const fileService = new FileService();
const documentProcessingService = new DocumentProcessingService();
const flashCardService = new FlashCardService(
  groqService,
  fileService,
  documentProcessingService,
);
const flashCardController = new FlashCardController(flashCardService);

// Routes
router.post("/generate-flashcard", upload.single("file"), (req, res) =>
  flashCardController.generateFlashCard(req, res),
);

router.get("/test", (req, res) => flashCardController.test(req, res));

module.exports = router;
