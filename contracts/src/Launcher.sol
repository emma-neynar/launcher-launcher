// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IClanker} from "./interfaces/IClanker.sol";

/// @title Launcher — a token launcher whose pair is locked to $HOODIE forever.
/// @notice Deployed as EIP-1167 minimal-proxy clones by LauncherLauncher.
///
/// THE RULE, enforced at the protocol level:
///   - `HOODIE` is a compile-time `constant`. There is no setter, no
///     initializer parameter, no storage slot, and no code path that reads a
///     paired token from anywhere else.
///   - `LaunchParams` has NO pairedToken field. A direct caller of `launch`
///     cannot express a different pair — reject-by-construction.
///   - Every launch calls the already-deployed Clanker v4 factory with
///     `poolConfig.pairedToken = HOODIE` injected by this contract.
contract Launcher {
    /// @notice $HOODIE on Robinhood Chain. Immutable at the protocol level.
    address public constant HOODIE = 0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3;

    /// @dev SDK default starting tick for an 18-decimal pair (~10 HOODIE market cap).
    int24 public constant DEFAULT_STARTING_TICK = -230400;
    int24 public constant TICK_SPACING = 200;
    /// @dev Width of the single full-range-ish LP position (matches SDK POOL_POSITIONS.Standard).
    int24 public constant POSITION_WIDTH = 110400;
    uint16 public constant MAX_LP_REWARD_BPS = 5000;
    /// @dev The live Robinhood static-fee hook enforces MAX_LP_FEE = 100000 uni-bps (10% = 1000 bps).
    uint24 public constant MAX_FEE_BPS = 1000;

    // Clanker v4 periphery on Robinhood Chain; baked into the implementation
    // bytecode (immutables), shared by every clone, not settable by anyone.
    IClanker public immutable clankerFactory;
    address public immutable clankerLocker;
    address public immutable clankerHook; // static-fee hook v2
    address public immutable clankerMevModule;

    // Per-clone state (set once via initialize, guarded).
    bool public initialized;
    string public launcherName;
    address public feeRecipient;
    uint16 public lpRewardBps;
    uint256 public launchCount;
    address[] private _tokens;
    uint256 private _saltNonce;

    struct LaunchParams {
        // NOTE: there is deliberately NO pairedToken field here.
        string name;
        string symbol;
        string image;
        string metadata; // JSON string, may be empty
        string context; // JSON string, may be empty
        address tokenAdmin; // token creator: admin + majority reward recipient
        int24 startingTick; // 0 = DEFAULT_STARTING_TICK; must be a multiple of TICK_SPACING
        uint24 clankerFeeBps; // LP fee on the new token side, in bps (<= 1000)
        uint24 pairedFeeBps; // LP fee on the $HOODIE side, in bps (<= 1000)
    }

    /// @dev Mirrors the SDK's v4.1 poolData wrapper: (extension, extensionData, feeData).
    struct PoolInitializationData {
        address extension;
        bytes extensionData;
        bytes feeData;
    }

    /// @dev Mirrors the SDK's locker instantiation data: (uint8[] feePreference).
    struct LockerInstantiation {
        uint8[] feePreference;
    }

    /// @dev Mirrors the SDK's MEV sniper-auction init data.
    struct MevInitData {
        uint24 startingFee;
        uint24 endingFee;
        uint256 secondsToDecay;
    }

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        address pairedToken,
        int24 startingTick
    );

    error AlreadyInitialized();
    error ZeroAddress();
    error LpRewardTooHigh();
    error FeeTooHigh();
    error TickNotAligned();

    constructor(address factory_, address locker_, address hook_, address mevModule_) {
        if (factory_ == address(0) || locker_ == address(0) || hook_ == address(0) || mevModule_ == address(0)) {
            revert ZeroAddress();
        }
        clankerFactory = IClanker(factory_);
        clankerLocker = locker_;
        clankerHook = hook_;
        clankerMevModule = mevModule_;
        initialized = true; // brick the implementation; only clones get initialized
    }

    function initialize(string calldata name_, address feeRecipient_, uint16 lpRewardBps_) external {
        if (initialized) revert AlreadyInitialized();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        if (lpRewardBps_ > MAX_LP_REWARD_BPS) revert LpRewardTooHigh();
        initialized = true;
        launcherName = name_;
        feeRecipient = feeRecipient_;
        lpRewardBps = lpRewardBps_;
    }

    /// @notice Launch a token via the deployed Clanker v4 factory, force-paired with $HOODIE.
    function launch(LaunchParams calldata p) external returns (address token) {
        if (p.tokenAdmin == address(0)) revert ZeroAddress();
        if (p.clankerFeeBps > MAX_FEE_BPS || p.pairedFeeBps > MAX_FEE_BPS) revert FeeTooHigh();

        int24 startingTick = p.startingTick == 0 ? DEFAULT_STARTING_TICK : p.startingTick;
        if (startingTick % TICK_SPACING != 0) revert TickNotAligned();

        token = clankerFactory.deployToken(_buildConfig(p, startingTick));
        _tokens.push(token);
        launchCount += 1;

        emit TokenLaunched(token, p.tokenAdmin, p.name, p.symbol, HOODIE, startingTick);
    }

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function tokenAt(uint256 index) external view returns (address) {
        return _tokens[index];
    }

    function _buildConfig(LaunchParams calldata p, int24 startingTick)
        internal
        returns (IClanker.DeploymentConfig memory cfg)
    {
        // Unique CREATE2 salt per launch (factory salts with keccak256(tokenAdmin, salt)).
        bytes32 salt = keccak256(abi.encode(block.chainid, address(this), _saltNonce++, p.tokenAdmin));

        cfg.tokenConfig = IClanker.TokenConfig({
            tokenAdmin: p.tokenAdmin,
            name: p.name,
            symbol: p.symbol,
            salt: salt,
            image: p.image,
            metadata: p.metadata,
            context: p.context,
            originatingChainId: block.chainid
        });

        // Fee data in uni-bps (bps * 100), wrapped in the v4.1 pool-init tuple.
        bytes memory feeData = abi.encode(uint24(p.clankerFeeBps * 100), uint24(p.pairedFeeBps * 100));
        cfg.poolConfig = IClanker.PoolConfig({
            hook: clankerHook,
            pairedToken: HOODIE, // THE RULE. Injected by the contract; not a parameter.
            tickIfToken0IsClanker: startingTick,
            tickSpacing: TICK_SPACING,
            poolData: abi.encode(
                PoolInitializationData({extension: address(0), extensionData: "", feeData: feeData})
            )
        });

        cfg.lockerConfig = _buildLockerConfig(p.tokenAdmin, startingTick);
        cfg.mevModuleConfig = IClanker.MevModuleConfig({
            mevModule: clankerMevModule,
            // SDK defaults: 66.6777% -> 4.1673% decaying over 15s.
            mevModuleData: abi.encode(MevInitData({startingFee: 666777, endingFee: 41673, secondsToDecay: 15}))
        });
        cfg.extensionConfigs = new IClanker.ExtensionConfig[](0);
    }

    function _buildLockerConfig(address creator, int24 startingTick)
        internal
        view
        returns (IClanker.LockerConfig memory lockerCfg)
    {
        bool split = lpRewardBps > 0;
        uint256 n = split ? 2 : 1;

        address[] memory admins = new address[](n);
        address[] memory recipients = new address[](n);
        uint16[] memory bps = new uint16[](n);
        admins[0] = creator;
        recipients[0] = creator;
        bps[0] = split ? 10_000 - lpRewardBps : 10_000;
        if (split) {
            admins[1] = feeRecipient;
            recipients[1] = feeRecipient;
            bps[1] = lpRewardBps;
        }

        uint8[] memory feePreference = new uint8[](n); // 0 = fees in Both tokens

        // Single LP position starting exactly at the starting tick (factory requirement),
        // with the standard SDK width.
        int24[] memory tickLower = new int24[](1);
        int24[] memory tickUpper = new int24[](1);
        uint16[] memory positionBps = new uint16[](1);
        tickLower[0] = startingTick;
        tickUpper[0] = startingTick + POSITION_WIDTH;
        positionBps[0] = 10_000;

        lockerCfg = IClanker.LockerConfig({
            locker: clankerLocker,
            rewardAdmins: admins,
            rewardRecipients: recipients,
            rewardBps: bps,
            tickLower: tickLower,
            tickUpper: tickUpper,
            positionBps: positionBps,
            lockerData: abi.encode(LockerInstantiation({feePreference: feePreference}))
        });
    }
}
