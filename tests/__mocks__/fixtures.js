/**
 * Shared test fixtures for flashcards, quizzes and true/false.
 * Keeps test data DRY and in one place.
 */

const VALID_USER_ID = "user-test-001";
const VALID_CATEGORY_ID = "cat-test-001";

// ── Flashcard fixtures ────────────────────────────────────────────────────────

const validFlashCard = {
  id: "fc-001",
  question: "¿Qué es la fotosíntesis?",
  answer: "Proceso por el que las plantas producen glucosa usando luz solar.",
  source: "manual",
  user_id: VALID_USER_ID,
  category_id: VALID_CATEGORY_ID,
  created_at: "2026-01-01T00:00:00Z",
};

const validFlashCardInput = {
  question: "¿Qué es la fotosíntesis?",
  answer: "Proceso por el que las plantas producen glucosa usando luz solar.",
  title: "Biología celular",
};

// ── Quiz fixtures ─────────────────────────────────────────────────────────────

const validQuizQuestion = {
  question: "¿Cuál es la capital de Francia?",
  options: ["Madrid", "París", "Berlín", "Roma"],
  correctAnswer: "París",
  explanation: "París es la capital y ciudad más poblada de Francia.",
  orderIndex: 0,
};

const validQuizInput = {
  title: "Capitales de Europa",
  categoryId: VALID_CATEGORY_ID,
  description: "Quiz sobre capitales europeas",
  questions: [validQuizQuestion],
};

const savedQuiz = {
  id: "quiz-001",
  user_id: VALID_USER_ID,
  category_id: VALID_CATEGORY_ID,
  title: "Capitales de Europa",
  description: "Quiz sobre capitales europeas",
  questions: [{ ...validQuizQuestion, id: "qq-001", quiz_id: "quiz-001" }],
  created_at: "2026-01-01T00:00:00Z",
};

// ── True/False fixtures ───────────────────────────────────────────────────────

const validTFQuestion = {
  statement: "La Gran Muralla China es visible desde el espacio.",
  isTrue: false,
  explanation:
    "Es un mito popular; no es visible a simple vista desde el espacio.",
  orderIndex: 0,
};

const validTFSetInput = {
  title: "Mitos y realidades",
  categoryId: VALID_CATEGORY_ID,
  description: "Verdadero o falso sobre datos populares",
  questions: [validTFQuestion],
};

const savedTFSet = {
  id: "tf-001",
  user_id: VALID_USER_ID,
  category_id: VALID_CATEGORY_ID,
  title: "Mitos y realidades",
  questions: [{ ...validTFQuestion, id: "tfq-001", set_id: "tf-001" }],
  created_at: "2026-01-01T00:00:00Z",
};

// ── Category fixture ──────────────────────────────────────────────────────────

const validCategory = {
  id: VALID_CATEGORY_ID,
  title: "Geografía",
  user_id: VALID_USER_ID,
};

module.exports = {
  VALID_USER_ID,
  VALID_CATEGORY_ID,
  validFlashCard,
  validFlashCardInput,
  validQuizQuestion,
  validQuizInput,
  savedQuiz,
  validTFQuestion,
  validTFSetInput,
  savedTFSet,
  validCategory,
};
