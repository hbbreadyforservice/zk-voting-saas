/**
 * zkProof.js
 * ==========
 * Groth16 proof generation / verification for the voting circuit.
 *
 * En production, la preuve est generee cote frontend. Ce service backend
 * sert surtout a verifier une preuve recue et a la convertir au format attendu
 * par le verifier Solidity.
 */

const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");
const { logger } = require("../middleware/logger");

const ZK_FILES_DIR = path.join(__dirname, "../zkfiles");
const WASM_PATH = path.join(ZK_FILES_DIR, "voting.wasm");
const ZKEY_PATH = path.join(ZK_FILES_DIR, "voting_final.zkey");
const VKEY_PATH = path.join(ZK_FILES_DIR, "verification_key.json");

let cachedVKey = null;

function isLOCALMode() {
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

function getVerificationKey() {
  if (!cachedVKey) {
    // La verification key est l'artefact public issu de la ceremony Groth16.
    // Elle permet de verifier une preuve sans connaitre les entrees privees.
    if (!fs.existsSync(VKEY_PATH)) {
      throw new Error("Verification key not found. Run circuits/setup.sh first.");
    }
    cachedVKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
  }
  return cachedVKey;
}

async function generateProof(input) {
  if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
    throw new Error(
      "Circuit artifacts not found. Run circuits/setup.sh first.\n" +
        `Expected:\n  ${WASM_PATH}\n  ${ZKEY_PATH}`
    );
  }

  logger.info("Generating zk-SNARK proof...");
  const startTime = Date.now();

  // Les signaux publics seront visibles par le contrat.
  // Les secrets, nullifier brut et chemin Merkle restent des entrees privees.
  const circuitInput = {
    merkleRoot: input.merkleRoot.toString(),
    nullifierHash: input.nullifierHash.toString(),
    voteChoice: input.voteChoice.toString(),
    secret: input.secret.toString(),
    nullifier: input.nullifier.toString(),
    pathElements: input.pathElements.map(String),
    pathIndices: input.pathIndices.map(Number),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);

  logger.info(`Proof generated in ${Date.now() - startTime}ms`);
  return { proof, publicSignals };
}

async function verifyProofOffChain(proof, publicSignals) {
  if (isLOCALMode()) {
    logger.warn("LOCAL mode enabled: skipping off-chain zk proof verification.");
    return true;
  }

  const vKey = getVerificationKey();
  // Verification rapide avant d'envoyer la transaction blockchain.
  // Le smart contract refera une verification cryptographique on-chain.
  return snarkjs.groth16.verify(vKey, publicSignals, proof);
}

async function proofToCalldata(proof, publicSignals) {
  if (isLOCALMode()) {
    return {
      pA: [1, 2],
      pB: [[1, 2], [3, 4]],
      pC: [1, 2],
      publicSignals: publicSignals.map(String),
    };
  }

  // snarkjs produit une chaine Solidity; on la parse pour obtenir les tableaux
  // pA, pB, pC que ZKVoting.castVote attend.
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const parsed = JSON.parse("[" + calldata + "]");

  return {
    pA: parsed[0],
    pB: parsed[1],
    pC: parsed[2],
    publicSignals: parsed[3],
  };
}

async function createAndVerifyProof(privateInputs, publicInputs) {
  const { proof, publicSignals } = await generateProof({
    ...publicInputs,
    ...privateInputs,
  });

  const valid = await verifyProofOffChain(proof, publicSignals);
  if (!valid) throw new Error("Generated proof failed off-chain verification");

  const calldata = await proofToCalldata(proof, publicSignals);
  return { proof, publicSignals, calldata, valid };
}

module.exports = {
  generateProof,
  verifyProofOffChain,
  proofToCalldata,
  createAndVerifyProof,
};

