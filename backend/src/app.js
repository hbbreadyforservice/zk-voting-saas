/**
 * app.js - ZK Voting Backend
 * REST API bridging React, MongoDB, Stripe, email, and Ethereum contracts.
 *
 * ZK privacy rule: proofs are generated in the browser. The backend receives
 * only commitments, public signals, proof calldata, and transaction metadata.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const electionRoutes = require("./routes/elections");
const billingRoutes = require("./routes/billing");
const billingWebhookRoutes = require("./routes/billingWebhook");
const voteRoutes = require("./routes/vote");
const voterRoutes = require("./routes/voter");
const adminRoutes = require("./routes/admin");
const publicRoutes = require("./routes/public");
const { logger } = require("./middleware/logger");
const { errorHandler } = require("./middleware/errorHandler");
const { authenticateOrg } = require("./middleware/auth");
const { startReminderJob } = require("./services/reminderJob");
const { startBlockchainIndexer } = require("./services/blockchainIndexer");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// Stripe webhooks need the raw request body before JSON parsing.
app.use("/api/billing/webhook", express.raw({ type: "application/json" }), billingWebhookRoutes);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

const proofLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many proof submissions, please try again later." },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});

app.use("/api/", generalLimiter);
app.use("/api/voter/vote", proofLimiter);
app.use(/^\/api\/vote\/[^/]+\/[^/]+\/cast$/, proofLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/elections", authenticateOrg, electionRoutes);
app.use("/api/billing", authenticateOrg, billingRoutes);
app.use("/api/vote", voteRoutes);
app.use("/api/voter", authenticateOrg, voterRoutes);
app.use("/api/admin", authenticateOrg, adminRoutes);
app.use("/api/public", publicRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

async function start() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/zk-voting";
    await mongoose.connect(mongoUri);
    logger.info(`MongoDB connected: ${mongoUri}`);
  } catch (err) {
    logger.warn("MongoDB connection failed; running without persistence:", err.message);
  }

  app.listen(PORT, () => {
    logger.info(`ZK Voting API running on http://localhost:${PORT}`);
  });

  startReminderJob();
  startBlockchainIndexer().catch((err) => logger.error("Blockchain indexer failed to start", err));
}

start();

module.exports = app;
