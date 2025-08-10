// File: indexer/src/processors/proxyConstants.js

import { ethers } from "ethers";

// EIP-1967 Storage Slots
export const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3464663b489977ab5d12a38415647b";
export const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

// Event signatures for various proxy patterns
export const PROXY_EVENT_SIGNATURES = {
  // OpenZeppelin Upgradeable Proxy
  UPGRADED: "0xbc7cd75a20ee27fd9adebabcf784c44594004fee1e8ca125ba64cc182b75ceae",
  // Diamond Proxy (EIP-2535)
  DIAMOND_CUT: "0x8faa70878671ccd212d20771b795c50af8fd3ff6cf27f4bde57e5d4de0aeb673",
  // Beacon Proxy
  BEACON_UPGRADED: "0xa2fd66f94dceb9fcc67b0f5f1e6b3c3e1c4a7f1b3b8b4e6c7e8f9e0d1c2b3a4f5",
};

// Minimal ABIs for parsing different proxy events
export const proxyInterfaces = {
  upgradeable: new ethers.Interface(["event Upgraded(address indexed implementation)"]),
  diamond: new ethers.Interface(["event DiamondCut(tuple(address facetAddress, uint8 action, bytes4[] functionSelectors)[] _diamondCut, address _init, bytes _calldata)"]),
  beacon: new ethers.Interface(["event BeaconUpgraded(address indexed beacon)"]),
};
