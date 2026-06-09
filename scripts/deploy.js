/**
 * deploy.js
 * =========
 * Deploys Verifier/MockVerifier + VoteCloudFactory.
 *
 * For local demo compatibility it also creates one default ZKVoting election
 * through the factory and writes both factoryAddress and votingAddress to the
 * backend/frontend contract config files.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

function readArtifactAbi(relativeArtifactPath) {
  const artifactPath = path.join(__dirname, "../artifacts/contracts", relativeArtifactPath);
  if (!fs.existsSync(artifactPath)) return null;
  return JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const useMockVerifier = process.env.USE_MOCK_VERIFIER === "true";

  console.log("");
  console.log("==========================================");
  console.log(" VoteCloud Deployment");
  console.log("==========================================");
  console.log(" Deployer:", deployer.address);
  console.log(" Network:", network.name, `(${network.chainId})`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(" Balance:", ethers.formatEther(balance), "ETH");

  const verifierContractName = useMockVerifier ? "MockVerifier" : "Verifier";
  console.log("");
  console.log(`[1/3] Deploying ${verifierContractName}...`);

  const Verifier = await ethers.getContractFactory(verifierContractName);
  const verifier = useMockVerifier ? await Verifier.deploy(true) : await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(` ${verifierContractName}:`, verifierAddress);

  console.log("");
  console.log("[2/3] Deploying VoteCloudFactory...");
  const VoteCloudFactory = await ethers.getContractFactory("VoteCloudFactory");
  const factory = await VoteCloudFactory.deploy(verifierAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(" VoteCloudFactory:", factoryAddress);

  console.log("");
  console.log("[3/3] Creating default demo election through factory...");
  const electionName = process.env.DEFAULT_ELECTION_NAME || "Student Council Election 2026";
  const candidates = (process.env.DEFAULT_CANDIDATES || "Alice Chen,Bob Martinez,Carol Smith,David Lee")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const durationSecs = Number(process.env.DEFAULT_DURATION_SECS || 7 * 24 * 60 * 60);

  const createTx = await factory.createElection(electionName, candidates, durationSecs);
  await createTx.wait();

  const electionAddresses = await factory.getOrganizationElections(deployer.address);
  const votingAddress = electionAddresses[electionAddresses.length - 1];
  console.log(" Demo ZKVoting:", votingAddress);

  const config = {
    network: network.name,
    chainId: network.chainId.toString(),
    verifierAddress,
    factoryAddress,
    votingAddress,
    electionName,
    candidates,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    LOCALMode: useMockVerifier,
  };

  const backendConfigPath = path.join(__dirname, "../backend/src/config/contracts.json");
  const frontendConfigPath = path.join(__dirname, "../frontend/src/config/contracts.json");
  writeJson(backendConfigPath, config);
  writeJson(frontendConfigPath, config);

  const abiCopies = [
    {
      targetName: "ZKVoting",
      relativeArtifactPath: "ZKVoting.sol/ZKVoting.json",
    },
    {
      targetName: "VoteCloudFactory",
      relativeArtifactPath: "VoteCloudFactory.sol/VoteCloudFactory.json",
    },
    {
      targetName: "Verifier",
      relativeArtifactPath: useMockVerifier
        ? "mocks/MockVerifier.sol/MockVerifier.json"
        : "Verifier.sol/Verifier.json",
    },
  ];

  const backendAbiDir = path.join(__dirname, "../backend/src/config/abi");
  const frontendAbiDir = path.join(__dirname, "../frontend/src/config/abi");
  fs.mkdirSync(backendAbiDir, { recursive: true });
  fs.mkdirSync(frontendAbiDir, { recursive: true });

  for (const { targetName, relativeArtifactPath } of abiCopies) {
    const abi = readArtifactAbi(relativeArtifactPath);
    if (!abi) {
      console.warn(` ABI not found for ${targetName}: ${relativeArtifactPath}`);
      continue;
    }

    writeJson(path.join(backendAbiDir, `${targetName}.json`), abi);
    writeJson(path.join(frontendAbiDir, `${targetName}.json`), abi);
  }

  console.log("");
  console.log("==========================================");
  console.log(" Deployment Summary");
  console.log("==========================================");
  console.log(" Verifier:", verifierAddress);
  console.log(" Factory:", factoryAddress);
  console.log(" Demo election:", votingAddress);
  console.log(" LOCAL mode:", useMockVerifier ? "enabled" : "disabled");
  console.log(" Backend config:", backendConfigPath);
  console.log(" Frontend config:", frontendConfigPath);
  console.log("==========================================");
  console.log("");
  console.log("Next step: npx hardhat run scripts/register-voter.js --network localhost");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
  });
