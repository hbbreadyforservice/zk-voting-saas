#!/usr/bin/env bash
# =============================================================================
# VoteCloud production-oriented circuit setup
# =============================================================================
#
# This script compiles voting.circom and uses the Hermez Powers of Tau phase 1
# file instead of generating an unsafe local Powers of Tau ceremony.
#
# Important:
# - This is safer than the local dev setup because Phase 1 is reused from a
#   public ceremony.
# - For a real production launch, run a dedicated multi-party Phase 2 ceremony
#   for this exact circuit. See ../CEREMONY.md.
# =============================================================================

set -euo pipefail

CIRCUIT_NAME="voting"
BUILD_DIR="./build"
PTAU_DIR="./ptau"
ZK_BACKEND_DIR="../backend/src/zkfiles"
ZK_FRONTEND_DIR="../frontend/public/zkfiles"

PTAU_FILE="${PTAU_DIR}/powersOfTau28_hez_final_15.ptau"
PTAU_URL="${PTAU_URL:-https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau}"
PTAU_BLAKE2B="${PTAU_BLAKE2B:-982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e}"

PHASE2_ENTROPY="${PHASE2_ENTROPY:-}"
BEACON="${BEACON:-0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f}"

echo "=========================================="
echo " VoteCloud: Production Circuit Setup"
echo "=========================================="

if ! command -v circom >/dev/null 2>&1; then
  echo "[!] circom not found. Install circom first:"
  echo "    cargo install --git https://github.com/iden3/circom.git --tag v2.1.6"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[!] node is required."
  exit 1
fi

mkdir -p "$BUILD_DIR" "$PTAU_DIR" "$ZK_BACKEND_DIR" "$ZK_FRONTEND_DIR"

echo ""
echo "[1/6] Downloading Hermez Powers of Tau if missing"
if [ ! -f "$PTAU_FILE" ]; then
  if command -v curl >/dev/null 2>&1; then
    curl -L "$PTAU_URL" -o "$PTAU_FILE"
  elif command -v wget >/dev/null 2>&1; then
    wget "$PTAU_URL" -O "$PTAU_FILE"
  else
    echo "[!] curl or wget is required to download ${PTAU_URL}"
    exit 1
  fi
else
  echo "  Using existing ${PTAU_FILE}"
fi

echo ""
echo "[2/6] Verifying Powers of Tau hash"
node <<NODE
const fs = require("fs");
const crypto = require("crypto");
const file = "${PTAU_FILE}";
const expected = "${PTAU_BLAKE2B}";
const hash = crypto.createHash("blake2b512").update(fs.readFileSync(file)).digest("hex");
if (hash !== expected) {
  console.error("PTAU blake2b mismatch");
  console.error("expected:", expected);
  console.error("actual:  ", hash);
  process.exit(1);
}
console.log("  PTAU blake2b verified:", hash);
NODE

echo ""
echo "[3/6] Compiling ${CIRCUIT_NAME}.circom"
circom "${CIRCUIT_NAME}.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output "$BUILD_DIR" \
  -l ../node_modules

npx snarkjs r1cs info "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"

echo ""
echo "[4/6] Running circuit-specific Groth16 setup"
npx snarkjs groth16 setup \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "$PTAU_FILE" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey"

if [ -z "$PHASE2_ENTROPY" ]; then
  PHASE2_ENTROPY="VoteCloud production setup $(date -u +%Y-%m-%dT%H:%M:%SZ) $(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fi

npx snarkjs zkey contribute \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0001.zkey" \
  --name="VoteCloud initial phase2 contribution" \
  -v \
  -e="$PHASE2_ENTROPY"

npx snarkjs zkey beacon \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0001.zkey" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "$BEACON" \
  10 \
  -n="VoteCloud final beacon"

echo ""
echo "[5/6] Exporting verification artifacts"
npx snarkjs zkey export verificationkey \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "${BUILD_DIR}/verification_key.json"

npx snarkjs zkey export solidityverifier \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "../contracts/Verifier.sol"

npx snarkjs zkey verify \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "$PTAU_FILE" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey"

echo ""
echo "[6/6] Copying artifacts"
cp "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" "$ZK_BACKEND_DIR/"
cp "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" "$ZK_BACKEND_DIR/"
cp "${BUILD_DIR}/verification_key.json" "$ZK_BACKEND_DIR/"

cp "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" "$ZK_FRONTEND_DIR/"
cp "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" "$ZK_FRONTEND_DIR/"
cp "${BUILD_DIR}/verification_key.json" "$ZK_FRONTEND_DIR/"

node <<NODE
const fs = require("fs");
const crypto = require("crypto");
function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}
const metadata = {
  generatedAt: new Date().toISOString(),
  circuit: "${CIRCUIT_NAME}.circom",
  ptauFile: "${PTAU_FILE}",
  ptauUrl: "${PTAU_URL}",
  ptauBlake2b: "${PTAU_BLAKE2B}",
  r1csSha256: sha256("${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"),
  wasmSha256: sha256("${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"),
  zkeySha256: sha256("${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey"),
  verificationKeySha256: sha256("${BUILD_DIR}/verification_key.json"),
  warning: "Run a public multi-party Phase 2 ceremony before real production launch."
};
fs.writeFileSync("${BUILD_DIR}/ceremony-metadata.json", JSON.stringify(metadata, null, 2));
fs.copyFileSync("${BUILD_DIR}/ceremony-metadata.json", "${ZK_BACKEND_DIR}/ceremony-metadata.json");
fs.copyFileSync("${BUILD_DIR}/ceremony-metadata.json", "${ZK_FRONTEND_DIR}/ceremony-metadata.json");
console.log(JSON.stringify(metadata, null, 2));
NODE

echo ""
echo "=========================================="
echo " Production-oriented setup complete"
echo " Artifacts copied to:"
echo "   backend/src/zkfiles"
echo "   frontend/public/zkfiles"
echo "=========================================="
