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

    /// @notice momentId => created on-chain (Founding Curators recorded at creation).
    mapping(bytes32 => bool) public momentCreated;
    mapping(bytes32 => address) public momentCreatorOf;
    /// @notice streamId => accumulated tips (funds the Moment reward pool). MOMENT tip().
    mapping(bytes32 => uint256) public streamTips;
    uint256 public totalTips;

    // --- events (indexable by the backend / Envio-equivalent) ---
    event ReactionBatchCommitted(
        bytes32 indexed batchId,
        bytes32 indexed streamId,
        uint256 reactionCount,
        uint64 fromTs,
        uint64 toTs,
        bytes32 commitment
    );

    /// @notice Emitted when a Moment is created; records Founding Curators on-chain immediately.
    event MomentCreated(
        bytes32 indexed momentId,
        bytes32 indexed streamId,
        address indexed creator,
        uint64 clipStart,
        uint64 clipEnd,
        uint8 category,
        uint256 curatorCount
    );
    event FoundingCuratorRecorded(bytes32 indexed momentId, address indexed curator, uint8 rank);

    /// @notice Tips fund the Moment reward pool. MOMENT tip(streamId).
    event Tipped(bytes32 indexed streamId, address indexed from, uint256 amount, uint256 streamTotal);

    event MomentSettled(
        bytes32 indexed momentId,
        address indexed creator,
        uint256 creatorAmount,
        uint256 curatorPool,
        uint256 platformAmount,
        uint256 curatorCount,
        uint256 totalAmount
    );

    event CuratorPaid(bytes32 indexed momentId, address indexed curator, uint8 rank, uint256 amount);
    event PlatformPaid(bytes32 indexed momentId, address indexed platform, uint256 amount);
    event PoolFunded(address indexed from, uint256 amount);
    event SettlerUpdated(address indexed settler, bool allowed);
    event OwnerTransferred(address indexed from, address indexed to);

    // --- errors (cheaper + clearer than string reverts) ---
    error NotOwner();
    error NotSettler();
    error Reentrancy();
    error AlreadySettled();
    error AlreadyCreated();
    error BatchAlreadyCommitted();
    error LengthMismatch();
    error TooManyCurators();
    error InsufficientPool();
    error TransferFailed();
    error ZeroCreator();
    error ZeroAmount();

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

    // --- tips (MOMENT) ---
    /// @notice Tip a stream. Tips fund the Moment reward pool. Anyone may tip.
    function tip(bytes32 streamId) external payable {
        if (msg.value == 0) revert ZeroAmount();
        streamTips[streamId] += msg.value;
        totalTips += msg.value;
        emit Tipped(streamId, msg.sender, msg.value, streamTips[streamId]);
    }

    // --- moment creation (records Founding Curators on-chain immediately) ---
    /**
     * Record a Moment and its Founding Curators on-chain the moment it is created, so
     * "Founding Curator #N" status is verifiable before settlement. Idempotent by momentId.
     */
    function createMoment(
        bytes32 momentId,
        bytes32 streamId,
        address creator,
        uint64 clipStart,
        uint64 clipEnd,
        uint8 category,
        address[] calldata curators
    ) external onlySettler {
        if (momentCreated[momentId]) revert AlreadyCreated();
        if (creator == address(0)) revert ZeroCreator();
        if (curators.length > 5) revert TooManyCurators();

        momentCreated[momentId] = true;
        momentCreatorOf[momentId] = creator;

        for (uint256 i = 0; i < curators.length; i++) {
            emit FoundingCuratorRecorded(momentId, curators[i], uint8(i + 1));
        }
        emit MomentCreated(momentId, streamId, creator, clipStart, clipEnd, category, curators.length);
    }

    // --- settlement (idempotent; MOMENT 3-way split creator / curators / platform) ---
    /**
     * @param momentId       keccak256 of the Moment id string.
     * @param creator        creator payout recipient.
     * @param creatorAmount  amount paid to the creator.
     * @param platform       platform payout recipient (10% cut).
     * @param platformAmount amount paid to the platform.
     * @param curators       Founding Curator recipients, index i => rank i+1.
     * @param curatorAmounts per-curator amounts; curators.length == curatorAmounts.length.
     *
     * Idempotent: reverts AlreadySettled on a second call for the same momentId, so a retry
     * after a client/RPC failure can never double-pay.
     */
    function settleMoment(
        bytes32 momentId,
        address creator,
        uint256 creatorAmount,
        address platform,
        uint256 platformAmount,
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
        uint256 total = creatorAmount + platformAmount + curatorPool;
        if (total > address(this).balance) revert InsufficientPool();

        // Effects before interactions.
        momentSettled[momentId] = true;
        totalSettledMoments += 1;
        totalPaidOut += total;

        // Interactions.
        _pay(creator, creatorAmount);
        if (platformAmount > 0 && platform != address(0)) {
            _pay(platform, platformAmount);
            emit PlatformPaid(momentId, platform, platformAmount);
        }
        for (uint256 i = 0; i < curators.length; i++) {
            _pay(curators[i], curatorAmounts[i]);
            emit CuratorPaid(momentId, curators[i], uint8(i + 1), curatorAmounts[i]);
        }

        emit MomentSettled(momentId, creator, creatorAmount, curatorPool, platformAmount, curators.length, total);
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
