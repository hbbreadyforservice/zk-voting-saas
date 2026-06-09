$ErrorActionPreference = "Stop"

$CircuitName = "voting"
$BuildDir = ".\build"
$PtauFile = if ($env:PTAU_FILE) { $env:PTAU_FILE } else { ".\ptau\powersOfTau28_hez_final_15.ptau" }
$MetadataFile = Join-Path $BuildDir "ceremony-metadata.json"

Write-Host "=========================================="
Write-Host " VoteCloud Ceremony Verification"
Write-Host "=========================================="

$required = @(
  "$BuildDir\$CircuitName.r1cs",
  "$BuildDir\${CircuitName}_js\$CircuitName.wasm",
  "$BuildDir\${CircuitName}_final.zkey",
  "$BuildDir\verification_key.json",
  $PtauFile
)

foreach ($file in $required) {
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Missing required file: $file"
  }
  Write-Host "  found: $file"
}

Write-Host ""
Write-Host "[1/4] snarkjs r1cs info"
npx snarkjs r1cs info "$BuildDir\$CircuitName.r1cs"

Write-Host ""
Write-Host "[2/4] snarkjs zkey verify"
npx snarkjs zkey verify "$BuildDir\$CircuitName.r1cs" $PtauFile "$BuildDir\${CircuitName}_final.zkey"

Write-Host ""
Write-Host "[3/4] Verifying metadata hashes if available"
if (Test-Path -LiteralPath $MetadataFile) {
  node -e @"
const fs = require('fs');
const crypto = require('crypto');
const metadata = JSON.parse(fs.readFileSync('$($MetadataFile.Replace('\','\\'))', 'utf8'));
const files = {
  r1csSha256: '$($BuildDir.Replace('\','\\'))\\\\$CircuitName.r1cs',
  wasmSha256: '$($BuildDir.Replace('\','\\'))\\\\${CircuitName}_js\\\\$CircuitName.wasm',
  zkeySha256: '$($BuildDir.Replace('\','\\'))\\\\${CircuitName}_final.zkey',
  verificationKeySha256: '$($BuildDir.Replace('\','\\'))\\\\verification_key.json',
};
for (const [key, file] of Object.entries(files)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (metadata[key] && metadata[key] !== actual) {
    console.error(`${key} mismatch`);
    console.error('expected:', metadata[key]);
    console.error('actual:  ', actual);
    process.exit(1);
  }
  console.log(`${key}: ${actual}`);
}
"@
} else {
  Write-Host "  metadata file not found; skipping metadata hash check"
}

Write-Host ""
Write-Host "[4/4] Checking copied artifacts"
foreach ($dir in @("..\backend\src\zkfiles", "..\frontend\public\zkfiles")) {
  foreach ($artifact in @("$CircuitName.wasm", "${CircuitName}_final.zkey", "verification_key.json")) {
    $path = Join-Path $dir $artifact
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Missing copied artifact: $path"
    }
    Write-Host "  found: $path"
  }
}

Write-Host ""
Write-Host "Verification complete."
