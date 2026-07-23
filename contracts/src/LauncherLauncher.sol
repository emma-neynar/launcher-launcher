// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Launcher} from "./Launcher.sol";

/// @title LauncherLauncher — spin up your own $HOODIE-locked token launcher.
/// @notice Deploys one canonical `Launcher` implementation, then hands out
/// EIP-1167 minimal-proxy clones of it. Every clone shares the implementation
/// bytecode, so every launcher inherits the immutable $HOODIE pairing rule —
/// there is no per-launcher escape hatch.
contract LauncherLauncher {
    struct LauncherInfo {
        address launcher;
        address creator;
        string name;
        address feeRecipient;
        uint16 lpRewardBps;
        uint64 createdAt;
    }

    address public immutable implementation;

    address[] private _launchers;
    mapping(address => LauncherInfo) public infoFor;
    mapping(address => bool) public isLauncher;

    event LauncherCreated(
        address indexed launcher,
        address indexed creator,
        string name,
        address feeRecipient,
        uint16 lpRewardBps
    );

    error CloneFailed();

    constructor(address factory_, address locker_, address hook_, address mevModule_) {
        implementation = address(new Launcher(factory_, locker_, hook_, mevModule_));
    }

    /// @notice Create your own Launcher. As easy as launching a token.
    function createLauncher(string calldata name_, address feeRecipient_, uint16 lpRewardBps_)
        external
        returns (address launcher)
    {
        launcher = _clone(implementation);
        Launcher(launcher).initialize(name_, feeRecipient_, lpRewardBps_);

        _launchers.push(launcher);
        isLauncher[launcher] = true;
        infoFor[launcher] = LauncherInfo({
            launcher: launcher,
            creator: msg.sender,
            name: name_,
            feeRecipient: feeRecipient_,
            lpRewardBps: lpRewardBps_,
            createdAt: uint64(block.timestamp)
        });

        emit LauncherCreated(launcher, msg.sender, name_, feeRecipient_, lpRewardBps_);
    }

    function launcherCount() external view returns (uint256) {
        return _launchers.length;
    }

    function launcherAt(uint256 index) external view returns (address) {
        return _launchers[index];
    }

    /// @notice Paginated read of launcher registry entries. `start` past the
    /// end returns an empty array; `count` is clamped to the remaining items.
    function launchersRange(uint256 start, uint256 count) external view returns (LauncherInfo[] memory page) {
        uint256 len = _launchers.length;
        if (start >= len) return new LauncherInfo[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        page = new LauncherInfo[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = infoFor[_launchers[i]];
        }
    }

    /// @dev Canonical EIP-1167 minimal proxy.
    function _clone(address impl) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        if (instance == address(0)) revert CloneFailed();
    }
}
