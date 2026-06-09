/**
 * services/zkProof.js (frontend)
 */

import * as snarkjs from "snarkjs";
import contractsConfig from "../config/contracts.json";

const WASM_URL = "/zkfiles/voting.wasm";
const ZKEY_URL = "/zkfiles/voting_final.zkey";
const LOCAL_MODE = process.env.REACT_APP_LOCAL_MODE === "true" || contractsConfig?.LOCALMode === true;

async function poseidonHash(inputs) {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const hash = poseidon(inputs);
  return poseidon.F.toObject(hash);
}

export async function computeCommitment(secret, nullifier) {
  return (await poseidonHash([BigInt(secret), BigInt(nullifier)])).toString();
}

export async function computeNullifierHash(nullifier) {
  return (await poseidonHash([BigInt(nullifier)])).toString();
}

export async function generateVoteProof({
  secret,
  nullifier,
  voteChoice,
  pathElements,
  pathIndices,
  merkleRoot,
}) {
  const nullifierHash = await computeNullifierHash(nullifier);
  const publicSignals = [merkleRoot.toString(), nullifierHash.toString(), voteChoice.toString()];

  if (LOCAL_MODE) {
    const proof = { LOCALMode: true };
    const calldata = {
      pA: [1, 2],
      pB: [[1, 2], [3, 4]],
      pC: [1, 2],
      publicSignals,
    };

    return { proof, publicSignals, nullifierHash, voteChoice: voteChoice.toString(), calldata };
  }

  const circuitInput = {
    merkleRoot: merkleRoot.toString(),
    nullifierHash: nullifierHash.toString(),
    voteChoice: voteChoice.toString(),
    secret: BigInt(secret).toString(),
    nullifier: BigInt(nullifier).toString(),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(Number),
  };

  const { proof, publicSignals: generatedSignals } = await snarkjs.groth16.fullProve(circuitInput, WASM_URL, ZKEY_URL);

  const calldataRaw = await snarkjs.groth16.exportSolidityCallData(proof, generatedSignals);
  const parsed = JSON.parse("[" + calldataRaw + "]");

  const calldata = {
    pA: parsed[0],
    pB: parsed[1],
    pC: parsed[2],
    publicSignals: parsed[3],
  };

  return {
    proof,
    publicSignals: generatedSignals,
    nullifierHash,
    voteChoice: voteChoice.toString(),
    calldata,
  };
}

export async function verifyProofClientSide(proof, publicSignals) {
  if (LOCAL_MODE) return true;

  const vkeyRes = await fetch("/zkfiles/verification_key.json");
  const vkey = await vkeyRes.json();
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

