/**
 * merkleTree.js
 * =============
 * Incrementally-updatable Poseidon Merkle tree.
 */

const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

const TREE_DEPTH = 10;
const TREE_STATE_PATH = path.join(__dirname, "../config/merkle-tree-state.json");
const TREE_STATE_DIR = path.join(__dirname, "../config/merkle-trees");

let poseidonInstance = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

function poseidonHash(poseidon, inputs) {
  const hash = poseidon(inputs.map((x) => BigInt(x)));
  return poseidon.F.toObject(hash);
}

class IncrementalMerkleTree {
  constructor(depth, poseidon) {
    this.depth = depth;
    this.poseidon = poseidon;
    this.leaves = [];
    this.layers = [];

    this.zeros = this._buildZeroHashes();
    for (let i = 0; i <= depth; i++) {
      this.layers[i] = [];
    }
  }

  _buildZeroHashes() {
    const zeros = [0n];
    for (let i = 1; i <= this.depth; i++) {
      zeros.push(poseidonHash(this.poseidon, [zeros[i - 1], zeros[i - 1]]));
    }
    return zeros;
  }

  insert(commitment) {
    const idx = this.leaves.length;
    if (idx >= 2 ** this.depth) {
      throw new Error(`Merkle tree is full (max ${2 ** this.depth} leaves)`);
    }

    const leaf = BigInt(commitment);
    this.leaves.push(leaf);
    this._recomputePath(idx, leaf);

    return idx;
  }

  _recomputePath(idx, value) {
    let currentIndex = idx;
    let currentValue = value;

    for (let level = 0; level < this.depth; level++) {
      this.layers[level][currentIndex] = currentValue;

      let left;
      let right;
      if (currentIndex % 2 === 0) {
        left = currentValue;
        right = this.layers[level][currentIndex + 1] ?? this.zeros[level];
      } else {
        left = this.layers[level][currentIndex - 1] ?? this.zeros[level];
        right = currentValue;
      }

      currentValue = poseidonHash(this.poseidon, [left, right]);
      currentIndex = Math.floor(currentIndex / 2);
    }

    this.layers[this.depth][0] = currentValue;
  }

  getRoot() {
    const root = this.layers[this.depth][0] ?? this.zeros[this.depth];
    return root.toString();
  }

  getMerkleProof(leafIndex) {
    if (leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} not found in tree`);
    }

    const pathElements = [];
    const pathIndices = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      const sibling = this.layers[level][siblingIndex] ?? this.zeros[level];

      pathElements.push(sibling.toString());
      pathIndices.push(isLeft ? 0 : 1);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements, pathIndices };
  }

  toJSON() {
    return {
      depth: this.depth,
      leaves: this.leaves.map(String),
      layers: this.layers.map((layer) => layer.map((n) => (n ?? 0n).toString())),
    };
  }

  static fromJSON(json, poseidon) {
    const tree = new IncrementalMerkleTree(json.depth, poseidon);
    tree.leaves = json.leaves.map(BigInt);
    tree.layers = json.layers.map((layer) => layer.map(BigInt));
    return tree;
  }
}

const treesByScope = new Map();

function normalizeScope(scopeKey = "default") {
  return String(scopeKey || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getTreeStatePath(scopeKey = "default") {
  const scope = normalizeScope(scopeKey);
  if (scope === "default") return TREE_STATE_PATH;
  return path.join(TREE_STATE_DIR, `${scope}.json`);
}

function saveTreeStateSync(scopeKey = "default") {
  const scope = normalizeScope(scopeKey);
  const tree = treesByScope.get(scope);
  if (!tree) return;

  const statePath = getTreeStatePath(scope);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(tree.toJSON(), null, 2));
}

async function getTree(scopeKey = "default") {
  const scope = normalizeScope(scopeKey);

  if (!treesByScope.has(scope)) {
    const poseidon = await getPoseidon();
    const statePath = getTreeStatePath(scope);

    if (fs.existsSync(statePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(statePath, "utf8"));
        treesByScope.set(scope, IncrementalMerkleTree.fromJSON(data, poseidon));
      } catch {
        treesByScope.set(scope, new IncrementalMerkleTree(TREE_DEPTH, poseidon));
      }
    } else {
      treesByScope.set(scope, new IncrementalMerkleTree(TREE_DEPTH, poseidon));
    }
  }

  return treesByScope.get(scope);
}

async function computeCommitment(secret, nullifier) {
  const poseidon = await getPoseidon();
  const hash = poseidonHash(poseidon, [BigInt(secret), BigInt(nullifier)]);
  return hash.toString();
}

async function computeNullifierHash(nullifier) {
  const poseidon = await getPoseidon();
  const hash = poseidonHash(poseidon, [BigInt(nullifier)]);
  return hash.toString();
}

module.exports = {
  IncrementalMerkleTree,
  getPoseidon,
  poseidonHash,
  computeCommitment,
  computeNullifierHash,
  getTree,
  getTreeStatePath,
  saveTreeStateSync,
  TREE_DEPTH,
  TREE_STATE_PATH,
  TREE_STATE_DIR,
};

