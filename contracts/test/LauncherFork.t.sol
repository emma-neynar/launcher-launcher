// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Launcher} from "../src/Launcher.sol";
import {LauncherLauncher} from "../src/LauncherLauncher.sol";
import {RobinhoodClanker} from "../src/RobinhoodClanker.sol";

/// Fork tests against the LIVE, already-deployed Clanker v4 factory on
/// Robinhood Chain (no testnet exists, so we fork mainnet locally — read-only,
/// nothing is broadcast). Full flow: createLauncher -> launch -> assert the
/// factory's own TokenCreated event says pairedToken == $HOODIE.
contract LauncherForkTest is Test {
    // keccak256("TokenCreated(address,address,address,string,string,string,string,string,int24,address,bytes32,address,address,address,uint256,address[])")
    bytes32 constant TOKEN_CREATED_SIG =
        keccak256(
            "TokenCreated(address,address,address,string,string,string,string,string,int24,address,bytes32,address,address,address,uint256,address[])"
        );

    LauncherLauncher ll;
    address user = address(0xBEEF);
    address launcherOwner = address(0xFEE);

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com"));
        vm.createSelectFork(rpc);
        assertEq(block.chainid, RobinhoodClanker.CHAIN_ID, "fork must be Robinhood Chain");

        ll = new LauncherLauncher(
            RobinhoodClanker.FACTORY,
            RobinhoodClanker.LOCKER,
            RobinhoodClanker.FEE_STATIC_HOOK_V2,
            RobinhoodClanker.MEV_MODULE
        );
    }

    function _launch(address launcher, string memory name, string memory symbol, int24 tick, uint24 fee)
        internal
        returns (address token, address pairedTokenFromFactoryEvent)
    {
        vm.recordLogs();
        vm.prank(user);
        token = Launcher(launcher).launch(
            Launcher.LaunchParams({
                name: name,
                symbol: symbol,
                image: "",
                metadata: "",
                context: '{"interface":"Launcher Launcher fork test"}',
                tokenAdmin: user,
                startingTick: tick,
                clankerFeeBps: fee,
                pairedFeeBps: fee
            })
        );

        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == RobinhoodClanker.FACTORY && logs[i].topics[0] == TOKEN_CREATED_SIG) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), token, "event token == returned token");
                pairedTokenFromFactoryEvent = _pairedTokenFromEventData(logs[i].data);
                return (token, pairedTokenFromFactoryEvent);
            }
        }
        revert("factory TokenCreated event not found");
    }

    /// @dev TokenCreated data layout (non-indexed params): slot 9 is pairedToken.
    /// [0]=msgSender [1..5]=offsets(image,name,symbol,metadata,context)
    /// [6]=startingTick [7]=poolHook [8]=poolId [9]=pairedToken ...
    function _pairedTokenFromEventData(bytes memory data) internal pure returns (address paired) {
        assembly {
            paired := mload(add(data, mul(10, 0x20))) // 0x20 header + 9*0x20
        }
    }

    function test_fullFlow_tokenPairedWithHoodie() public {
        address launcher = ll.createLauncher("Hoodie Season", launcherOwner, 2000);

        (address token, address paired) = _launch(launcher, "Fork Proof Token", "PROOF", 0, 100);

        assertEq(paired, RobinhoodClanker.HOODIE, "factory event: pairedToken must be $HOODIE");
        assertGt(token.code.length, 0, "token contract deployed");
        assertEq(Launcher(launcher).tokenAt(0), token, "launcher records the token");
        assertEq(Launcher(launcher).launchCount(), 1);
    }

    function test_customTick_stillHoodie() public {
        address launcher = ll.createLauncher("Custom MCap", launcherOwner, 0);
        // ~1M HOODIE market cap => tick around -115200 (multiple of 200)
        (, address paired) = _launch(launcher, "Big Cap", "BIG", -115200, 100);
        assertEq(paired, RobinhoodClanker.HOODIE);
    }

    /// Reject-by-construction, exercised: whatever params a caller supplies,
    /// the resulting pool pair is $HOODIE. (LaunchParams has no pair field.)
    function testFuzz_launch_alwaysPairsHoodie(uint8 tickSteps, uint24 fee, uint16 lpShare) public {
        lpShare = uint16(bound(lpShare, 0, 5000));
        fee = uint24(bound(fee, 0, 1000));
        // ticks from -230400 up in 200-tick steps
        int24 tick = int24(-230400 + int256(uint256(tickSteps)) * 200);

        address launcher = ll.createLauncher("Fuzz", launcherOwner, lpShare);
        (, address paired) = _launch(launcher, "Fuzz Token", "FUZZ", tick, fee);
        assertEq(paired, RobinhoodClanker.HOODIE);
    }

    function test_launch_rejectsMisalignedTick() public {
        address launcher = ll.createLauncher("Strict", launcherOwner, 0);
        vm.expectRevert(Launcher.TickNotAligned.selector);
        vm.prank(user);
        Launcher(launcher).launch(
            Launcher.LaunchParams({
                name: "Bad Tick",
                symbol: "BAD",
                image: "",
                metadata: "",
                context: "",
                tokenAdmin: user,
                startingTick: -230401,
                clankerFeeBps: 100,
                pairedFeeBps: 100
            })
        );
    }

    function test_twoLaunchesSameParams_noSaltCollision() public {
        address launcher = ll.createLauncher("Twice", launcherOwner, 2000);
        (address t1,) = _launch(launcher, "Same", "SAME", 0, 100);
        (address t2,) = _launch(launcher, "Same", "SAME", 0, 100);
        assertTrue(t1 != t2, "unique salts must yield unique tokens");
    }
}
