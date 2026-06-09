const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  const rootDir = path.join(__dirname, "..");
  const configPath = path.join(rootDir, "backend", "src", "config", "contracts.json");
  const abiPath = path.join(rootDir, "backend", "src", "config", "abi", "ZKVoting.json");

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  const wallet = new ethers.Wallet(
    process.env.ADMIN_PRIVATE_KEY ||
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    provider
  );

  const contract = new ethers.Contract(config.votingAddress, abi, wallet);
  const info = await contract.getElectionInfo();

  if (info[1]) {
    console.log("Voting is already open.");
    return;
  }

  const tx = await contract.startVoting(3600);
  await tx.wait();
  console.log(`Voting started: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

