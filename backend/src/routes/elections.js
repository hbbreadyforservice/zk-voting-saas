const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const fs = require("fs");
const path = require("path");

/**
 * routes/elections.js
 * -------------------
 * Espace organisation: creation, modification et deploiement des elections.
 * Ce fichier gere les donnees SaaS dans MongoDB, puis appelle blockchain.js
 * seulement quand une election doit exister sur la blockchain.
 */

const Election = require("../models/Election");
const Organization = require("../models/Organization");
const AuditLog = require("../models/AuditLog");
const Voter = require("../models/Voter");
const { createElectionOnChain } = require("../services/blockchain");
const { checkElectionCreationQuota } = require("../middleware/quota");
const { watchElection } = require("../services/blockchainIndexer");

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

function normalizeCandidates(candidates) {
  return candidates.map((candidate) => {
    if (typeof candidate === "string") return { name: candidate.trim() };
    return {
      name: String(candidate.name || "").trim(),
      description: String(candidate.description || "").trim(),
    };
  });
}

function normalizeVoterEmails(voterEmails) {
  if (!Array.isArray(voterEmails)) return [];
  return Array.from(
    new Set(
      voterEmails
        .map((email) => String(email || "").trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
  );
}

function getDurationSecs(election) {
  if (election.startDate && election.endDate) {
    const seconds = Math.floor((new Date(election.endDate).getTime() - new Date(election.startDate).getTime()) / 1000);
    if (seconds > 0) return seconds;
  }
  return 7 * 24 * 60 * 60;
}

function getContractsConfig() {
  const configPath = path.join(__dirname, "../config/contracts.json");
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

async function loadOwnedElection(req, res, next) {
  try {
    if (!handleValidation(req, res)) return;

    const election = await Election.findOne({
      _id: req.params.electionId,
      orgId: req.orgId,
    });

    if (!election) {
      return res.status(404).json({ error: "Election not found" });
    }

    req.election = election;
    next();
  } catch (err) {
    next(err);
  }
}

router.get("/", async (req, res, next) => {
  try {
    const elections = await Election.find({ orgId: req.orgId }).sort({ createdAt: -1 });
    res.json({ elections });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  [
    body("title").trim().isLength({ min: 2, max: 180 }),
    body("description").optional({ nullable: true }).trim().isLength({ max: 2000 }),
    body("startDate").optional({ nullable: true }).isISO8601(),
    body("endDate").optional({ nullable: true }).isISO8601(),
    body("candidates").isArray({ min: 2 }),
    body("candidates.*").custom((candidate) => {
      if (typeof candidate === "string") return candidate.trim().length > 0;
      return typeof candidate?.name === "string" && candidate.name.trim().length > 0;
    }),
    body("voterEmails").optional().isArray(),
    body("deployOnChain").optional().isBoolean(),
  ],
  checkElectionCreationQuota,
  async (req, res, next) => {
    try {
      if (!handleValidation(req, res)) return;

      // Les donnees venant du formulaire React sont nettoyees avant stockage:
      // candidats normalises, emails dedupliques, dates converties.
      const candidates = normalizeCandidates(req.body.candidates);
      const voterEmails = normalizeVoterEmails(req.body.voterEmails);
      const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
      const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
      if (startDate && endDate && endDate <= startDate) {
        return res.status(400).json({ error: "endDate must be after startDate" });
      }

      const election = await Election.create({
        orgId: req.orgId,
        title: req.body.title,
        description: req.body.description || "",
        startDate,
        endDate,
        candidates,
        voterCount: voterEmails.length,
        status: startDate ? "scheduled" : "draft",
      });

      await Organization.updateOne({ _id: req.orgId }, { $addToSet: { elections: election._id } });

      // Les electeurs importes sont seulement pre-enregistres ici.
      // Leur commitment ZK est cree plus tard, dans le navigateur, au moment
      // ou ils ouvrent leur invitation.
      if (voterEmails.length > 0) {
        await Voter.insertMany(
          voterEmails.map((email) => ({
            orgId: req.orgId,
            electionId: election._id,
            email,
            registered: false,
            inviteStatus: "pending",
          })),
          { ordered: false }
        ).catch(() => null);
      }

      await AuditLog.create({
        orgId: req.orgId,
        electionId: election._id,
        actorType: "organization",
        actorId: req.orgId.toString(),
        action: "election.created",
        metadata: { title: election.title, importedVoters: voterEmails.length },
      }).catch(() => null);

      // Optionnel: certaines elections restent en mode SaaS local, d'autres
      // sont deployees immediatement via la factory Solidity.
      if (req.body.deployOnChain === true) {
        const config = getContractsConfig();
        if (!config.factoryAddress) {
          return res.status(201).json({
            election,
            warning: "Election created, but on-chain deployment is not configured yet.",
          });
        }
        await deployElection(election, req);
      }

      res.status(201).json({ election });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:electionId",
  [param("electionId").isMongoId()],
  loadOwnedElection,
  async (req, res) => {
    res.json({ election: req.election });
  }
);

router.patch(
  "/:electionId",
  [
    param("electionId").isMongoId(),
    body("title").optional().trim().isLength({ min: 2, max: 180 }),
    body("description").optional({ nullable: true }).trim().isLength({ max: 2000 }),
    body("startDate").optional({ nullable: true }).isISO8601(),
    body("endDate").optional({ nullable: true }).isISO8601(),
    body("candidates").optional().isArray({ min: 2 }),
  ],
  loadOwnedElection,
  async (req, res, next) => {
    try {
      const election = req.election;
      if (!["draft", "scheduled"].includes(election.status)) {
        return res.status(409).json({ error: "Only draft or scheduled elections can be edited" });
      }

      if (req.body.title !== undefined) election.title = req.body.title;
      if (req.body.description !== undefined) election.description = req.body.description || "";
      if (req.body.startDate !== undefined) election.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
      if (req.body.endDate !== undefined) election.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
      if (req.body.candidates !== undefined) election.candidates = normalizeCandidates(req.body.candidates);

      if (election.startDate && election.endDate && election.endDate <= election.startDate) {
        return res.status(400).json({ error: "endDate must be after startDate" });
      }

      election.status = election.startDate ? "scheduled" : "draft";
      await election.save();

      await AuditLog.create({
        orgId: req.orgId,
        electionId: election._id,
        actorType: "organization",
        actorId: req.orgId.toString(),
        action: "election.updated",
      }).catch(() => null);

      res.json({ election });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:electionId/deploy",
  [param("electionId").isMongoId()],
  loadOwnedElection,
  async (req, res, next) => {
    try {
      const election = req.election;
      if (election.contractAddress) {
        return res.status(409).json({ error: "Election is already deployed" });
      }

      await deployElection(election, req);
      res.json({ election });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:electionId/archive",
  [param("electionId").isMongoId()],
  loadOwnedElection,
  async (req, res, next) => {
    try {
      req.election.status = "archived";
      await req.election.save();

      await AuditLog.create({
        orgId: req.orgId,
        electionId: req.election._id,
        actorType: "organization",
        actorId: req.orgId.toString(),
        action: "election.archived",
      }).catch(() => null);

      res.json({ election: req.election });
    } catch (err) {
      next(err);
    }
  }
);

async function deployElection(election, req) {
  // Deploiement on-chain: une election MongoDB correspond a un contrat ZKVoting.
  // L'adresse retournee devient la reference pour ouvrir/fermer le vote et
  // soumettre les preuves.
  const candidates = election.candidates.map((candidate) => candidate.name);
  const chainResult = await createElectionOnChain(election.title, candidates, getDurationSecs(election));
  const config = getContractsConfig();

  election.factoryElectionId = chainResult.electionId;
  election.contractAddress = chainResult.electionAddress;
  election.deploymentTxHash = chainResult.txHash;
  election.factoryAddress = config.factoryAddress || null;
  election.verifierAddress = config.verifierAddress || null;
  election.chainId = config.chainId || null;
  await election.save();
  watchElection(election);

  await AuditLog.create({
    orgId: req.orgId,
    electionId: election._id,
    actorType: "organization",
    actorId: req.orgId.toString(),
    action: "election.deployed",
    txHash: chainResult.txHash,
    metadata: {
      factoryElectionId: chainResult.electionId,
      contractAddress: chainResult.electionAddress,
    },
  }).catch(() => null);
}

module.exports = router;
