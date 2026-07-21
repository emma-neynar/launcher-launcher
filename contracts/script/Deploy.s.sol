// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {LauncherLauncher} from "../src/LauncherLauncher.sol";
import {RobinhoodClanker} from "../src/RobinhoodClanker.sol";

/// Deploys LauncherLauncher (which deploys the Launcher implementation).
/// Used by scripts/fork-demo.sh (local Anvil fork) and scripts/deploy-live.sh
/// (explicitly gated mainnet deploy). Only OUR wrapper is deployed — the
/// Clanker factory is referenced at its existing address, never touched.
contract Deploy is Script {
    function run() external returns (LauncherLauncher ll) {
        vm.startBroadcast();
        ll = new LauncherLauncher(
            RobinhoodClanker.FACTORY,
            RobinhoodClanker.LOCKER,
            RobinhoodClanker.FEE_STATIC_HOOK_V2,
            RobinhoodClanker.MEV_MODULE
        );
        vm.stopBroadcast();
        console2.log("LauncherLauncher:", address(ll));
        console2.log("Launcher implementation:", ll.implementation());
    }
}
