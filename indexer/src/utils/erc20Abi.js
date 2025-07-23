// File: indexer/src/utils/erc20Abi.js

// Ini adalah bagian minimal dari ABI ERC-20 yang kita butuhkan
export const erc20Abi = [
  // Event Transfer(address,address,uint256)
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  // Fungsi untuk mendapatkan metadata token
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
];
