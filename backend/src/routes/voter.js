/**
 * routes/voter.js
 * ===============
 * Endpoints used by registered voters.
 */

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const crypto = require("crypto");

const {
  computeCommitment,
  getTree,
  saveTreeStateSync,
} = require("../services/merkleTree");
const { verifyProofOffChain, proofToCalldata } = require("../services/zkProof");
const {
  submitVoteOnChain,
  isNullifierSpent,
  getMerkleRoot,
  getCandidateCount,
} = require("../services/blockchain");
const Voter = require("../models/Voter");
const Election = require("../models/Election");
const AuditLog = require("../models/AuditLog");
const { logger } = require("../middleware/logger");

function isUintString(value) {
  try {
    return BigInt(value) >= 0n;
  } catch {
    return false;
  }
}

async function loadOwnedElection(req, res, next) {
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

router.use(loadOwnedElection);

router.post(
  "/register",
  [
    body("email").isEmail().normalizeEmail(),
    body("electionId").optional().isMongoId(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email } = req.body;
      const existing = await Voter.findOne({
        orgId: req.orgId,
        electionId: req.election?._id || null,
        email,
      }).catch(() => null);
      if (existing) return res.status(409).json({ error: "Voter already registered" });

      const secret = BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
      const nullifier = BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();

      const commitment = await computeCommitment(secret, nullifier);

      const tree = await getTree(req.election?._id?.toString());
      const leafIndex = tree.insert(commitment);
      const proof = tree.getMerkleProof(leafIndex);
      const newRoot = tree.getRoot();
      saveTreeStateSync();

      await Voter.create({
        orgId: req.orgId,
        electionId: req.election?._id || null,
        email,
        commitment,
        leafIndex,
        merkleRoot: newRoot,
        registered: true,
        voted: false,
      }).catch(() => null);

      if (req.election) {
        req.election.voterCount += 1;
        await req.election.save();
      }

      await AuditLog.create({
        orgId: req.orgId,
        electionId: req.election?._id || null,
        actorType: "organization",
        actorId: req.orgId.toString(),
        action: "voter.registered",
        metadata: { email, leafIndex },
      }).catch(() => null);

      logger.info(`Voter registered: ${email}, leaf=${leafIndex}`);

      res.status(201).json({
        message: "Voter registered successfully",
        email,
        leafIndex,
        commitment,
        credentials: {
          secret,
          nullifier,
          pathElements: proof.pathElements,
          pathIndices: proof.pathIndices,
          merkleRoot: newRoot,
        },
        warning: "Store your secret and nullifier securely - they cannot be recovered.",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/vote",
  [
    body("proof").isObject(),
    body("publicSignals").isArray({ min: 3, max: 3 }),
    body("publicSignals.*").custom(isUintString),
    body("nullifierHash").custom(isUintString),
    body("voteChoice").isInt({ min: 0 }),
    body("electionId").optional().isMongoId(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { proof, publicSignals, nullifierHash, voteChoice } = req.body;
      const contractAddress = req.election?.contractAddress;

      if (req.election && !contractAddress) {
        return res.status(400).json({ error: "Election is not deployed yet." });
      }

      const spent = await isNullifierSpent(nullifierHash, contractAddress).catch(() => false);
      if (spent) return res.status(400).json({ error: "This voter has already voted." });

      if (publicSignals[1] !== String(nullifierHash) || publicSignals[2] !== String(voteChoice)) {
        return res.status(400).json({ error: "Public signals mismatch." });
      }

      const candidateCount = await getCandidateCount(contractAddress).catch(() => 0);
      if (voteChoice < 0 || voteChoice >= candidateCount) {
        return res.status(400).json({ error: "Invalid candidate index." });
      }
      const valid = await verifyProofOffChain(proof, publicSignals);
      if (!valid) return res.status(400).json({ error: "Invalid zk-SNARK proof." });

      const onChainRoot = await getMerkleRoot(contractAddress).catch(() => null);
      if (onChainRoot && String(publicSignals[0]) !== String(onChainRoot)) {
        return res.status(400).json({
          error: "Merkle root mismatch. Re-fetch latest root and regenerate proof.",
        });
      }

      const { pA, pB, pC } = await proofToCalldata(proof, publicSignals);

      const { txHash, blockNumber } = await submitVoteOnChain(
        pA,
        pB,
        pC,
        BigInt(nullifierHash),
        BigInt(voteChoice),
        contractAddress
      );

      logger.info(`Vote cast. tx=${txHash}`);

      if (req.election) {
        req.election.votesCast += 1;
        await req.election.save();
      }

      await AuditLog.create({
        orgId: req.orgId,
        electionId: req.election?._id || null,
        actorType: "voter",
        action: "vote.submitted",
        txHash,
        metadata: { blockNumber, nullifierHash, voteChoice },
      }).catch(() => null);

      res.json({
        success: true,
        message: "Vote cast successfully",
        txHash,
        blockNumber,
        nullifierHash,
        voteChoice,
      });
    } catch (err) {
      if (err.message?.includes("NullifierAlreadySpent")) {
        return res.status(400).json({ error: "This voter has already voted." });
      }
      if (err.message?.includes("InvalidProof")) {
        return res.status(400).json({ error: "Proof rejected by smart contract." });
      }
      next(err);
    }
  }
);

router.get("/status/:nullifierHash", [param("nullifierHash").custom(isUintString)], async (req, res, next) => {
  try {
    const { nullifierHash } = req.params;
    const spent = await isNullifierSpent(nullifierHash).catch(() => false);
    res.json({ nullifierHash, hasVoted: spent });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

