// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MomentRewards
 * @notice Focused settlement contract for Moment (PRD §19, §20, §42).
 *
 * Two economically meaningful actions live on Monad:
 *   1. commitReactionBatch — anchors reaction provenance as a batched commitment (Merkle root)
 *      over a time range, instead of one tx per reaction (PRD §21).
 *   2. settleMoment — pays a confirmed Moment's creator and Founding Curators from a pre-funded
 *      native (MON) pool, exactly once. Settlement is IDEMPOTENT: a Moment id can never pay twice.
 *
 * Kept intentionally small (PRD §42). No external deps; minimal inline Ownable + reentrancy guard.
 */
contract MomentRewards {
    // --- ownership / roles ---
    address public owner;
    mapping(address => bool) public settlers; // backend signer(s) authorized to settle/commit

    // --- reentrancy guard ---
    uint256 private _lock = 1;

    // --- state ---
    /// @notice momentId => settled. Enforces "one Moment settles once" (PRD §20/§35).
    mapping(bytes32 => bool) public momentSettled;
    /// @notice batchId => committed. Rejects duplicate batches (PRD §35).
    mapping(bytes32 => bool) public batchCommitted;

    uint256 public totalSettledMoments;
    uint256 public totalPaidOut;

    // --- events (indexable by the backend, PRD §19) ---
    event ReactionBatchCommitted(
        bytes32 indexed batchId,
        bytes32 indexed streamId,
        uint256 reactionCount,
        uint64 fromTs,
        uint64 toTs,
        bytes32 commitment
    );

    event MomentSettled(
        bytes32 indexed momentId,
        address indexed creator,
        uint256 creatorAmount,
        uint256 curatorPool,
        uint256 curatorCount,
        uint256 totalAmount
    );

    event CuratorPaid(bytes32 indexed momentId, address indexed curator, uint8 rank, uint256 amount);
    event PoolFunded(address indexed from, uint256 amount);
    event SettlerUpdated(address indexed settler, bool allowed);
    event OwnerTransferred(address indexed from, address indexed to);

    // --- errors (cheaper + clearer than string reverts) ---
    error NotOwner();
    error NotSettler();
    error Reentrancy();
    error AlreadySettled();
    error BatchAlreadyCommitted();
    error LengthMismatch();
    error AmountMismatch();
    error InsufficientPool();
    error TransferFailed();
    error ZeroCreator();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlySettler() {
        if (!settlers[msg.sender] && msg.sender != owner) revert NotSettler();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor() {
        owner = msg.sender;
        settlers[msg.sender] = true;
        emit OwnerTransferred(address(0), msg.sender);
        emit SettlerUpdated(msg.sender, true);
    }

    // --- admin ---
    function setSettler(address settler, bool allowed) external onlyOwner {
        settlers[settler] = allowed;
        emit SettlerUpdated(settler, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Fund the reward pool. Anyone may top it up (PRD §18 pre-funded pool).
    function fund() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }

    receive() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }

    function poolBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // --- reaction provenance (PRD §20) ---
    function commitReactionBatch(
        bytes32 batchId,
        bytes32 streamId,
        uint256 reactionCount,
        uint64 fromTs,
        uint64 toTs,
        bytes32 commitment
    ) external onlySettler {
        if (batchCommitted[batchId]) revert BatchAlreadyCommitted();
        batchCommitted[batchId] = true;
        emit ReactionBatchCommitted(batchId, streamId, reactionCount, fromTs, toTs, commitment);
    }

    // --- settlement (PRD §20, §28, §42) ---
    /**
     * @param momentId       keccak256 of the Moment id string.
     * @param creator        creator payout recipient.
     * @param creatorAmount  amount paid to the creator.
     * @param curators       Founding Curator recipients, index i => rank i+1.
     * @param curatorAmounts per-curator amounts, curators.length == curatorAmounts.length.
     *
     * Idempotent: reverts AlreadySettled on a second call for the same momentId, so a
     * retry after a client/RPC failure can never double-pay (PRD §35).
     */
    function settleMoment(
        bytes32 momentId,
        address creator,
        uint256 creatorAmount,
        address[] calldata curators,
        uint256[] calldata curatorAmounts
    ) external onlySettler nonReentrant {
        if (momentSettled[momentId]) revert AlreadySettled();
        if (creator == address(0)) revert ZeroCreator();
        if (curators.length != curatorAmounts.length) revert LengthMismatch();

        uint256 curatorPool;
        for (uint256 i = 0; i < curatorAmounts.length; i++) {
            curatorPool += curatorAmounts[i];
        }
        uint256 total = creatorAmount + curatorPool;
        if (total > address(this).balance) revert InsufficientPool();

        // Effects before interactions.
        momentSettled[momentId] = true;
        totalSettledMoments += 1;
        totalPaidOut += total;

        // Interactions.
        _pay(creator, creatorAmount);
        for (uint256 i = 0; i < curators.length; i++) {
            _pay(curators[i], curatorAmounts[i]);
            emit CuratorPaid(momentId, curators[i], uint8(i + 1), curatorAmounts[i]);
        }

        emit MomentSettled(momentId, creator, creatorAmount, curatorPool, curators.length, total);
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function isMomentSettled(bytes32 momentId) external view returns (bool) {
        return momentSettled[momentId];
    }
}
