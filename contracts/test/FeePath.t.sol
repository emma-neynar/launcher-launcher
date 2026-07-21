// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Launcher} from "../src/Launcher.sol";
import {LauncherLauncher} from "../src/LauncherLauncher.sol";
import {RobinhoodClanker} from "../src/RobinhoodClanker.sol";

// ---------------------------------------------------------------------------
// Minimal Uniswap v4 + Clanker periphery interfaces (read from clanker-sdk ABIs)
// ---------------------------------------------------------------------------

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified; // negative = exact input
    uint160 sqrtPriceLimitX96;
}

interface IPoolManagerMinimal {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (int256 swapDelta);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

interface IClankerLpLockerMinimal {
    struct TokenRewardInfo {
        address token;
        PoolKey poolKey;
        uint256 positionId;
        uint256 numPositions;
        uint16[] rewardBps;
        address[] rewardAdmins;
        address[] rewardRecipients;
    }

    function tokenRewards(address token) external view returns (TokenRewardInfo memory);
    function collectRewards(address token) external;
}

interface IClankerFeeLockerMinimal {
    function availableFees(address feeOwner, address token) external view returns (uint256);
    function claim(address feeOwner, address token) external;
}

interface IERC20Minimal {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IHookWithPoolManager {
    function poolManager() external view returns (address);
}

/// @dev Bare-bones v4 swap router for tests: unlock -> swap -> settle/take.
contract TestSwapRouter {
    IPoolManagerMinimal public immutable pm;

    uint160 private constant MIN_SQRT_PRICE_PLUS_1 = 4295128740;
    uint160 private constant MAX_SQRT_PRICE_MINUS_1 =
        1461446703485210103287273052203988822378723970341;

    constructor(address pm_) {
        pm = IPoolManagerMinimal(pm_);
    }

    /// @notice Exact-input swap; input tokens must already sit in this contract.
    function swapExactIn(PoolKey memory key, address tokenIn, uint256 amountIn) external {
        bool zeroForOne = tokenIn == key.currency0;
        pm.unlock(abi.encode(key, SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE_PLUS_1 : MAX_SQRT_PRICE_MINUS_1
        })));
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == address(pm), "only pool manager");
        (PoolKey memory key, SwapParams memory params) = abi.decode(rawData, (PoolKey, SwapParams));

        int256 delta = pm.swap(key, params, "");
        int128 amount0 = int128(delta >> 128);
        int128 amount1 = int128(delta); // truncates to the low 128 bits, sign-preserving

        _settle(key.currency0, amount0);
        _settle(key.currency1, amount1);
        return "";
    }

    function _settle(address currency, int128 amount) internal {
        if (amount < 0) {
            // We owe the pool: sync, pay, settle.
            pm.sync(currency);
            IERC20Minimal(currency).transfer(address(pm), uint256(uint128(-amount)));
            pm.settle();
        } else if (amount > 0) {
            pm.take(currency, address(this), uint256(uint128(amount)));
        }
    }
}

