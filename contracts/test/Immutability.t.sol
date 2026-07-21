// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Launcher} from "../src/Launcher.sol";
import {LauncherLauncher} from "../src/LauncherLauncher.sol";
import {RobinhoodClanker} from "../src/RobinhoodClanker.sol";

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

        LauncherLauncher.LauncherInfo[] memory list = ll.allLaunchers();
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

    function test_createLauncher_rejectsBadParams() public {
        vm.expectRevert(Launcher.ZeroAddress.selector);
        ll.createLauncher("A", address(0), 0);
        vm.expectRevert(Launcher.LpRewardTooHigh.selector);
        ll.createLauncher("A", feeRecipient, 5001);
    }
}
