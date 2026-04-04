require("dotenv").config();

const express = require("express");
const cors = require("cors");
const flashCardRoutes = require("./src/routes/flashCardRoutes");
const config = require("./src/config/config");

const app = express();

// Middleware
app.use(cors(config.corsOptions));
app.use(express.json({ limit: "10mb" })); // Increased limit for large text content

// Routes
app.use("/api", flashCardRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
  console.log(error.stack);
  res.status(500).json({ error: error });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(config.port, () => {
  console.log(`Servidor corriendo en http://localhost:${config.port}`);
});
