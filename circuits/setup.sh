#!/bin/bash
# =============================================================================
# zk-SNARK Trusted Setup for ZK-Voting
# =============================================================================
#
# This script performs the Groth16 trusted setup (Powers of Tau ceremony) and
# generates proving + verification keys for the voting circuit.
#
# Run this ONCE before deploying. In production, use a real multi-party
# ceremony (https://zkrepl.dev or https://p0tion.pse.dev).
#
# Steps:
#   1. Compile the circom circuit → R1CS + WASM witness generator
#   2. Powers of Tau ceremony (phase 1) — circuit-agnostic
#   3. Circuit-specific setup  (phase 2) — generates proving key
#   4. Export Solidity verifier
# =============================================================================

set -e  # exit on any error

CIRCUIT_NAME="voting"
BUILD_DIR="./build"
PTAU_DIR="./ptau"
PTAU_SIZE=12  # 2^12 = 4096 constraints — enough for depth-10 Merkle tree

echo "=========================================="
echo " ZK-Voting: Circuit Compilation & Setup"
echo "=========================================="

# --- Install dependencies if needed ---
if ! command -v circom &> /dev/null; then
  echo "[!] circom not found. Installing..."
  cargo install --git https://github.com/iden3/circom.git
fi

mkdir -p "$BUILD_DIR" "$PTAU_DIR"

# ===========================================================================
# STEP 1: Compile the circuit
# ===========================================================================
echo ""
echo "[1/4] Compiling circuit: ${CIRCUIT_NAME}.circom"

circom "${CIRCUIT_NAME}.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output "$BUILD_DIR" \
  -l ../node_modules

echo "  → R1CS: ${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"
echo "  → WASM: ${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"

# Print constraint count for reference
npx snarkjs r1cs info "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"

# ===========================================================================
# STEP 2: Powers of Tau ceremony (Phase 1 — circuit-agnostic)
#         In production: download an existing ceremony file from
#         https://github.com/iden3/snarkjs#7-prepare-phase-2
# ===========================================================================
echo ""
echo "[2/4] Powers of Tau ceremony (Phase 1)"

PTAU_FILE="${PTAU_DIR}/pot${PTAU_SIZE}_final.ptau"

if [ ! -f "$PTAU_FILE" ]; then
  echo "  Generating new powers of tau (this is for local dev only!)..."

  # Start ceremony
  npx snarkjs powersoftau new bn128 "$PTAU_SIZE" \
    "${PTAU_DIR}/pot${PTAU_SIZE}_0000.ptau" -v

  # Contribute entropy (use a real random beacon in production)
  npx snarkjs powersoftau contribute \
    "${PTAU_DIR}/pot${PTAU_SIZE}_0000.ptau" \
    "${PTAU_DIR}/pot${PTAU_SIZE}_0001.ptau" \
    --name="First contribution" -v -e="dev-randomness-$(date +%s)"

  # Prepare for phase 2
  npx snarkjs powersoftau prepare phase2 \
    "${PTAU_DIR}/pot${PTAU_SIZE}_0001.ptau" \
    "$PTAU_FILE" -v

  echo "  → PTAU: ${PTAU_FILE}"
else
  echo "  Using existing ptau file: ${PTAU_FILE}"
fi

# ===========================================================================
# STEP 3: Circuit-specific setup (Phase 2)
#         Generates the proving key (zkey) and verification key
# ===========================================================================
echo ""
echo "[3/4] Circuit-specific setup (Phase 2)"

# Generate initial zkey
npx snarkjs groth16 setup \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "$PTAU_FILE" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey"

# Contribute to phase 2 (add your own randomness)
npx snarkjs zkey contribute \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0001.zkey" \
  --name="Dev contribution" -v -e="more-dev-randomness-$(date +%s)"

# Finalize the proving key
npx snarkjs zkey beacon \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0001.zkey" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" \
  10 -n="Final Beacon"

# Export the verification key (JSON — used by backend for off-chain verification)
npx snarkjs zkey export verificationkey \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "${BUILD_DIR}/verification_key.json"

echo "  → Proving key:      ${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey"
echo "  → Verification key: ${BUILD_DIR}/verification_key.json"

# ===========================================================================
# STEP 4: Export Solidity verifier contract
#         This auto-generates a Solidity Groth16 verifier from the zkey
# ===========================================================================
echo ""
echo "[4/4] Exporting Solidity verifier"

npx snarkjs zkey export solidityverifier \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "../contracts/Verifier.sol"

echo "  → Solidity verifier: ../contracts/Verifier.sol"

# Copy WASM and zkey to backend for proof generation
mkdir -p ../backend/src/zkfiles
cp "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" ../backend/src/zkfiles/
cp "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" ../backend/src/zkfiles/
cp "${BUILD_DIR}/verification_key.json" ../backend/src/zkfiles/

echo ""
echo "=========================================="
echo " Setup complete!"
echo " Files copied to backend/src/zkfiles/"
echo "=========================================="
echo ""
echo " Next steps:"
echo "   1. npx hardhat compile"
echo "   2. npx hardhat run scripts/deploy.js --network localhost"
echo "   3. cd backend && npm start"
