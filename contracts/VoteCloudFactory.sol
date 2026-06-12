// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ZKVoting.sol";

/**
 * @title VoteCloudFactory
 * @notice Deploys one ZKVoting contract per organization election.
 *
 * The SaaS backend calls this contract when an organization deploys an election.
 * Each election receives its own ZKVoting contract and address.
 */
contract VoteCloudFactory {
    struct ElectionRecord {
        uint256 id;
        address organization;
        address electionAddress;
        string electionName;
        uint256 createdAt;
    }

    address public immutable verifier;
    uint256 public nextElectionId = 1;

    mapping(uint256 => ElectionRecord) public electionsById;
    mapping(address => uint256[]) private organizationElectionIds;
    mapping(address => address[]) private organizationElectionAddresses;
    mapping(address => bool) public isVoteCloudElection;

    event ElectionCreated(
        uint256 indexed electionId,
        address indexed organization,
        address indexed electionAddress,
        string electionName,
        uint256 createdAt
    );

    error InvalidVerifier();
    error InvalidElectionName();
    error InvalidCandidates();
    error InvalidDuration();
    error ElectionNotFound();

    constructor(address _verifier) {
        if (_verifier == address(0)) revert InvalidVerifier();
        verifier = _verifier;
    }

    function createElection(
        string calldata electionName,
        string[] calldata candidates,
        uint256 durationSecs
    ) external returns (uint256 electionId, address electionAddress) {
        if (bytes(electionName).length == 0) revert InvalidElectionName();
        if (candidates.length < 2) revert InvalidCandidates();
        if (durationSecs == 0) revert InvalidDuration();

        electionId = nextElectionId++;

        // The caller becomes the primary admin of the new election contract.
        // The verifier address is shared, but the Merkle root and tallies are
        // isolated per deployed ZKVoting instance.
        ZKVoting election = new ZKVoting(
            verifier,
            msg.sender,
            electionName,
            candidates,
            durationSecs
        );
        electionAddress = address(election);

        electionsById[electionId] = ElectionRecord({
            id: electionId,
            organization: msg.sender,
            electionAddress: electionAddress,
            electionName: electionName,
            createdAt: block.timestamp
        });

        organizationElectionIds[msg.sender].push(electionId);
        organizationElectionAddresses[msg.sender].push(electionAddress);
        isVoteCloudElection[electionAddress] = true;

        emit ElectionCreated(electionId, msg.sender, electionAddress, electionName, block.timestamp);
    }

    function getOrganizationElectionIds(address organization) external view returns (uint256[] memory) {
        return organizationElectionIds[organization];
    }

    function getOrganizationElections(address organization) external view returns (address[] memory) {
        return organizationElectionAddresses[organization];
    }

    function getElection(uint256 electionId) external view returns (ElectionRecord memory) {
        ElectionRecord memory record = electionsById[electionId];
        if (record.electionAddress == address(0)) revert ElectionNotFound();
        return record;
    }

    function organizationElectionCount(address organization) external view returns (uint256) {
        return organizationElectionIds[organization].length;
    }
}
