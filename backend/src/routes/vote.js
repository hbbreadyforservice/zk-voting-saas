const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const Election = require("../models/Election");
const Voter = require("../models/Voter");
const AuditLog = require("../models/AuditLog");
const { getTree, saveTreeStateSync } = require("../services/merkleTree");
const { proofToCalldata, verifyProofOffChain } = require("../services/zkProof");
const {
  getMerkleRootForContract,
  submitVoteOnChain,
  updateMerkleRootOnChain,
} = require("../services/blockchain");
const { sendVoteConfirmationEmail } = require("../services/email");

function isUintString(value) {
  try {
    return BigInt(value) >= 0n;
  } catch {
    return false;
  }
}

function getVoterInviteSecret() {
  return process.env.VOTER_INVITE_SECRET || process.env.JWT_SECRET || "dev-voter-invite-secret-change-me";
}

function isLOCALMode() {
  return process.env.LOCAL_MODE === "true";
}

function createReceiptCode() {
  return crypto.randomBytes(8).toString("hex").toUpperCase().replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function hashReceiptCode(code) {
  return crypto.createHash("sha256").update(String(code).replace(/[^a-zA-Z0-9]/g, "").toUpperCase()).digest("hex");
}

async function loadInvite(req, res, next) {
  try {
    const { electionId, token } = req.params;
    if (!/^[a-f\d]{24}$/i.test(String(electionId))) {
      return res.status(400).json({ error: "Invalid electionId" });
    }

    const payload = jwt.verify(token, getVoterInviteSecret());
    if (
      payload.type !== "voter_invite" ||
      payload.electionId !== electionId ||
      !payload.voterId
    ) {
      return res.status(401).json({ error: "Invalid invitation token" });
    }

    const [election, voter] = await Promise.all([
      Election.findById(electionId),
      Voter.findOne({ _id: payload.voterId, electionId }),
    ]);

    if (!election || !voter) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    if (!voter.inviteTokenHash) {
      return res.status(401).json({ error: "Invitation token is not active" });
    }

    const tokenOk = await bcrypt.compare(token, voter.inviteTokenHash);
    if (!tokenOk) return res.status(401).json({ error: "Invalid invitation token" });

    req.invitePayload = payload;
    req.election = election;
    req.voter = voter;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invitation expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid invitation token" });
    }
    next(err);
  }
}

router.get("/:electionId/:token", loadInvite, async (req, res) => {
  res.json({
    election: publicElection(req.election),
    voter: {
      email: req.voter.email,
      inviteStatus: req.voter.inviteStatus,
      registered: req.voter.registered,
      voted: req.voter.voted,
      leafIndex: req.voter.leafIndex,
    },
  });
});

