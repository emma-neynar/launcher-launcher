// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Already-deployed Clanker v4 periphery on Robinhood Chain (id 4663),
/// as registered in clanker-sdk v4.2.18 (CLANKERS.clanker_v4_robinhood).
/// These are consumed read-only: we only ever CALL the factory.
library RobinhoodClanker {
    uint256 internal constant CHAIN_ID = 4663;
    address internal constant FACTORY = 0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94;
    address internal constant LOCKER = 0x290F735F63824BB5836cDe24a35F5103A5B5Bc99;
    address internal constant FEE_STATIC_HOOK_V2 = 0x48B8F6AD3A1b4aA477314c9a23035b8F84dDe8cc;
    address internal constant MEV_MODULE = 0xEA1Fe197dF140e5d88fC6B49f2d21Ea05092299e;
    address internal constant HOODIE = 0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3;
}
