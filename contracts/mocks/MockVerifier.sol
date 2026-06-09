// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockVerifier
 * @notice Test double for the Groth16 verifier.
 *         Returns a configurable pass/fail so smart contract
 *         logic can be tested independently of the zk-SNARK.
 */
contract MockVerifier {
    bool public immutable shouldPass;

    constructor(bool _shouldPass) {
        shouldPass = _shouldPass;
    }

    function verifyProof(
        uint256[2]    calldata, /* pA */
        uint256[2][2] calldata, /* pB */
        uint256[2]    calldata, /* pC */
        uint256[3]    calldata  /* publicSignals */
    ) external view returns (bool) {
        return shouldPass;
    }
}

