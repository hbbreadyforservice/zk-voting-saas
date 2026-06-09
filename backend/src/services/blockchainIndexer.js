const Election = require("../models/Election");
const AuditLog = require("../models/AuditLog");
const { logger } = require("../middleware/logger");
const { getVotingContract } = require("./blockchain");

const watchedContracts = new Map();

async function startBlockchainIndexer() {
  if (process.env.BLOCKCHAIN_INDEXER_ENABLED === "false") {
    logger.info("Blockchain indexer disabled by BLOCKCHAIN_INDEXER_ENABLED=false");
    return;
  }

  await watchKnownElections();

  const intervalMs = Number(process.env.BLOCKCHAIN_INDEXER_SCAN_MS || 30_000);
  setInterval(() => {
    watchKnownElections().catch((err) => logger.error("Blockchain indexer scan failed", err));
  }, intervalMs);

  logger.info(`Blockchain indexer started, scan interval=${intervalMs}ms`);
}

async function watchKnownElections() {
  const elections = await Election.find({
    contractAddress: { $exists: true, $ne: null },
  }).select("_id orgId title contractAddress status votesCast");

  for (const election of elections) {
    watchElection(election);
  }
}

function watchElection(election) {
  const address = String(election.contractAddress).toLowerCase();
  if (watchedContracts.has(address)) return;

  const contract = getVotingContract(election.contractAddress);

  contract.on("MerkleRootUpdated", async (oldRoot, newRoot, event) => {
    await handleMerkleRootUpdated(election._id, oldRoot, newRoot, event).catch((err) =>
      logger.error("MerkleRootUpdated indexing failed", err)
    );
  });

  contract.on("ElectionStarted", async (name, startTime, endTime, event) => {
    await handleElectionStarted(election._id, name, startTime, endTime, event).catch((err) =>
      logger.error("ElectionStarted indexing failed", err)
    );
  });

  contract.on("ElectionEnded", async (timestamp, event) => {
    await handleElectionEnded(election._id, timestamp, event).catch((err) =>
      logger.error("ElectionEnded indexing failed", err)
    );
  });

  contract.on("VoteCast", async (nullifierHash, voteChoice, timestamp, event) => {
    await handleVoteCast(election._id, nullifierHash, voteChoice, timestamp, event).catch((err) =>
      logger.error("VoteCast indexing failed", err)
    );
  });

  watchedContracts.set(address, contract);
  logger.info(`Blockchain indexer watching ZKVoting ${election.contractAddress}`);
}

async function handleMerkleRootUpdated(electionId, _oldRoot, newRoot, event) {
  const election = await Election.findById(electionId);
  if (!election) return;

  election.merkleRoot = newRoot.toString();
  await election.save();

  await audit(election, "chain.merkle_root_updated", event, {
    merkleRoot: newRoot.toString(),
  });
}

async function handleElectionStarted(electionId, _name, _startTime, endTime, event) {
  const election = await Election.findById(electionId);
  if (!election) return;

  election.status = "voting_open";
  election.endDate = new Date(Number(endTime) * 1000);
  election.openedTxHash = event.log?.transactionHash || event.transactionHash || election.openedTxHash;
  await election.save();

  await audit(election, "chain.election_started", event, {
    endTime: endTime.toString(),
  });
}

async function handleElectionEnded(electionId, timestamp, event) {
  const election = await Election.findById(electionId);
  if (!election) return;

  election.status = "closed";
  election.closedTxHash = event.log?.transactionHash || event.transactionHash || election.closedTxHash;
  await election.save();

  await audit(election, "chain.election_ended", event, {
    timestamp: timestamp.toString(),
  });
}

async function handleVoteCast(electionId, nullifierHash, voteChoice, timestamp, event) {
  const election = await Election.findById(electionId);
  if (!election) return;

  const chainTotal = await getVotingContract(election.contractAddress).totalVotes().catch(() => null);
  if (chainTotal !== null) {
    election.votesCast = Number(chainTotal);
  } else {
    election.votesCast += 1;
  }
  await election.save();

  await audit(election, "chain.vote_cast", event, {
    nullifierHash: nullifierHash.toString(),
    voteChoice: voteChoice.toString(),
    timestamp: timestamp.toString(),
  });
}

async function audit(election, action, event, metadata = {}) {
  const txHash = event.log?.transactionHash || event.transactionHash || null;
  const blockNumber = event.log?.blockNumber || event.blockNumber || null;

  await AuditLog.create({
    orgId: election.orgId,
    electionId: election._id,
    actorType: "system",
    action,
    txHash,
    metadata: {
      ...metadata,
      blockNumber,
      contractAddress: election.contractAddress,
    },
  }).catch(() => null);
}

function getWatchedContracts() {
  return Array.from(watchedContracts.keys());
}

module.exports = {
  startBlockchainIndexer,
  watchKnownElections,
  watchElection,
  getWatchedContracts,
};
