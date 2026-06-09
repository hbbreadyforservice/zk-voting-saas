/**
 * register-voter.js
 * =================
 * Admin script: generate identity commitments for a list of voters,
 * build the Merkle tree, and update the on-chain merkle root.
 *
 * Run: npx hardhat run scripts/register-voter.js --network localhost
 */

const { ethers } = require("hardhat");
const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// â”€â”€ Inline Merkle Tree (mirrors backend/src/services/merkleTree.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TREE_DEPTH = 10; // must match circuit constant LEVELS

function poseidonHash(poseidon, inputs) {
  const hash = poseidon(inputs.map((x) => BigInt(x)));
  return poseidon.F.toObject(hash);
}

class MerkleTree {
  constructor(depth, poseidon) {
    this.depth   = depth;
    this.poseidon = poseidon;
    this.leaves  = [];
    this.zeros   = this._buildZeros();
    this.layers  = [[]];
  }

  // Pre-compute zero hashes for empty subtrees
  _buildZeros() {
    const zeros = [0n];
    for (let i = 1; i <= this.depth; i++) {
      zeros.push(poseidonHash(this.poseidon, [zeros[i - 1], zeros[i - 1]]));
    }
    return zeros;
  }

  insert(leaf) {
    const idx = this.leaves.length;
    this.leaves.push(BigInt(leaf));
    this._updateTree(idx, BigInt(leaf));
    return idx;
  }

  _updateTree(leafIndex, value) {
    let currentIndex = leafIndex;
    let currentValue = value;

    for (let level = 0; level < this.depth; level++) {
      if (!this.layers[level]) this.layers[level] = [];

      this.layers[level][currentIndex] = currentValue;

      let siblingIndex, left, right;
      if (currentIndex % 2 === 0) {
        siblingIndex = currentIndex + 1;
        left  = currentValue;
        right = this.layers[level][siblingIndex] ?? this.zeros[level];
      } else {
        siblingIndex = currentIndex - 1;
        left  = this.layers[level][siblingIndex] ?? this.zeros[level];
        right = currentValue;
      }

      currentValue = poseidonHash(this.poseidon, [left, right]);
      currentIndex = Math.floor(currentIndex / 2);

      if (!this.layers[level + 1]) this.layers[level + 1] = [];
    }

    this.layers[this.depth][0] = currentValue;
  }

  getRoot() {
    return this.layers[this.depth]?.[0] ?? this.zeros[this.depth];
  }

  getMerkleProof(leafIndex) {
    const path        = [];
    const pathIndices = [];
    let currentIndex  = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      const sibling      = this.layers[level]?.[siblingIndex] ?? this.zeros[level];

      path.push(sibling.toString());
      pathIndices.push(currentIndex % 2 === 0 ? 0 : 1);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements: path, pathIndices };
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function main() {
  const poseidon = await buildPoseidon();
  const [admin]  = await ethers.getSigners();

  const contractsConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../backend/src/config/contracts.json"))
  );

  const ZKVoting = await ethers.getContractAt("ZKVoting", contractsConfig.votingAddress);

  console.log("\n==========================================");
  console.log(" Voter Registration");
  console.log("==========================================");
  console.log(" Admin:", admin.address);
  console.log(" Contract:", contractsConfig.votingAddress);

  // â”€â”€ Define voters (in real app, these would come from a database) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const voterEmails = [
    "alice@example.com",
    "bob@example.com",
    "carol@example.com",
    "dave@example.com",
    "eve@example.com",
  ];

  const tree = new MerkleTree(TREE_DEPTH, poseidon);
  const voterData = [];

  console.log(`\n Registering ${voterEmails.length} voters...\n`);

  for (const email of voterEmails) {
    // Generate random 32-byte secret and nullifier (would be given to voter)
    const secret   = BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    const nullifier = BigInt("0x" + crypto.randomBytes(31).toString("hex"));

    // Identity commitment = Poseidon(secret, nullifier)
    const commitment = poseidonHash(poseidon, [secret, nullifier]);

    const leafIndex = tree.insert(commitment);
    const { pathElements, pathIndices } = tree.getMerkleProof(leafIndex);

    voterData.push({
      email,
      secret:     secret.toString(),
      nullifier:  nullifier.toString(),
      commitment: commitment.toString(),
      leafIndex,
      pathElements,
      pathIndices,
    });

    console.log(`  [${leafIndex}] ${email}`);
    console.log(`        commitment: ${commitment.toString().slice(0, 20)}...`);
  }

  const root = tree.getRoot();
  console.log(`\n Merkle root: ${root.toString()}`);

  // â”€â”€ Update on-chain Merkle root â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\n Submitting merkle root to contract...");
  const tx = await ZKVoting.connect(admin).updateMerkleRoot(root);
  await tx.wait();
  console.log("  âœ“ tx:", tx.hash);

  // â”€â”€ Save voter credentials (in production: send securely to each voter) â”€â”€â”€
  const outputPath = path.join(__dirname, "../backend/src/config/voter-credentials.json");
  fs.writeFileSync(outputPath, JSON.stringify({ merkleRoot: root.toString(), voters: voterData }, null, 2));
  console.log(`\n  âœ“ Voter credentials written to: ${outputPath}`);
  console.log("    (In production, distribute each voter's secret/nullifier securely)\n");

  console.log("==========================================");
  console.log(" Registration complete.");
  console.log(" Start voting: call ZKVoting.startVoting() from admin");
  console.log("==========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

