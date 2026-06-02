const express = require("express");
const { authMiddleware } = require("../../../shared/middleware/auth");

function createSupportTicketRouter(controller) {
  const router = express.Router();

  router.use(authMiddleware);
  router.post("/", (req, res) => controller.createSupportTicket(req, res));
  router.get("/", (req, res) => controller.getSupportTicketsByUser(req, res));
  router.get("/categories", (req, res) =>
    controller.getSupportTicketsCategories(req, res),
  );
  router.get("/:id", (req, res) => controller.getSupportTicketById(req, res));
  router.put("/:id", (req, res) => controller.updateSupportTicket(req, res));
  router.delete("/:id", (req, res) => controller.deleteSupportTicket(req, res));

  return router;
}

module.exports = createSupportTicketRouter;
