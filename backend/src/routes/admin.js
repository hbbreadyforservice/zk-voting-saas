/**
 * routes/admin.js
 * ===============
 * Admin endpoints.
 *
 * Ces routes sont appelees par l'espace organisation pour piloter une election:
 * publier la racine Merkle, ouvrir/fermer le vote, lire les resultats et
 * generer les invitations des electeurs.
 */

const router = require("express").Router();
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { getTree } = require("../services/merkleTree");
const {
  updateMerkleRootOnChain,
  startVotingOnChain,
  endVotingOnChain,
  addAdminOnChain,
  removeAdminOnChain,
  getElectionResults,
} = require("../services/blockchain");
const Voter = require("../models/Voter");
const Election = require("../models/Election");
const AuditLog = require("../models/AuditLog");
const Organization = require("../models/Organization");
const { logger } = require("../middleware/logger");
const { sendInvitationEmail } = require("../services/email");

function getVoterInviteSecret() {
  return process.env.VOTER_INVITE_SECRET || process.env.JWT_SECRET || "dev-voter-invite-secret-change-me";
}

function isLOCALMode() {
  return process.env.LOCAL_MODE === "true";
}

function requireAdmin(req, res, next) {
  if (!req.organization || !req.orgId) {
    return res.status(401).json({ error: "Organization authentication required" });
  }
  next();
}

async function assertElectionOwnership(req, res, next) {
  try {
    const electionId = req.params.electionId || req.body?.electionId || req.query?.electionId;
    if (!electionId) return next();
    if (!/^[a-f\d]{24}$/i.test(String(electionId))) {
      return res.status(400).json({ error: "Invalid electionId" });
    }

    const election = await Election.findOne({ _id: electionId, orgId: req.orgId });
    if (!election) return res.status(404).json({ error: "Election not found" });

    req.election = election;
    next();
  } catch (err) {
    next(err);
  }
}

router.use(requireAdmin);
router.use(assertElectionOwnership);

router.post("/update-root", async (req, res, next) => {
  try {
    // La racine Merkle resume la liste des commitments autorises.
    // Elle doit etre synchronisee avec le contrat avant le vote.
    const tree = await getTree(req.election?._id?.toString());
    const newRoot = tree.getRoot();

    const txHash = await updateMerkleRootOnChain(newRoot, req.election?.contractAddress);
    logger.info(`Merkle root updated on-chain: tx=${txHash}`);

    if (req.election) {
      req.election.merkleRoot = newRoot;
      await req.election.save();
    }

    await AuditLog.create({
      orgId: req.orgId,
      electionId: req.election?._id || null,
      actorType: "organization",
      actorId: req.orgId.toString(),
      action: "election.merkle_root_updated",
      txHash,
      metadata: { merkleRoot: newRoot },
    }).catch(() => null);

    res.json({ success: true, merkleRoot: newRoot, txHash });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/start-voting",
  [body("durationHours").isInt({ min: 1, max: 720 })],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      // Ouvrir le vote change l'etat du contrat et de MongoDB.
      // Le contrat impose ensuite la periode et refuse les votes hors delai.
      const durationSecs = req.body.durationHours * 3600;
      let txHash = null;
      if (req.election?.contractAddress || !isLOCALMode()) {
        txHash = await startVotingOnChain(durationSecs, req.election?.contractAddress);
      } else {
        txHash = `LOCAL-OPEN-${Date.now()}`;
      }

      if (req.election) {
        req.election.status = "voting_open";
        req.election.openedTxHash = txHash;
        await req.election.save();
      }

      await AuditLog.create({
        orgId: req.orgId,
        electionId: req.election?._id || null,
        actorType: "organization",
        actorId: req.orgId.toString(),
        action: "election.voting_started",
        txHash,
        metadata: { durationHours: req.body.durationHours },
      }).catch(() => null);

      res.json({ success: true, durationHours: req.body.durationHours, txHash });
    } catch (err) {
      next(err);
    }
  }
);

