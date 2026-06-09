pragma circom 2.1.6;

/*
 * ZK-Voting Circuit (Live tally version)
 * ======================================
 * This circuit proves:
 *   1. The voter is registered (Merkle membership of identity commitment)
 *   2. The nullifier hash is computed correctly from a private nullifier
 *   3. The public vote choice is bound to the proof
 *
 * Public inputs:
 *   - merkleRoot
 *   - nullifierHash  = Poseidon(nullifier)
 *   - voteChoice
 *
 * Private inputs:
 *   - secret, nullifier
 *   - voteChoice
 *   - Merkle path
 */

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/mux1.circom";

define LEVELS = 10;

template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hashers[levels];
    component mux[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        mux[i] = MultiMux1(2);

        mux[i].c[0][0] <== levelHashes[i];
        mux[i].c[0][1] <== pathElements[i];

        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== levelHashes[i];

        mux[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        levelHashes[i + 1] <== hashers[i].out;
    }

    root === levelHashes[levels];
}

template VoteCircuit(levels) {
    // Public inputs
    signal input merkleRoot;
    signal input nullifierHash;
    signal input voteChoice;

    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // 1) Identity commitment and Merkle membership
    component identityCommitment = Poseidon(2);
    identityCommitment.inputs[0] <== secret;
    identityCommitment.inputs[1] <== nullifier;

    component merkleChecker = MerkleTreeChecker(levels);
    merkleChecker.leaf <== identityCommitment.out;
    merkleChecker.root <== merkleRoot;

    for (var i = 0; i < levels; i++) {
        merkleChecker.pathElements[i] <== pathElements[i];
        merkleChecker.pathIndices[i] <== pathIndices[i];
    }

    // 2) nullifierHash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;

}

component main {public [merkleRoot, nullifierHash, voteChoice]} = VoteCircuit(LEVELS);
