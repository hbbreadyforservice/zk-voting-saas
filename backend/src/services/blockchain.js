/**
 * blockchain.js
 * =============
 * Ethers.js interface to the ZKVoting smart contract.
 *
 * Ce service isole toutes les interactions Ethereum du reste du backend:
 * les routes appellent des fonctions metier, et ce fichier signe/envoie les
 * transactions avec le wallet admin configure.
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { logger } = require("../middleware/logger");

let provider;
let adminWallet;
let votingContract;
let factoryContract;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  }
  return provider;
}

function getAdminWallet() {
  if (!adminWallet) {
    // Le backend agit comme relayer: l'electeur n'a pas besoin d'ETH.
    // La cle admin doit donc etre protegee en production.
    const wallet = new ethers.Wallet(
      process.env.ADMIN_PRIVATE_KEY ||
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      getProvider()
    );
    adminWallet = new ethers.NonceManager(wallet);
  }
  return adminWallet;
}

function getVotingContract(contractAddress) {
  const configPath = path.join(__dirname, "../config/contracts.json");
  const abiPath = path.join(__dirname, "../config/abi/ZKVoting.json");

  if (!fs.existsSync(configPath) || !fs.existsSync(abiPath)) {
    throw new Error("Contract config not found. Run: npx hardhat run scripts/deploy.js");
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const address = contractAddress || config.votingAddress;

  if (!address) {
    throw new Error("Voting contract address missing.");
  }

  return new ethers.Contract(address, abi, getAdminWallet());
}

function getContracts() {
  if (votingContract) return { provider, adminWallet, votingContract };

  const configPath = path.join(__dirname, "../config/contracts.json");
  const abiPath = path.join(__dirname, "../config/abi/ZKVoting.json");

  if (!fs.existsSync(configPath) || !fs.existsSync(abiPath)) {
    throw new Error("Contract config not found. Run: npx hardhat run scripts/deploy.js");
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  provider = getProvider();
  adminWallet = getAdminWallet();
  votingContract = new ethers.Contract(config.votingAddress, abi, adminWallet);
  logger.info(`Connected to ZKVoting at ${config.votingAddress}`);

  return { provider, adminWallet, votingContract };
}

function getFactoryContract() {
  if (factoryContract) return factoryContract;

  const configPath = path.join(__dirname, "../config/contracts.json");
  const abiPath = path.join(__dirname, "../config/abi/VoteCloudFactory.json");

  if (!fs.existsSync(configPath) || !fs.existsSync(abiPath)) {
    throw new Error("Factory config not found. Run the ZK Voting factory deployment first.");
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!config.factoryAddress) {
    throw new Error("factoryAddress missing from contract config. Redeploy with scripts/deploy.js.");
  }

  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  factoryContract = new ethers.Contract(config.factoryAddress, abi, getAdminWallet());
  logger.info(`Connected to VoteCloudFactory at ${config.factoryAddress}`);

  return factoryContract;
}

async function createElectionOnChain(electionName, candidates, durationSecs) {
  // La factory deploie un nouveau contrat ZKVoting par election.
  // L'evenement ElectionCreated donne l'adresse a sauvegarder dans MongoDB.
  const factory = getFactoryContract();
  const tx = await factory.createElection(electionName, candidates, durationSecs);
  const receipt = await tx.wait();

  let electionId = null;
  let electionAddress = null;

  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "ElectionCreated") {
        electionId = parsed.args.electionId.toString();
        electionAddress = parsed.args.electionAddress;
        break;
      }
    } catch {
      // Ignore logs emitted by contracts other than the factory.
    }
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    electionId,
    electionAddress,
  };
}

async function submitVoteOnChain(pA, pB, pC, nullifierHash, voteChoice, contractAddress) {
  // Point final du flow de vote: on transmet la preuve Groth16 et les signaux
  // publics au contrat, qui verifie puis incremente le tally.
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;

  const tx = await contract.castVote(pA, pB, pC, nullifierHash, voteChoice);
  const receipt = await tx.wait();

  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

async function updateMerkleRootOnChain(newRoot, contractAddress) {
  // Synchronise le registre off-chain des electeurs avec le contrat.
  // Une preuve basee sur une autre racine sera rejetee.
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;
  const tx = await contract.updateMerkleRoot(BigInt(newRoot));
  await tx.wait();
  return tx.hash;
}

async function startVotingOnChain(durationSecs, contractAddress) {
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;
  const tx = await contract.startVoting(durationSecs);
  await tx.wait();
  return tx.hash;
}

async function endVotingOnChain(contractAddress) {
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;
  const tx = await contract.endVoting();
  await tx.wait();
  return tx.hash;
}

async function addAdminOnChain(newAdmin) {
  const { votingContract } = getContracts();
  const tx = await votingContract.addAdmin(newAdmin);
  await tx.wait();
  return tx.hash;
}

async function removeAdminOnChain(oldAdmin) {
  const { votingContract } = getContracts();
  const tx = await votingContract.removeAdmin(oldAdmin);
  await tx.wait();
  return tx.hash;
}

async function getElectionResults(contractAddress) {
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;
  const [names, tallies] = await contract.getResults();
  const info = await contract.getElectionInfo();

  return {
    electionName: info[0],
    isOpen: info[1],
    startTime: Number(info[2]),
    endTime: Number(info[3]),
    totalVotes: Number(info[4]),
    numCandidates: Number(info[5]),
    results: names.map((name, i) => ({
      candidateIndex: i,
      name,
      votes: Number(tallies[i]),
    })),
  };
}

async function isNullifierSpent(nullifierHash, contractAddress) {
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;
  return contract.isNullifierSpent(BigInt(nullifierHash));
}

async function getMerkleRoot(contractAddress) {
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;
  const root = await contract.merkleRoot();
  return root.toString();
}

async function getMerkleRootForContract(contractAddress) {
  const contract = getVotingContract(contractAddress);
  const root = await contract.merkleRoot();
  return root.toString();
}

async function getCandidateCount(contractAddress) {
  const contract = contractAddress ? getVotingContract(contractAddress) : getContracts().votingContract;
  const count = await contract.candidateCount();
  return Number(count);
}

module.exports = {
  getContracts,
  getVotingContract,
  getFactoryContract,
  createElectionOnChain,
  submitVoteOnChain,
  updateMerkleRootOnChain,
  startVotingOnChain,
  endVotingOnChain,
  addAdminOnChain,
  removeAdminOnChain,
  getElectionResults,
  isNullifierSpent,
  getMerkleRoot,
  getMerkleRootForContract,
  getCandidateCount,
};