/// Fork test for the FEE PATH — not just the pairing. Proves that after real
/// swap volume on the pool, the launcher's `feeRecipient` actually receives its
/// configured share of LP fees through Clanker's locker -> fee-locker pipeline:
///   swap (fees accrue) -> LpLocker.collectRewards(token) splits by rewardBps
///   -> FeeLocker.claim(recipient, HOODIE) pays out ERC20 to the recipient.
contract FeePathForkTest is Test {
    LauncherLauncher ll;
    TestSwapRouter router;

    address user = address(0xBEEF); // token creator (majority reward recipient)
    address launcherOwner = address(0xFEE); // launcher feeRecipient (minority share)
    uint16 constant LP_REWARD_BPS = 2000; // 20% to launcherOwner, 80% to creator

    IClankerLpLockerMinimal locker = IClankerLpLockerMinimal(RobinhoodClanker.LOCKER);
    IClankerFeeLockerMinimal feeLocker = IClankerFeeLockerMinimal(RobinhoodClanker.FEE_LOCKER);
    IERC20Minimal hoodie = IERC20Minimal(RobinhoodClanker.HOODIE);

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com"));
        vm.createSelectFork(rpc);

        ll = new LauncherLauncher(
            RobinhoodClanker.FACTORY,
            RobinhoodClanker.LOCKER,
            RobinhoodClanker.FEE_STATIC_HOOK_V2,
            RobinhoodClanker.MEV_MODULE
        );
        router = new TestSwapRouter(IHookWithPoolManager(RobinhoodClanker.FEE_STATIC_HOOK_V2).poolManager());
    }

    function test_feeRecipient_receivesLpFeeSplit() public {
        // 1. Launch through the wrapper with a 20% LP-reward share.
        address launcher = ll.createLauncher("Fee Path", launcherOwner, LP_REWARD_BPS);
        vm.prank(user);
        address token = Launcher(launcher).launch(
            Launcher.LaunchParams({
                name: "Fee Path Token",
                symbol: "FEE",
                image: "",
                metadata: "",
                context: '{"interface":"fee path fork test"}',
                tokenAdmin: user,
                startingTick: 0,
                clankerFeeBps: 100, // 1% each side
                pairedFeeBps: 100
            })
        );

        // 2. The locker's on-chain reward table must match what the wrapper configured.
        IClankerLpLockerMinimal.TokenRewardInfo memory info = locker.tokenRewards(token);
        assertEq(info.rewardRecipients.length, 2, "two reward recipients");
        assertEq(info.rewardRecipients[0], user, "creator is recipient 0");
        assertEq(info.rewardRecipients[1], launcherOwner, "launcher feeRecipient is recipient 1");
        assertEq(info.rewardBps[0], 10_000 - LP_REWARD_BPS);
        assertEq(info.rewardBps[1], LP_REWARD_BPS);

        // 3. Generate real fee volume: buy the new token with $HOODIE.
        // Warp past the MEV sniper-auction decay window so the swap pays normal fees.
        vm.warp(block.timestamp + 300);
        uint256 amountIn = 100_000e18; // 100k HOODIE
        deal(RobinhoodClanker.HOODIE, address(router), amountIn);
        router.swapExactIn(info.poolKey, RobinhoodClanker.HOODIE, amountIn);
        assertGt(IERC20Minimal(token).balanceOf(address(router)), 0, "swap must output the new token");

        // 4. Collect: locker pulls accrued LP fees and stores per-recipient balances.
        locker.collectRewards(token);

        uint256 creatorFees = feeLocker.availableFees(user, RobinhoodClanker.HOODIE);
        uint256 recipientFees = feeLocker.availableFees(launcherOwner, RobinhoodClanker.HOODIE);
        assertGt(recipientFees, 0, "feeRecipient must have claimable HOODIE fees");
        assertGt(creatorFees, 0, "creator must have claimable HOODIE fees");

        // 80/20 split (allow rounding + fee-conversion dust of 0.1%).
        assertApproxEqRel(
            creatorFees * LP_REWARD_BPS,
            recipientFees * (10_000 - LP_REWARD_BPS),
            0.001e18,
            "split must match configured rewardBps"
        );

        // 5. Claim: recipient actually RECEIVES the ERC20. Claim is permissionless
        //    but always pays the feeOwner.
        uint256 before = hoodie.balanceOf(launcherOwner);
        feeLocker.claim(launcherOwner, RobinhoodClanker.HOODIE);
        assertEq(hoodie.balanceOf(launcherOwner) - before, recipientFees, "claimed HOODIE lands with feeRecipient");
        assertEq(feeLocker.availableFees(launcherOwner, RobinhoodClanker.HOODIE), 0, "claim drains the balance");
    }

    /// With lpRewardBps = 0 the creator is the sole recipient — 100% of fees.
    function test_zeroLpShare_creatorGetsEverything() public {
        address launcher = ll.createLauncher("Solo", launcherOwner, 0);
        vm.prank(user);
        address token = Launcher(launcher).launch(
            Launcher.LaunchParams({
                name: "Solo Token",
                symbol: "SOLO",
                image: "",
                metadata: "",
                context: "",
                tokenAdmin: user,
                startingTick: 0,
                clankerFeeBps: 100,
                pairedFeeBps: 100
            })
        );

        IClankerLpLockerMinimal.TokenRewardInfo memory info = locker.tokenRewards(token);
        assertEq(info.rewardRecipients.length, 1);
        assertEq(info.rewardRecipients[0], user);
        assertEq(info.rewardBps[0], 10_000);

        vm.warp(block.timestamp + 300);
        deal(RobinhoodClanker.HOODIE, address(router), 10_000e18);
        router.swapExactIn(info.poolKey, RobinhoodClanker.HOODIE, 10_000e18);
        locker.collectRewards(token);

        assertGt(feeLocker.availableFees(user, RobinhoodClanker.HOODIE), 0);
        assertEq(feeLocker.availableFees(launcherOwner, RobinhoodClanker.HOODIE), 0, "no share configured, no fees");
    }
}
