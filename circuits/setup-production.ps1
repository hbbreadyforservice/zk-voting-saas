$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Run-Step {
  param(
    [Parameter(Mandatory = $true)]
    [ScriptBlock] $Command
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

$CircuitName = "voting"
$BuildDir = ".\build"
$PtauDir = ".\ptau"
$BackendZkDir = "..\backend\src\zkfiles"
$FrontendZkDir = "..\frontend\public\zkfiles"

$PtauFile = Join-Path $PtauDir "powersOfTau28_hez_final_15.ptau"
$PtauUrl = if ($env:PTAU_URL) { $env:PTAU_URL } else { "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau" }
$PtauBlake2b = if ($env:PTAU_BLAKE2B) { $env:PTAU_BLAKE2B } else { "982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e" }
$Beacon = if ($env:BEACON) { $env:BEACON } else { "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" }

Write-Host "=========================================="
Write-Host " VoteCloud: Production Circuit Setup"
Write-Host "=========================================="

if (-not (Get-Command circom -ErrorAction SilentlyContinue)) {
  throw "circom not found. Install circom first: cargo install --git https://github.com/iden3/circom.git --tag v2.1.6"
}

New-Item -ItemType Directory -Force -Path $BuildDir, $PtauDir, $BackendZkDir, $FrontendZkDir | Out-Null

Write-Host ""
Write-Host "[1/6] Downloading Hermez Powers of Tau if missing"
if (-not (Test-Path -LiteralPath $PtauFile)) {
  Invoke-WebRequest -Uri $PtauUrl -OutFile $PtauFile
} else {
  Write-Host "  Using existing $PtauFile"
}

Write-Host ""
Write-Host "[2/6] Verifying Powers of Tau hash"
$actualPtauHash = node -e "const fs=require('fs');const crypto=require('crypto');console.log(crypto.createHash('blake2b512').update(fs.readFileSync(process.argv[1])).digest('hex'))" $PtauFile
if ($actualPtauHash.Trim() -ne $PtauBlake2b) {
  throw "PTAU blake2b mismatch. Expected $PtauBlake2b but got $actualPtauHash"
}
Write-Host "  PTAU blake2b verified: $actualPtauHash"

Write-Host ""
Write-Host "[3/6] Compiling $CircuitName.circom"
Run-Step { circom "$CircuitName.circom" --r1cs --wasm --sym --output $BuildDir -l ..\node_modules }
Run-Step { npx snarkjs r1cs info "$BuildDir\$CircuitName.r1cs" }

Write-Host ""
Write-Host "[4/6] Running circuit-specific Groth16 setup"
Run-Step { npx snarkjs groth16 setup "$BuildDir\$CircuitName.r1cs" $PtauFile "$BuildDir\${CircuitName}_0000.zkey" }

$phase2Entropy = if ($env:PHASE2_ENTROPY) {
  $env:PHASE2_ENTROPY
} else {
  "VoteCloud production setup $([DateTime]::UtcNow.ToString('o')) $(node -e `"console.log(require('crypto').randomBytes(32).toString('hex'))`")"
}

Run-Step { npx snarkjs zkey contribute "$BuildDir\${CircuitName}_0000.zkey" "$BuildDir\${CircuitName}_0001.zkey" --name="VoteCloud initial phase2 contribution" -v -e="$phase2Entropy" }
Run-Step { npx snarkjs zkey beacon "$BuildDir\${CircuitName}_0001.zkey" "$BuildDir\${CircuitName}_final.zkey" $Beacon 10 -n="VoteCloud final beacon" }

Write-Host ""
Write-Host "[5/6] Exporting verification artifacts"
Run-Step { npx snarkjs zkey export verificationkey "$BuildDir\${CircuitName}_final.zkey" "$BuildDir\verification_key.json" }
Run-Step { npx snarkjs zkey export solidityverifier "$BuildDir\${CircuitName}_final.zkey" "..\contracts\Verifier.sol" }
Run-Step { npx snarkjs zkey verify "$BuildDir\$CircuitName.r1cs" $PtauFile "$BuildDir\${CircuitName}_final.zkey" }

Write-Host ""
Write-Host "[6/6] Copying artifacts"
Copy-Item "$BuildDir\${CircuitName}_js\$CircuitName.wasm" $BackendZkDir -Force
Copy-Item "$BuildDir\${CircuitName}_final.zkey" $BackendZkDir -Force
Copy-Item "$BuildDir\verification_key.json" $BackendZkDir -Force
Copy-Item "$BuildDir\${CircuitName}_js\$CircuitName.wasm" $FrontendZkDir -Force
Copy-Item "$BuildDir\${CircuitName}_final.zkey" $FrontendZkDir -Force
Copy-Item "$BuildDir\verification_key.json" $FrontendZkDir -Force

node -e @"
const fs = require('fs');
const crypto = require('crypto');
function sha256(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}
const metadata = {
  generatedAt: new Date().toISOString(),
  circuit: '$CircuitName.circom',
  ptauFile: '$($PtauFile.Replace('\','\\'))',
  ptauUrl: '$PtauUrl',
  ptauBlake2b: '$PtauBlake2b',
  r1csSha256: sha256('$($BuildDir.Replace('\','\\'))\\\\$CircuitName.r1cs'),
  wasmSha256: sha256('$($BuildDir.Replace('\','\\'))\\\\${CircuitName}_js\\\\$CircuitName.wasm'),
  zkeySha256: sha256('$($BuildDir.Replace('\','\\'))\\\\${CircuitName}_final.zkey'),
  verificationKeySha256: sha256('$($BuildDir.Replace('\','\\'))\\\\verification_key.json'),
  warning: 'Run a public multi-party Phase 2 ceremony before real production launch.'
};
fs.writeFileSync('$($BuildDir.Replace('\','\\'))\\\\ceremony-metadata.json', JSON.stringify(metadata, null, 2));
fs.copyFileSync('$($BuildDir.Replace('\','\\'))\\\\ceremony-metadata.json', '$($BackendZkDir.Replace('\','\\'))\\\\ceremony-metadata.json');
fs.copyFileSync('$($BuildDir.Replace('\','\\'))\\\\ceremony-metadata.json', '$($FrontendZkDir.Replace('\','\\'))\\\\ceremony-metadata.json');
console.log(JSON.stringify(metadata, null, 2));
"@

Write-Host ""
Write-Host "=========================================="
Write-Host " Production-oriented setup complete"
Write-Host " Artifacts copied to backend/src/zkfiles and frontend/public/zkfiles"
Write-Host "=========================================="
