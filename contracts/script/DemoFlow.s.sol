// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Launcher} from "../src/Launcher.sol";
import {LauncherLauncher} from "../src/LauncherLauncher.sol";
import {RobinhoodClanker} from "../src/RobinhoodClanker.sol";

/// End-to-end demo intended for a LOCAL ANVIL FORK of Robinhood Chain:
/// deploy LauncherLauncher -> createLauncher -> launch a token through it,
/// then prove the token's pool pair on-chain. Run via scripts/fork-demo.sh.
contract DemoFlow is Script {
    function run() external {
        address me = msg.sender;

        vm.startBroadcast();

        LauncherLauncher ll = new LauncherLauncher(
            RobinhoodClanker.FACTORY,
            RobinhoodClanker.LOCKER,
            RobinhoodClanker.FEE_STATIC_HOOK_V2,
            RobinhoodClanker.MEV_MODULE
        );

        address launcher = ll.createLauncher("Hoodie Season", me, 2000);

        address token = Launcher(launcher).launch(
            Launcher.LaunchParams({
                name: "Demo Hoodie Token",
                symbol: "DEMO",
                image: "",
                metadata: '{"description":"fork demo token"}',
                context: '{"interface":"Launcher Launcher fork demo"}',
                tokenAdmin: me,
                startingTick: 0, // falls back to DEFAULT_STARTING_TICK (-27800)
                clankerFeeBps: 100,
                pairedFeeBps: 100
            })
        );

        vm.stopBroadcast();

        console2.log("LauncherLauncher:        ", address(ll));
        console2.log("Launcher (clone):        ", launcher);
        console2.log("Token:                   ", token);
        console2.log("Locked pair ($HOODIE):   ", Launcher(launcher).HOODIE());
        require(Launcher(launcher).HOODIE() == RobinhoodClanker.HOODIE, "HOODIE constant mismatch");
        require(Launcher(launcher).tokenAt(0) == token, "registry mismatch");
        require(token.code.length > 0, "token not deployed");
    }
}
