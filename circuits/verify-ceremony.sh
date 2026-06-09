#!/usr/bin/env bash
# Verify VoteCloud circuit setup artifacts.

set -euo pipefail

CIRCUIT_NAME="voting"
BUILD_DIR="./build"
PTAU_FILE="${PTAU_FILE:-./ptau/powersOfTau28_hez_final_15.ptau}"
METADATA_FILE="${BUILD_DIR}/ceremony-metadata.json"

echo "=========================================="
echo " VoteCloud Ceremony Verification"
echo "=========================================="

required=(
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"
  "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey"
  "${BUILD_DIR}/verification_key.json"
  "$PTAU_FILE"
)

for file in "${required[@]}"; do
  if [ ! -f "$file" ]; then
    echo "[!] Missing required file: $file"
    exit 1
  fi
  echo "  found: $file"
done

echo ""
echo "[1/4] snarkjs r1cs info"
npx snarkjs r1cs info "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs"

echo ""
echo "[2/4] snarkjs zkey verify"
npx snarkjs zkey verify \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "$PTAU_FILE" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey"

echo ""
echo "[3/4] Verifying metadata hashes if available"
if [ -f "$METADATA_FILE" ]; then
  node <<NODE
const fs = require("fs");
const crypto = require("crypto");
const metadata = JSON.parse(fs.readFileSync("${METADATA_FILE}", "utf8"));
const files = {
  r1csSha256: "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs",
  wasmSha256: "${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm",
  zkeySha256: "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey",
  verificationKeySha256: "${BUILD_DIR}/verification_key.json",
};
for (const [key, file] of Object.entries(files)) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (metadata[key] && metadata[key] !== actual) {
    console.error(`${key} mismatch`);
    console.error("expected:", metadata[key]);
    console.error("actual:  ", actual);
    process.exit(1);
  }
  console.log(`${key}: ${actual}`);
}
NODE
else
  echo "  metadata file not found; skipping metadata hash check"
fi

echo ""
echo "[4/4] Checking copied artifacts"
for dir in "../backend/src/zkfiles" "../frontend/public/zkfiles"; do
  for artifact in "${CIRCUIT_NAME}.wasm" "${CIRCUIT_NAME}_final.zkey" "verification_key.json"; do
    if [ ! -f "${dir}/${artifact}" ]; then
      echo "[!] Missing copied artifact: ${dir}/${artifact}"
      exit 1
    fi
    echo "  found: ${dir}/${artifact}"
  done
done

echo ""
echo "Verification complete."
