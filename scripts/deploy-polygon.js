/**
 * deploy-polygon.js
 * =================
 * Production deployment for VoteCloud on Polygon Amoy or Polygon mainnet.
 *
 * This script intentionally deploys the real Groth16 Verifier, never the mock.
 * Run npm run compile:circuit:production first so contracts/Verifier.sol exists.
 */

const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

function assertProductionVerifierExists() {
  const verifierPath = path.join(__dirname, "../contracts/Verifier.sol");
  if (!fs.existsSync(verifierPath)) {
    throw new Error(
      "contracts/Verifier.sol is missing. Run npm run compile:circuit:production or finish the Phase 2 ceremony before deploying to Polygon."
    );
  }
}

function readArtifactAbi(relativeArtifactPath) {
  const artifactPath = path.join(__dirname, "../artifacts/contracts", relativeArtifactPath);
  if (!fs.existsSync(artifactPath)) return null;
  return JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function isValidPrivateKey(value) {
  if (!value) return false;
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(normalized);
}

function isConfiguredValue(value) {
  return Boolean(value) && !/your_|changeme|placeholder|xxxx|todo/i.test(value);
}

function assertDeploymentEnvironment() {
  const hasPrivateKey = isValidPrivateKey(process.env.PRIVATE_KEY) || isValidPrivateKey(process.env.ADMIN_PRIVATE_KEY);
  if (!hasPrivateKey) {
    throw new Error(
      "No valid deployer private key configured. Set PRIVATE_KEY or ADMIN_PRIVATE_KEY to a 32-byte hex private key before deploying."
    );
  }

  const requiredRpcByNetwork = {
    polygonAmoy: process.env.POLYGON_AMOY_RPC_URL || process.env.AMOY_RPC_URL,
    polygon: process.env.POLYGON_MAINNET_RPC_URL || process.env.POLYGON_RPC_URL,
  };
  const rpcUrl = requiredRpcByNetwork[hre.network.name];
  if (!isConfiguredValue(rpcUrl)) {
    throw new Error(`No valid RPC URL configured for ${hre.network.name}. Fill the matching RPC URL in .env before deploying.`);
  }
}

async function verifyContract(address, constructorArguments, label) {
  const hasApiKey = Boolean(process.env.POLYGONSCAN_API_KEY || process.env.ETHERSCAN_API_KEY);
  if (!hasApiKey) {
    console.log(` Skipping ${label} verification: POLYGONSCAN_API_KEY is not configured.`);
    return;
  }

  const delayMs = Number(process.env.VERIFY_DELAY_MS || 30000);
  console.log(` Waiting ${Math.round(delayMs / 1000)}s before verifying ${label}...`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  try {
    await hre.run("verify:verify", { address, constructorArguments });
    console.log(` ${label} verified on Polygonscan.`);
  } catch (err) {
    const message = err.message || String(err);
    if (message.toLowerCase().includes("already verified")) {
      console.log(` ${label} is already verified.`);
      return;
    }
    console.warn(` ${label} verification failed: ${message}`);
  }
}

async function main() {
  assertProductionVerifierExists();
  assertDeploymentEnvironment();

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const confirmations = hre.network.name === "polygon" ? 5 : Number(process.env.DEPLOY_CONFIRMATIONS || 2);

  console.log("");
  console.log("==========================================");
  console.log(" VoteCloud Polygon Deployment");
  console.log("==========================================");
  console.log(" Deployer:", deployer.address);
  console.log(" Network:", hre.network.name, `(${network.chainId})`);
  console.log(" Confirmations:", confirmations);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(" Balance:", ethers.formatEther(balance), "MATIC/POL");

  console.log("");
  console.log("[1/2] Deploying real Verifier...");
  const Verifier = await ethers.getContractFactory("Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  await verifier.deploymentTransaction().wait(confirmations);
  const verifierAddress = await verifier.getAddress();
  console.log(" Verifier:", verifierAddress);

  console.log("");
  console.log("[2/2] Deploying VoteCloudFactory...");
  const VoteCloudFactory = await ethers.getContractFactory("VoteCloudFactory");
  const factory = await VoteCloudFactory.deploy(verifierAddress);
  await factory.waitForDeployment();
  await factory.deploymentTransaction().wait(confirmations);
  const factoryAddress = await factory.getAddress();
  console.log(" VoteCloudFactory:", factoryAddress);

  let demoElectionAddress = null;
  if (process.env.CREATE_DEFAULT_ELECTION === "true") {
    console.log("");
    console.log("[optional] Creating default demo election...");
    const electionName = process.env.DEFAULT_ELECTION_NAME || "VoteCloud Demo Election";
    const candidates = (process.env.DEFAULT_CANDIDATES || "Alice,Bob")
      .split(",")
      .map((candidate) => candidate.trim())
      .filter(Boolean);
    const durationSecs = Number(process.env.DEFAULT_DURATION_SECS || 7 * 24 * 60 * 60);
    const tx = await factory.createElection(electionName, candidates, durationSecs);
    await tx.wait(confirmations);
    const electionAddresses = await factory.getOrganizationElections(deployer.address);
    demoElectionAddress = electionAddresses[electionAddresses.length - 1];
    console.log(" Demo ZKVoting:", demoElectionAddress);
  }

  const explorerBase = hre.network.name === "polygon" ? "https://polygonscan.com" : "https://amoy.polygonscan.com";
  const config = {
    network: hre.network.name,
    chainId: network.chainId.toString(),
    verifierAddress,
    factoryAddress,
    votingAddress: demoElectionAddress,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    production: true,
    explorer: {
      verifier: `${explorerBase}/address/${verifierAddress}`,
      factory: `${explorerBase}/address/${factoryAddress}`,
      demoElection: demoElectionAddress ? `${explorerBase}/address/${demoElectionAddress}` : null,
    },
  };

  const backendConfigPath = path.join(__dirname, "../backend/src/config/contracts.json");
  const frontendConfigPath = path.join(__dirname, "../frontend/src/config/contracts.json");
  writeJson(backendConfigPath, config);
  writeJson(frontendConfigPath, config);

  const abiCopies = [
    { targetName: "ZKVoting", relativeArtifactPath: "ZKVoting.sol/ZKVoting.json" },
    { targetName: "VoteCloudFactory", relativeArtifactPath: "VoteCloudFactory.sol/VoteCloudFactory.json" },
    { targetName: "Verifier", relativeArtifactPath: "Verifier.sol/Verifier.json" },
  ];

  const backendAbiDir = path.join(__dirname, "../backend/src/config/abi");
  const frontendAbiDir = path.join(__dirname, "../frontend/src/config/abi");
  for (const { targetName, relativeArtifactPath } of abiCopies) {
    const abi = readArtifactAbi(relativeArtifactPath);
    if (!abi) throw new Error(`ABI not found for ${targetName}: ${relativeArtifactPath}`);
    writeJson(path.join(backendAbiDir, `${targetName}.json`), abi);
    writeJson(path.join(frontendAbiDir, `${targetName}.json`), abi);
  }

  console.log("");
  console.log("[verify] Polygonscan verification");
  await verifyContract(verifierAddress, [], "Verifier");
  await verifyContract(factoryAddress, [verifierAddress], "VoteCloudFactory");

  console.log("");
  console.log("==========================================");
  console.log(" Deployment Summary");
  console.log("==========================================");
  console.log(" Network:", hre.network.name, `(${network.chainId})`);
  console.log(" Verifier:", verifierAddress);
  console.log(" Factory:", factoryAddress);
  console.log(" Backend config:", backendConfigPath);
  console.log(" Frontend config:", frontendConfigPath);
  console.log(" Explorer:", `${explorerBase}/address/${factoryAddress}`);
  console.log("==========================================");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Polygon deployment failed:", err);
    process.exit(1);
  });
