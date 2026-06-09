const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

async function deployFactoryFixture() {
  const [deployer, orgA, orgB] = await ethers.getSigners();

  const MockVerifier = await ethers.getContractFactory("MockVerifier");
  const verifier = await MockVerifier.deploy(true);
  await verifier.waitForDeployment();

  const VoteCloudFactory = await ethers.getContractFactory("VoteCloudFactory");
  const factory = await VoteCloudFactory.deploy(await verifier.getAddress());
  await factory.waitForDeployment();

  return { deployer, orgA, orgB, verifier, factory };
}

describe("VoteCloudFactory", () => {
  it("deploys with a verifier address", async () => {
    const { factory, verifier } = await deployFactoryFixture();
    expect(await factory.verifier()).to.equal(await verifier.getAddress());
    expect(await factory.nextElectionId()).to.equal(1n);
  });

  it("rejects a zero verifier address", async () => {
    const VoteCloudFactory = await ethers.getContractFactory("VoteCloudFactory");
    await expect(VoteCloudFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      VoteCloudFactory,
      "InvalidVerifier"
    );
  });

  it("creates an election owned by the organization caller", async () => {
    const { factory, verifier, orgA } = await deployFactoryFixture();
    const candidates = ["Alice", "Bob"];

    await expect(factory.connect(orgA).createElection("Board Election", candidates, 3600))
      .to.emit(factory, "ElectionCreated")
      .withArgs(1n, orgA.address, anyValue, "Board Election", anyValue);
  });

  it("tracks organization elections by id and address", async () => {
    const { factory, orgA, orgB } = await deployFactoryFixture();

    await factory.connect(orgA).createElection("Election A1", ["Alice", "Bob"], 3600);
    await factory.connect(orgA).createElection("Election A2", ["Carol", "Dave"], 7200);
    await factory.connect(orgB).createElection("Election B1", ["Eve", "Frank"], 3600);

    expect(await factory.organizationElectionCount(orgA.address)).to.equal(2n);
    expect(await factory.organizationElectionCount(orgB.address)).to.equal(1n);

    const orgAIds = await factory.getOrganizationElectionIds(orgA.address);
    const orgBIds = await factory.getOrganizationElectionIds(orgB.address);
    expect(orgAIds).to.deep.equal([1n, 2n]);
    expect(orgBIds).to.deep.equal([3n]);

    const orgAAddresses = await factory.getOrganizationElections(orgA.address);
    expect(orgAAddresses).to.have.lengthOf(2);
    expect(await factory.isVoteCloudElection(orgAAddresses[0])).to.equal(true);

    const record = await factory.getElection(2);
    expect(record.id).to.equal(2n);
    expect(record.organization).to.equal(orgA.address);
    expect(record.electionAddress).to.equal(orgAAddresses[1]);
    expect(record.electionName).to.equal("Election A2");
  });

  it("assigns each created ZKVoting admin to the organization, not the factory", async () => {
    const { factory, verifier, orgA } = await deployFactoryFixture();
    await factory.connect(orgA).createElection("Admin Check", ["Alice", "Bob"], 3600);

    const [electionAddress] = await factory.getOrganizationElections(orgA.address);
    const election = await ethers.getContractAt("ZKVoting", electionAddress);

    expect(await election.admin()).to.equal(orgA.address);
    expect(await election.isAdmin(orgA.address)).to.equal(true);
    expect(await election.verifier()).to.equal(await verifier.getAddress());
    expect(await election.electionName()).to.equal("Admin Check");
  });

  it("rejects invalid election creation inputs", async () => {
    const { factory, orgA } = await deployFactoryFixture();

    await expect(factory.connect(orgA).createElection("", ["Alice", "Bob"], 3600)).to.be.revertedWithCustomError(
      factory,
      "InvalidElectionName"
    );

    await expect(factory.connect(orgA).createElection("Too Few", ["Alice"], 3600)).to.be.revertedWithCustomError(
      factory,
      "InvalidCandidates"
    );

    await expect(factory.connect(orgA).createElection("No Duration", ["Alice", "Bob"], 0)).to.be.revertedWithCustomError(
      factory,
      "InvalidDuration"
    );
  });

  it("rejects unknown election lookups", async () => {
    const { factory } = await deployFactoryFixture();
    await expect(factory.getElection(999)).to.be.revertedWithCustomError(factory, "ElectionNotFound");
  });
});
