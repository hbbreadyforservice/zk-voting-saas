// middleware/errorHandler.js
const { logger } = require("./logger");

function errorHandler(err, req, res, _next) {
  logger.error(`${req.method} ${req.path} â€” ${err.message}`);

  // Ethers.js / contract errors
  if (err.code === "CALL_EXCEPTION" || err.reason) {
    return res.status(400).json({ error: err.reason || "Smart contract call failed" });
  }

  // Validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }

  // Default 500
  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
}

module.exports = { errorHandler };

