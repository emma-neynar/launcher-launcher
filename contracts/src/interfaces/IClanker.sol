// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal interface for the ALREADY-DEPLOYED Clanker v4 factory on
/// Robinhood Chain (0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94). Struct layout
/// mirrors IClanker.DeploymentConfig exactly as encoded by clanker-sdk v4.2.18
/// (function selector 0xdf40224a). This repo only CALLS the factory — it never
/// deploys, upgrades, or administers any Clanker contract.
interface IClanker {
    struct TokenConfig {
        address tokenAdmin;
        string name;
        string symbol;
        bytes32 salt;
        string image;
        string metadata;
        string context;
        uint256 originatingChainId;
    }

    struct PoolConfig {
        address hook;
        address pairedToken;
        int24 tickIfToken0IsClanker;
        int24 tickSpacing;
        bytes poolData;
    }

    struct LockerConfig {
        address locker;
        address[] rewardAdmins;
        address[] rewardRecipients;
        uint16[] rewardBps;
        int24[] tickLower;
        int24[] tickUpper;
        uint16[] positionBps;
        bytes lockerData;
    }

    struct MevModuleConfig {
        address mevModule;
        bytes mevModuleData;
    }

    struct ExtensionConfig {
        address extension;
        uint256 msgValue;
        uint16 extensionBps;
        bytes extensionData;
    }

    struct DeploymentConfig {
        TokenConfig tokenConfig;
        PoolConfig poolConfig;
        LockerConfig lockerConfig;
        MevModuleConfig mevModuleConfig;
        ExtensionConfig[] extensionConfigs;
    }

    function deployToken(DeploymentConfig memory deploymentConfig)
        external
        payable
        returns (address tokenAddress);
}
