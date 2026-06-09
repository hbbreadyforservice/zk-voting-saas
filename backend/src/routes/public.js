/**
 * routes/public.js
 */
const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const { getElectionResults, getMerkleRoot } = require("../services/blockchain");

function isLOCALMode() {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.LOCAL_MODE === "true") return true;

  const contractsPath = path.join(__dirname, "../config/contracts.json");
  if (!fs.existsSync(contractsPath)) return false;

  try {
    const config = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
    return config.LOCALMode === true;
  } catch {
    return false;
  }
}

router.get("/election-info", async (_req, res, next) => {
  try {
    const results = await getElectionResults();
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get("/results", async (_req, res, next) => {
  try {
    const results = await getElectionResults();
    res.json(results.results);
  } catch (err) {
    next(err);
  }
});

router.get("/merkle-root", async (_req, res, next) => {
  try {
    const root = await getMerkleRoot();
    res.json({ merkleRoot: root });
  } catch (err) {
    next(err);
  }
});

router.get("/LOCAL-voters", async (_req, res, next) => {
  try {
    if (!isLOCALMode()) {
      return res.status(404).json({ error: "LOCAL voters are not available." });
    }

    const credentialsPath = path.join(__dirname, "../config/voter-credentials.json");
    if (!fs.existsSync(credentialsPath)) {
      return res.status(404).json({ error: "LOCAL voter credentials file not found." });
    }

    const data = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    const voters = (data.voters || []).map((voter) => ({
      email: voter.email,
      leafIndex: voter.leafIndex,
      secret: voter.secret,
      nullifier: voter.nullifier,
      merkleRoot: data.merkleRoot,
      pathElements: voter.pathElements,
      pathIndices: voter.pathIndices,
    }));

    res.json({ voters });
  } catch (err) {
    next(err);
  }
});

router.get("/LOCAL-voter-credentials", async (req, res, next) => {
  try {
    if (!isLOCALMode()) {
      return res.status(404).json({ error: "LOCAL voter lookup is not available." });
    }

    const email = String(req.query.email || "").trim().toLowerCase();
    const secret = String(req.query.secret || "").trim();
    if (!email || !secret) {
      return res.status(400).json({ error: "email and secret are required." });
    }

    const credentialsPath = path.join(__dirname, "../config/voter-credentials.json");
    if (!fs.existsSync(credentialsPath)) {
      return res.status(404).json({ error: "LOCAL voter credentials file not found." });
    }

    const data = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    const voter = (data.voters || []).find(
      (v) => String(v.email || "").toLowerCase() === email && String(v.secret || "") === secret
    );

    if (!voter) {
      return res.status(404).json({ error: "No LOCAL voter matched this email/secret." });
    }

    return res.json({
      email: voter.email,
      leafIndex: voter.leafIndex,
      secret: voter.secret,
      nullifier: voter.nullifier,
      merkleRoot: data.merkleRoot,
      pathElements: voter.pathElements,
      pathIndices: voter.pathIndices,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;