// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ZKVoting
 * @notice Anonymous e-voting contract using zk-SNARKs and Merkle Trees.
 *
 * Privacy model:
 *   - Identity anonymity: preserved by zk proof + Merkle membership
 *   - Vote choice is public on-chain to support live tally
 */
interface IVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata publicSignals
    ) external view returns (bool);
}

contract ZKVoting {
    // =========================================================================
    // State
    // =========================================================================

    /// @notice Primary admin (legacy compatibility + admin rotation anchor)
    address public admin;

    /// @notice Decentralized admin committee (any admin can run election ops)
    mapping(address => bool) public isAdmin;
    uint256 public adminCount;

    /// @notice Groth16 verifier contract
    IVerifier public immutable verifier;

    /// @notice Merkle root of registered voter commitments
    uint256 public merkleRoot;

    /// @notice Election metadata
    string public electionName;
    bool public votingOpen;
    uint256 public startTime;
    uint256 public endTime;

    /// @notice Candidate list (index = candidate ID)
    string[] public candidates;

    /// @notice Live tally (candidate index => votes)
    mapping(uint256 => uint256) public voteTally;

    /// @notice Nullifier spend tracking (one-person-one-vote)
    ///         nullifierHash = Poseidon(nullifier)
    mapping(uint256 => bool) public nullifierSpent;

    /// @notice Total votes cast
    uint256 public totalVotes;

    /// @dev Minimal ReentrancyGuard-style state. 1 = unlocked, 2 = locked.
    uint256 private _reentrancyStatus = 1;

    // =========================================================================
    // Events
    // =========================================================================

    event VoterRegistered(uint256 indexed newMerkleRoot, uint256 timestamp);
    event MerkleRootUpdated(uint256 indexed oldRoot, uint256 indexed newRoot);

    event VoteCast(uint256 indexed nullifierHash, uint256 indexed voteChoice, uint256 timestamp);

    event ElectionStarted(string electionName, uint256 startTime, uint256 endTime);
    event ElectionEnded(uint256 timestamp);

    event AdminAdded(address indexed account, address indexed by);
    event AdminRemoved(address indexed account, address indexed by);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // =========================================================================
    // Errors
    // =========================================================================

    error OnlyAdmin();
    error OnlyPrimaryAdmin();
    error VotingNotOpen();
    error VotingAlreadyOpen();
    error NullifierAlreadySpent();
    error InvalidProof();
    error InvalidCandidate();
    error InvalidMerkleRoot();
    error VotingPeriodExpired();
    error AdminAlreadyExists();
    error AdminNotFound();
    error CannotRemoveLastAdmin();
    error CannotRemovePrimaryAdmin();
    error InvalidAdminAddress();
    error InvalidVerifier();
    error InvalidElectionName();
    error InvalidCandidates();
    error InvalidDuration();
    error ReentrantCall();

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAdmin() {
        if (!isAdmin[msg.sender]) revert OnlyAdmin();
        _;
    }

    modifier onlyPrimaryAdmin() {
        if (msg.sender != admin) revert OnlyPrimaryAdmin();
        _;
    }

    modifier whenVotingOpen() {
        if (!votingOpen) revert VotingNotOpen();
        if (block.timestamp > endTime) revert VotingPeriodExpired();
        _;
    }

    modifier nonReentrant() {
        if (_reentrancyStatus == 2) revert ReentrantCall();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        address _verifier,
        address _admin,
        string memory _electionName,
        string[] memory _candidates,
        uint256 _durationSecs
    ) {
        if (_verifier == address(0)) revert InvalidVerifier();
        if (_admin == address(0)) revert InvalidAdminAddress();
        if (bytes(_electionName).length == 0) revert InvalidElectionName();
        if (_candidates.length < 2) revert InvalidCandidates();
        if (_durationSecs == 0) revert InvalidDuration();

        admin = _admin;
        isAdmin[_admin] = true;
        adminCount = 1;

        verifier = IVerifier(_verifier);
        electionName = _electionName;
        candidates = _candidates;

        // Initial duration; finalized when startVoting() is called.
        endTime = _durationSecs;
    }

    // =========================================================================
    // Governance functions
    // =========================================================================

    function addAdmin(address newAdmin) external onlyPrimaryAdmin {
        if (newAdmin == address(0)) revert InvalidAdminAddress();
        if (isAdmin[newAdmin]) revert AdminAlreadyExists();

        isAdmin[newAdmin] = true;
        adminCount++;

        emit AdminAdded(newAdmin, msg.sender);
    }

    function removeAdmin(address oldAdmin) external onlyPrimaryAdmin {
        if (!isAdmin[oldAdmin]) revert AdminNotFound();
        if (adminCount == 1) revert CannotRemoveLastAdmin();
        if (oldAdmin == admin) revert CannotRemovePrimaryAdmin();

        isAdmin[oldAdmin] = false;
        adminCount--;

        emit AdminRemoved(oldAdmin, msg.sender);
    }

    function transferAdmin(address newAdmin) external onlyPrimaryAdmin {
        if (newAdmin == address(0)) revert InvalidAdminAddress();

        address old = admin;
        if (!isAdmin[newAdmin]) {
            isAdmin[newAdmin] = true;
            adminCount++;
            emit AdminAdded(newAdmin, msg.sender);
        }

        admin = newAdmin;
        emit AdminTransferred(old, newAdmin);
    }

    // =========================================================================
    // Election admin functions
    // =========================================================================

    function updateMerkleRoot(uint256 _newRoot) external onlyAdmin {
        if (votingOpen) revert VotingAlreadyOpen();
        if (_newRoot == 0) revert InvalidMerkleRoot();

        uint256 old = merkleRoot;
        merkleRoot = _newRoot;

        emit MerkleRootUpdated(old, _newRoot);
        emit VoterRegistered(_newRoot, block.timestamp);
    }

    function startVoting(uint256 _durationSecs) external onlyAdmin {
        if (votingOpen) revert VotingAlreadyOpen();
        if (merkleRoot == 0) revert InvalidMerkleRoot();
        if (_durationSecs == 0) revert InvalidDuration();

        votingOpen = true;
        startTime = block.timestamp;
        endTime = block.timestamp + _durationSecs;

        emit ElectionStarted(electionName, startTime, endTime);
    }

    function endVoting() external onlyAdmin {
        if (!votingOpen) revert VotingNotOpen();
        votingOpen = false;
        emit ElectionEnded(block.timestamp);
    }

    // =========================================================================
    // Voting
    // =========================================================================

    /**
     * @notice Cast a vote using a zk proof.
     * Public signals order:
     *   [0] merkleRoot
     *   [1] nullifierHash   = Poseidon(nullifier)
     *   [2] voteChoice
     */
    function castVote(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 nullifierHash,
        uint256 voteChoice
    ) external whenVotingOpen nonReentrant {
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent();
        if (voteChoice >= candidates.length) revert InvalidCandidate();

        uint256[3] memory publicSignals = [merkleRoot, nullifierHash, voteChoice];
        bool valid = verifier.verifyProof(pA, pB, pC, publicSignals);
        if (!valid) revert InvalidProof();

        nullifierSpent[nullifierHash] = true;
        voteTally[voteChoice]++;
        totalVotes++;

        emit VoteCast(nullifierHash, voteChoice, block.timestamp);
    }

    // =========================================================================
    // View functions
    // =========================================================================

    function getCandidateTally(uint256 candidateIndex) external view returns (uint256) {
        if (candidateIndex >= candidates.length) revert InvalidCandidate();
        return voteTally[candidateIndex];
    }

    function getResults() external view returns (string[] memory names, uint256[] memory tallies) {
        uint256 len = candidates.length;
        names = new string[](len);
        tallies = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            names[i] = candidates[i];
            tallies[i] = voteTally[i];
        }
    }

    function isNullifierSpent(uint256 nullifierHash) external view returns (bool) {
        return nullifierSpent[nullifierHash];
    }

    function getElectionInfo()
        external
        view
        returns (
            string memory name,
            bool isOpen,
            uint256 start,
            uint256 end,
            uint256 totalCast,
            uint256 numCandidates
        )
    {
        return (
            electionName,
            votingOpen,
            startTime,
            endTime,
            totalVotes,
            candidates.length
        );
    }

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }
}