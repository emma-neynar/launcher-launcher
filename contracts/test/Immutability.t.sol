// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Launcher} from "../src/Launcher.sol";
import {LauncherLauncher} from "../src/LauncherLauncher.sol";
import {RobinhoodClanker} from "../src/RobinhoodClanker.sol";
import {IClanker} from "../src/interfaces/IClanker.sol";

/// Unit tests (no fork needed) proving the $HOODIE rule is immutable by
/// construction:
///  - HOODIE is a compile-time constant with the exact expected address
///  - there is no setter: the only state-writing entrypoints are
///    initialize() (guarded, and takes no pair) and launch() (whose params
///    struct has no pairedToken field — see Launcher.LaunchParams)
///  - the implementation is bricked and clones can only initialize once
contract ImmutabilityTest is Test {
    LauncherLauncher ll;
    Launcher impl;

    address constant HOODIE = 0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3;
    address feeRecipient = address(0xFEE);

    function setUp() public {
        ll = new LauncherLauncher(
            RobinhoodClanker.FACTORY,
            RobinhoodClanker.LOCKER,
            RobinhoodClanker.FEE_STATIC_HOOK_V2,
            RobinhoodClanker.MEV_MODULE
        );
        impl = Launcher(ll.implementation());
    }

    function test_hoodieIsConstant_expectedAddress() public view {
        assertEq(impl.HOODIE(), HOODIE, "implementation HOODIE constant");
    }

    function test_everyCloneInheritsHoodie() public {
        address a = ll.createLauncher("A", feeRecipient, 2000);
        address b = ll.createLauncher("B", feeRecipient, 0);
        assertEq(Launcher(a).HOODIE(), HOODIE);
        assertEq(Launcher(b).HOODIE(), HOODIE);
    }

    function test_implementationIsBricked() public {
        assertTrue(impl.initialized(), "implementation must be pre-initialized");
        vm.expectRevert(Launcher.AlreadyInitialized.selector);
        impl.initialize("evil", address(this), 0);
    }

    function test_cloneInitializesExactlyOnce() public {
        address a = ll.createLauncher("A", feeRecipient, 2000);
        vm.expectRevert(Launcher.AlreadyInitialized.selector);
        Launcher(a).initialize("takeover", address(this), 5000);
    }

    function test_noPairSetterExists() public {
        // The Launcher ABI has exactly one state-mutating external function
        // besides initialize(): launch(LaunchParams). LaunchParams has no
        // pairedToken member (compile-time property — this test documents it),
        // and the periphery addresses are immutables with no setters. Calling
        // any unknown selector (e.g. a hypothetical setPairedToken) reverts.
        address a = ll.createLauncher("A", feeRecipient, 2000);
        (bool okAddr,) = a.call(abi.encodeWithSignature("setPairedToken(address)", address(0xBAD)));
        assertFalse(okAddr, "no setPairedToken(address)");
        (bool okStr,) = a.call(abi.encodeWithSignature("setPair(address)", address(0xBAD)));
        assertFalse(okStr, "no setPair(address)");
        assertEq(Launcher(a).HOODIE(), HOODIE, "pair unchanged");
    }

    function test_createLauncher_registry() public {
        address a = ll.createLauncher("Hoodie Season", feeRecipient, 2000);
        assertEq(ll.launcherCount(), 1);
        assertEq(ll.launcherAt(0), a);
        assertTrue(ll.isLauncher(a));

        LauncherLauncher.LauncherInfo[] memory list = ll.launchersRange(0, 10);
        assertEq(list.length, 1);
        assertEq(list[0].launcher, a);
        assertEq(list[0].creator, address(this));
        assertEq(list[0].name, "Hoodie Season");
        assertEq(list[0].feeRecipient, feeRecipient);
        assertEq(list[0].lpRewardBps, 2000);

        assertEq(Launcher(a).launcherName(), "Hoodie Season");
        assertEq(Launcher(a).feeRecipient(), feeRecipient);
        assertEq(Launcher(a).lpRewardBps(), 2000);
    }

    function test_launchersRange_pagination() public {
        address a = ll.createLauncher("A", feeRecipient, 0);
        address b = ll.createLauncher("B", feeRecipient, 0);
        address c = ll.createLauncher("C", feeRecipient, 0);

        // Count clamped to the remaining items.
        LauncherLauncher.LauncherInfo[] memory page = ll.launchersRange(1, 100);
        assertEq(page.length, 2);
        assertEq(page[0].launcher, b);
        assertEq(page[1].launcher, c);

        // Exact window.
        page = ll.launchersRange(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0].launcher, a);
        assertEq(page[1].launcher, b);

        // Start past the end -> empty, no revert.
        page = ll.launchersRange(3, 10);
        assertEq(page.length, 0);
    }

    function _params(string memory name, string memory symbol) internal pure returns (Launcher.LaunchParams memory) {
        return Launcher.LaunchParams({
            name: name,
            symbol: symbol,
            image: "",
            metadata: "",
            context: "",
            startingTick: 0,
            clankerFeeBps: 100,
            pairedFeeBps: 100
        });
    }

    /// C-02: launch() must revert on the implementation itself but work on a
    /// clone (EIP-1167 forwards via delegatecall, so address(this) inside the
    /// clone is the clone address, not the implementation address).
    function test_launch_revertsOnImplementation_worksOnClone() public {
        vm.expectRevert(Launcher.NotClone.selector);
        impl.launch(_params("Direct", "DIR"));

        // A clone still launches fine. The live factory isn't deployed in this
        // unit-test environment, so mock deployToken at the factory address.
        address clone = ll.createLauncher("A", feeRecipient, 2000);
        address fakeToken = address(0x70CE2);
        vm.etch(RobinhoodClanker.FACTORY, hex"00");
        vm.mockCall(
            RobinhoodClanker.FACTORY,
            abi.encodeWithSelector(IClanker.deployToken.selector),
            abi.encode(fakeToken)
        );

        address token = Launcher(clone).launch(_params("Via Clone", "CLONE"));
        assertEq(token, fakeToken);
        assertEq(Launcher(clone).launchCount(), 1);
        assertEq(Launcher(clone).tokenAt(0), fakeToken);
        assertEq(Launcher(impl).launchCount(), 0, "implementation state untouched");
    }

    function test_tokensRange_pagination() public {
        address clone = ll.createLauncher("A", feeRecipient, 0);
        vm.etch(RobinhoodClanker.FACTORY, hex"00");
        address t1 = address(0x7001);
        address t2 = address(0x7002);
        vm.mockCall(
            RobinhoodClanker.FACTORY, abi.encodeWithSelector(IClanker.deployToken.selector), abi.encode(t1)
        );
        Launcher(clone).launch(_params("One", "ONE"));
        vm.mockCall(
            RobinhoodClanker.FACTORY, abi.encodeWithSelector(IClanker.deployToken.selector), abi.encode(t2)
        );
        Launcher(clone).launch(_params("Two", "TWO"));

        address[] memory page = Launcher(clone).tokensRange(0, 100);
        assertEq(page.length, 2);
        assertEq(page[0], t1);
        assertEq(page[1], t2);

        page = Launcher(clone).tokensRange(1, 1);
        assertEq(page.length, 1);
        assertEq(page[0], t2);

        page = Launcher(clone).tokensRange(2, 5);
        assertEq(page.length, 0);
    }

    function test_createLauncher_rejectsBadParams() public {
        vm.expectRevert(Launcher.ZeroAddress.selector);
        ll.createLauncher("A", address(0), 0);
        vm.expectRevert(Launcher.LpRewardTooHigh.selector);
        ll.createLauncher("A", feeRecipient, 5001);
    }
}
