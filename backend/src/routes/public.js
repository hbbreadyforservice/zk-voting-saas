/**
 * routes/public.js
 */
const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const { getElectionResults, getMerkleRoot } = require("../services/blockchain");
const AuditLog = require("../models/AuditLog");
const Election = require("../models/Election");

function isLOCALMode() {
  if (process.env.LOCAL_MODE === "true") return true;
  if (process.env.NODE_ENV === "production") return false;

  const contractsPath = path.join(__dirname, "../config/contracts.json");
  if (!fs.existsSync(contractsPath)) return false;

  try {
    const config = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
    return config.LOCALMode === true;
  } catch {
    return false;
  }
}

router.get("/elections/:electionId/results", async (req, res, next) => {
  try {
    const { electionId } = req.params;
    if (!/^[a-f\d]{24}$/i.test(String(electionId))) {
      return res.status(400).json({ error: "Invalid electionId" });
    }

    const election = await Election.findById(electionId).select(
      "title description status candidates voterCount votesCast contractAddress chainId startDate endDate createdAt"
    );
    if (!election) return res.status(404).json({ error: "Election not found" });

    if (election.contractAddress && !isLOCALMode()) {
      return res.json(await getElectionResults(election.contractAddress));
    }

    const logs = await AuditLog.find({
      electionId: election._id,
      action: { $in: ["vote.submitted.local", "vote.submitted"] },
    }).select("metadata");

    const tallies = new Array(election.candidates.length).fill(0);
    for (const log of logs) {
      const choice = Number(log.metadata?.voteChoice);
      if (Number.isInteger(choice) && choice >= 0 && choice < tallies.length) {
        tallies[choice] += 1;
      }
    }

    res.json({
      electionId: election._id,
      electionName: election.title,
      description: election.description,
      isOpen: election.status === "voting_open" || election.status === "scheduled",
      status: election.status,
      startTime: election.startDate ? Math.floor(new Date(election.startDate).getTime() / 1000) : 0,
      endTime: election.endDate ? Math.floor(new Date(election.endDate).getTime() / 1000) : 0,
      totalVotes: tallies.reduce((sum, votes) => sum + votes, 0),
      registeredVoters: election.voterCount || 0,
      numCandidates: election.candidates.length,
      localMode: !election.contractAddress,
      results: election.candidates.map((candidate, index) => ({
        candidateIndex: index,
        name: candidate.name,
        votes: tallies[index],
      })),
    });
  } catch (err) {
    next(err);
  }
});

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
