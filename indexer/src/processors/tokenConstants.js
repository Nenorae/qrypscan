// File: indexer/src/processors/tokenConstants.js

import { ethers } from "ethers";

// Event signatures untuk berbagai token standards
export const TOKEN_EVENT_SIGNATURES = {
  // ERC20 Transfer
  TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  // ERC20 Approval
  APPROVAL: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
  // ERC721 Transfer (same as ERC20 but different data structure)
  ERC721_TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  // ERC1155 TransferSingle
  ERC1155_TRANSFER_SINGLE: "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62",
  // ERC1155 TransferBatch
  ERC1155_TRANSFER_BATCH: "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb",
};

// Enhanced interfaces for different token types
export const tokenInterfaces = {
  erc20: new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
  ]),
  erc721: new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function totalSupply() view returns (uint256)",
  ]),
  erc1155: new ethers.Interface([
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  ]),
};
