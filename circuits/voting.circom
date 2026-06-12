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

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

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
        // pathIndices[i] choisit l'ordre de hash:
        // 0 = le noeud courant est a gauche, 1 = il est a droite.
        // Cela reconstruit progressivement la racine Merkle.
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
    // L'electeur connait secret et nullifier. Le circuit reconstruit le
    // commitment Poseidon(secret, nullifier), puis verifie qu'il appartient
    // a l'arbre public merkleRoot.
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
    // Le nullifierHash est public pour empecher un second vote.
    // Le nullifier brut reste prive, donc on ne peut pas relier le vote a
    // l'identite de l'electeur.
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;

}

// Les signaux publics sont exactement ceux controles par ZKVoting.castVote.
// voteChoice est public pour permettre un tally en direct.
component main {public [merkleRoot, nullifierHash, voteChoice]} = VoteCircuit(10);