router.post("/end-voting", async (req, res, next) => {
  try {
    let txHash = null;
    if (req.election?.contractAddress || !isLOCALMode()) {
      txHash = await endVotingOnChain(req.election?.contractAddress);
    } else {
      txHash = `LOCAL-CLOSE-${Date.now()}`;
    }

    if (req.election) {
      req.election.status = "closed";
      req.election.closedTxHash = txHash;
      await req.election.save();
    }

    await AuditLog.create({
      orgId: req.orgId,
      electionId: req.election?._id || null,
      actorType: "organization",
      actorId: req.orgId.toString(),
      action: "election.voting_ended",
      txHash,
    }).catch(() => null);

    res.json({ success: true, txHash });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/add-admin",
  [body("address").isEthereumAddress()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const txHash = await addAdminOnChain(req.body.address);
      res.json({ success: true, address: req.body.address, txHash });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/remove-admin",
  [body("address").isEthereumAddress()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const txHash = await removeAdminOnChain(req.body.address);
      res.json({ success: true, address: req.body.address, txHash });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/voters", async (req, res, next) => {
  try {
    const filter = { orgId: req.orgId };
    if (req.election) filter.electionId = req.election._id;

    const voters = await Voter.find(filter, { email: 1, leafIndex: 1, commitment: 1, voted: 1, electionId: 1 })
      .catch(() => []);
    const tree = await getTree(req.election?._id?.toString());

    res.json({
      voters,
      merkleRoot: tree.getRoot(),
      totalVoters: tree.leaves.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/results", async (req, res, next) => {
  try {
    if (req.election && !req.election.contractAddress) {
      return res.status(400).json({ error: "Election is not deployed yet." });
    }

    const results = await getElectionResults(req.election?.contractAddress);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post("/send-invitations/:electionId", assertElectionOwnership, async (req, res, next) => {
  try {
    const election = req.election;
    if (!election) return res.status(404).json({ error: "Election not found" });

    const voters = await Voter.find({
      orgId: req.orgId,
      electionId: election._id,
      inviteStatus: { $in: ["pending", "sent"] },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const expiresIn = process.env.VOTER_INVITE_TTL || "14d";
    const invitationLinks = [];
    const emailResults = [];
    const organization = await Organization.findById(req.orgId).select("name email");

    for (const voter of voters) {
      // Chaque lien contient un JWT lie a un electeur et a une election.
      // Le hash du token est stocke pour pouvoir verifier le lien sans garder
      // le token en clair en base de donnees.
      const token = jwt.sign(
        {
          type: "voter_invite",
          orgId: req.orgId.toString(),
          electionId: election._id.toString(),
          voterId: voter._id.toString(),
          email: voter.email,
        },
        getVoterInviteSecret(),
        { expiresIn }
      );

      voter.inviteTokenHash = await bcrypt.hash(token, 10);
      voter.invitedAt = new Date();
      voter.inviteStatus = "sent";
      voter.inviteExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await voter.save();

      const voteUrl = `${frontendUrl}/vote/${election._id}/${token}`;
      invitationLinks.push({
        email: voter.email,
        url: voteUrl,
      });

      const emailResult = await sendInvitationEmail({
        to: voter.email,
        election,
        organization,
        voteUrl,
      }).catch((err) => ({
        sent: false,
        error: err.message,
      }));
      emailResults.push({ email: voter.email, ...emailResult });
    }

    await AuditLog.create({
      orgId: req.orgId,
      electionId: election._id,
      actorType: "organization",
      actorId: req.orgId.toString(),
      action: "voter.invitations_generated",
      metadata: { count: invitationLinks.length },
    }).catch(() => null);

    res.json({
      success: true,
      count: invitationLinks.length,
      emailsSent: emailResults.filter((result) => result.sent).length,
      invitationLinks,
      emailResults,
      note: "Email delivery is not configured yet; these links are returned for testing.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

