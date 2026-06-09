const { expect } = require("chai");
const { ethers } = require("hardhat");
const { buildPoseidon } = require("circomlibjs");

function poseidonHash(poseidon, inputs) {
  const hash = poseidon(inputs.map(BigInt));
  return poseidon.F.toObject(hash);
}

async function deployMockVerifier(shouldPass = true) {
  const MockVerifier = await ethers.getContractFactory("MockVerifier");
  const mv = await MockVerifier.deploy(shouldPass);
  await mv.waitForDeployment();
  return mv;
}

const DUMMY_PROOF = {
  pA: [1n, 2n],
  pB: [[1n, 2n], [3n, 4n]],
  pC: [1n, 2n],
};

async function deployFixture() {
  const [admin, voter1, voter2, voter3] = await ethers.getSigners();
  const poseidon = await buildPoseidon();
  const verifier = await deployMockVerifier(true);

  const candidates = ["Alice", "Bob", "Carol"];
  const electionName = "Test Election";

  const ZKVoting = await ethers.getContractFactory("ZKVoting");
  const contract = await ZKVoting.deploy(await verifier.getAddress(), admin.address, electionName, candidates, 3600);
  await contract.waitForDeployment();

  const voter1Secret = 12345678901234567890n;
  const voter1Nullifier = 98765432109876543210n;
  const voter1Commitment = poseidonHash(poseidon, [voter1Secret, voter1Nullifier]);

  const voter2Secret = 11111111111111111111n;
  const voter2Nullifier = 22222222222222222222n;
  const voter2Commitment = poseidonHash(poseidon, [voter2Secret, voter2Nullifier]);

  const voter1NullifierHash = poseidonHash(poseidon, [voter1Nullifier]);
  const voter2NullifierHash = poseidonHash(poseidon, [voter2Nullifier]);

  const merkleRoot = poseidonHash(poseidon, [voter1Commitment, voter2Commitment]);

  return {
    contract,
    verifier,
    admin,
    voter1,
    voter2,
    voter3,
    poseidon,
    candidates,
    electionName,
    voter1Nullifier,
    voter2Nullifier,
    voter1NullifierHash,
    voter2NullifierHash,
    merkleRoot,
  };
}

describe("ZKVoting (live tally + multi-admin)", () => {
  describe("Deployment", () => {
    it("sets primary admin and committee", async () => {
      const { contract, admin } = await deployFixture();
      expect(await contract.admin()).to.equal(admin.address);
      expect(await contract.isAdmin(admin.address)).to.equal(true);
      expect(await contract.adminCount()).to.equal(1n);
    });

    it("stores election metadata", async () => {
      const { contract, electionName } = await deployFixture();
      expect(await contract.electionName()).to.equal(electionName);
      expect(await contract.votingOpen()).to.equal(false);
      expect(await contract.merkleRoot()).to.equal(0n);
    });
  });

  describe("Governance", () => {
    it("primary admin can add/remove committee admins", async () => {
      const { contract, voter1 } = await deployFixture();

      await contract.addAdmin(voter1.address);
      expect(await contract.isAdmin(voter1.address)).to.equal(true);
      expect(await contract.adminCount()).to.equal(2n);

      await contract.removeAdmin(voter1.address);
      expect(await contract.isAdmin(voter1.address)).to.equal(false);
      expect(await contract.adminCount()).to.equal(1n);
    });

    it("committee admin can run election ops", async () => {
      const { contract, voter1, merkleRoot } = await deployFixture();
      await contract.addAdmin(voter1.address);

      await contract.connect(voter1).updateMerkleRoot(merkleRoot);
      await contract.connect(voter1).startVoting(3600);
      expect(await contract.votingOpen()).to.equal(true);
    });

    it("primary admin can transfer primary role", async () => {
      const { contract, voter1 } = await deployFixture();
      await contract.transferAdmin(voter1.address);
      expect(await contract.admin()).to.equal(voter1.address);
      expect(await contract.isAdmin(voter1.address)).to.equal(true);
    });
  });

  describe("Merkle Root + lifecycle", () => {
    it("rejects zero merkle root", async () => {
      const { contract } = await deployFixture();
      await expect(contract.updateMerkleRoot(0n)).to.be.revertedWithCustomError(contract, "InvalidMerkleRoot");
    });

    it("starts and ends voting", async () => {
      const { contract, merkleRoot } = await deployFixture();
      await contract.updateMerkleRoot(merkleRoot);
      await contract.startVoting(3600);
      expect(await contract.votingOpen()).to.equal(true);
      await contract.endVoting();
      expect(await contract.votingOpen()).to.equal(false);
    });
  });

  describe("Voting", () => {
    async function setupVotingOpen() {
      const fixture = await deployFixture();
      await fixture.contract.updateMerkleRoot(fixture.merkleRoot);
      await fixture.contract.startVoting(3600);
      return fixture;
    }

    it("accepts valid vote and updates tally immediately", async () => {
      const { contract, voter1NullifierHash } = await setupVotingOpen();
      const voteChoice = 1n;

      await expect(
        contract.castVote(DUMMY_PROOF.pA, DUMMY_PROOF.pB, DUMMY_PROOF.pC, voter1NullifierHash, voteChoice)
      ).to.emit(contract, "VoteCast");

      expect(await contract.totalVotes()).to.equal(1n);
      expect(await contract.voteTally(1)).to.equal(1n);
    });

    it("rejects nullifier reuse", async () => {
      const { contract, voter1NullifierHash } = await setupVotingOpen();
      const voteChoice = 1n;

      await contract.castVote(DUMMY_PROOF.pA, DUMMY_PROOF.pB, DUMMY_PROOF.pC, voter1NullifierHash, voteChoice);

      await expect(
        contract.castVote(DUMMY_PROOF.pA, DUMMY_PROOF.pB, DUMMY_PROOF.pC, voter1NullifierHash, 2n)
      ).to.be.revertedWithCustomError(contract, "NullifierAlreadySpent");
    });

    it("rejects invalid proof", async () => {
      const { admin, merkleRoot, electionName, candidates, voter1NullifierHash } = await deployFixture();
      const failingVerifier = await deployMockVerifier(false);
      const ZKVoting = await ethers.getContractFactory("ZKVoting");
      const c = await ZKVoting.deploy(await failingVerifier.getAddress(), admin.address, electionName, candidates, 3600);
      await c.waitForDeployment();

      await c.updateMerkleRoot(merkleRoot);
      await c.startVoting(3600);

      await expect(
        c.castVote(DUMMY_PROOF.pA, DUMMY_PROOF.pB, DUMMY_PROOF.pC, voter1NullifierHash, 1n)
      ).to.be.revertedWithCustomError(c, "InvalidProof");
    });

    it("rejects invalid candidate index", async () => {
      const { contract, voter1NullifierHash } = await setupVotingOpen();
      await expect(
        contract.castVote(DUMMY_PROOF.pA, DUMMY_PROOF.pB, DUMMY_PROOF.pC, voter1NullifierHash, 999n)
      ).to.be.revertedWithCustomError(contract, "InvalidCandidate");
    });
  });

  describe("View functions", () => {
    it("returns election info", async () => {
      const { contract, merkleRoot } = await deployFixture();
      await contract.updateMerkleRoot(merkleRoot);
      await contract.startVoting(3600);
      const info = await contract.getElectionInfo();

      expect(info[0]).to.equal("Test Election");
      expect(info[1]).to.equal(true);
      expect(Number(info[4])).to.equal(0);
      expect(Number(info[5])).to.equal(3);
    });
  });
});