router.post(
  "/:electionId/:token/claim",
  [body("commitment").custom(isUintString)],
  loadInvite,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const commitment = String(req.body.commitment);
      try {
        BigInt(commitment);
      } catch {
        return res.status(400).json({ error: "Invalid commitment" });
      }

      const voter = req.voter;
      const election = req.election;
      const tree = await getTree(election._id.toString());

      if (!voter.registered) {
        const leafIndex = tree.insert(commitment);
        const proof = tree.getMerkleProof(leafIndex);
        const merkleRoot = tree.getRoot();
        saveTreeStateSync(election._id.toString());

        voter.commitment = commitment;
        voter.leafIndex = leafIndex;
        voter.merkleRoot = merkleRoot;
        voter.registered = true;
        voter.inviteStatus = "claimed";
        voter.claimedAt = new Date();
        await voter.save();

        election.merkleRoot = merkleRoot;
        await election.save();

        let rootTxHash = null;
        if (election.contractAddress) {
          try {
            rootTxHash = await updateMerkleRootOnChain(merkleRoot, election.contractAddress);
          } catch (err) {
            rootTxHash = null;
          }
        }

        await AuditLog.create({
          orgId: election.orgId,
          electionId: election._id,
          actorType: "voter",
          actorId: voter._id.toString(),
          action: "voter.commitment_claimed",
          txHash: rootTxHash,
          metadata: { leafIndex, email: voter.email },
        }).catch(() => null);

        return res.json({
          email: voter.email,
          leafIndex,
          merkleRoot,
          pathElements: proof.pathElements,
          pathIndices: proof.pathIndices,
          rootTxHash,
        });
      }

      const proof = tree.getMerkleProof(voter.leafIndex);
      return res.json({
        email: voter.email,
        leafIndex: voter.leafIndex,
        merkleRoot: voter.merkleRoot || tree.getRoot(),
        pathElements: proof.pathElements,
        pathIndices: proof.pathIndices,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:electionId/:token/cast",
  [
    body("proof").isObject(),
    body("publicSignals").isArray({ min: 3, max: 3 }),
    body("publicSignals.*").custom(isUintString),
    body("nullifierHash").custom(isUintString),
    body("voteChoice").isInt({ min: 0 }),
  ],
  loadInvite,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { proof, publicSignals, nullifierHash, voteChoice } = req.body;
      const election = req.election;
      const voter = req.voter;

      if (!voter.registered || voter.inviteStatus === "pending") {
        return res.status(409).json({ error: "Invitation must be claimed before voting" });
      }
      if (voter.voted) return res.status(400).json({ error: "This voter has already voted" });
      if (!election.contractAddress && !isLOCALMode()) {
        return res.status(409).json({ error: "Election contract is not deployed" });
      }
      if (voteChoice < 0 || voteChoice >= election.candidates.length) {
        return res.status(400).json({ error: "Invalid candidate index" });
      }
      if (publicSignals[1] !== String(nullifierHash) || publicSignals[2] !== String(voteChoice)) {
        return res.status(400).json({ error: "Public signals mismatch" });
      }
      if (election.merkleRoot && String(publicSignals[0]) !== String(election.merkleRoot)) {
        return res.status(400).json({ error: "Merkle root mismatch" });
      }

      if (isLOCALMode() && !election.contractAddress) {
        const valid = await verifyProofOffChain(proof, publicSignals);
        if (!valid) return res.status(400).json({ error: "Invalid zk-SNARK proof" });

        const txHash = `LOCAL-${crypto.randomBytes(16).toString("hex")}`;
        const receiptCode = createReceiptCode();
        voter.voted = true;
        voter.votedAt = new Date();
        voter.inviteStatus = "voted";
        voter.voteChoice = Number(voteChoice);
        voter.voteTxHash = txHash;
        voter.receiptCodeHash = hashReceiptCode(receiptCode);
        await voter.save();

        election.votesCast += 1;
        await election.save();

        await AuditLog.create({
          orgId: election.orgId,
          electionId: election._id,
          actorType: "voter",
          actorId: voter._id.toString(),
          action: "vote.submitted.local",
          txHash,
          metadata: { nullifierHash, voteChoice },
        }).catch(() => null);

        return res.json({
          success: true,
          localMode: true,
          txHash,
          blockNumber: null,
          nullifierHash,
          voteChoice,
          receiptCode,
        });
      }

      const onChainRoot = await getMerkleRootForContract(election.contractAddress).catch(() => null);
      if (onChainRoot && String(publicSignals[0]) !== String(onChainRoot)) {
        return res.status(400).json({ error: "On-chain Merkle root mismatch" });
      }

      const valid = await verifyProofOffChain(proof, publicSignals);
      if (!valid) return res.status(400).json({ error: "Invalid zk-SNARK proof" });

      const { pA, pB, pC } = await proofToCalldata(proof, publicSignals);
      const { txHash, blockNumber } = await submitVoteOnChain(
        pA,
        pB,
        pC,
        BigInt(nullifierHash),
        BigInt(voteChoice),
        election.contractAddress
      );

      voter.voted = true;
      voter.votedAt = new Date();
      voter.inviteStatus = "voted";
      voter.voteChoice = Number(voteChoice);
      voter.voteTxHash = txHash;
      const receiptCode = createReceiptCode();
      voter.receiptCodeHash = hashReceiptCode(receiptCode);
      await voter.save();

      election.votesCast += 1;
      await election.save();

      await AuditLog.create({
        orgId: election.orgId,
        electionId: election._id,
        actorType: "voter",
        actorId: voter._id.toString(),
        action: "vote.submitted",
        txHash,
        metadata: { blockNumber, nullifierHash, voteChoice },
      }).catch(() => null);

      const emailResult = await sendVoteConfirmationEmail({
        to: voter.email,
        election,
        txHash,
        voteDate: voter.votedAt,
      }).catch((err) => ({ sent: false, error: err.message }));

      res.json({ success: true, txHash, blockNumber, nullifierHash, voteChoice, receiptCode, email: emailResult });
    } catch (err) {
      if (err.message?.includes("NullifierAlreadySpent")) {
        return res.status(400).json({ error: "This voter has already voted" });
      }
      if (err.message?.includes("InvalidProof")) {
        return res.status(400).json({ error: "Proof rejected by smart contract" });
      }
      next(err);
    }
  }
);

function publicElection(election) {
  return {
    id: election._id,
    title: election.title,
    description: election.description,
    status: election.status,
    startDate: election.startDate,
    endDate: election.endDate,
    candidates: election.candidates,
    merkleRoot: election.merkleRoot,
    contractAddress: election.contractAddress,
  };
}

module.exports = router;
