// File: indexer/src/processors/tokenUtils.js

import { TOKEN_EVENT_SIGNATURES } from "./tokenConstants.js";

/**
 * Detect token standard based on event signature and topic structure
 */
export function detectTokenStandard(log) {
  const eventTopic = log.topics[0];

  switch (eventTopic) {
    case TOKEN_EVENT_SIGNATURES.TRANSFER:
      // Both ERC20 and ERC721 use the same Transfer signature
      // ERC20: Transfer(address,address,uint256) - 3 topics
      // ERC721: Transfer(address,address,uint256) - 4 topics (tokenId is indexed)
      return log.topics.length === 4 ? "ERC721" : "ERC20";

    case TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_SINGLE:
      return "ERC1155";

    case TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_BATCH:
      return "ERC1155";

    default:
      return null;
  }
}

/**
 * Determine transfer type based on from/to addresses
 */
export function getTransferType(from, to) {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  if (from === ZERO_ADDRESS && to !== ZERO_ADDRESS) {
    return "mint";
  } else if (from !== ZERO_ADDRESS && to === ZERO_ADDRESS) {
    return "burn";
  } else if (from !== ZERO_ADDRESS && to !== ZERO_ADDRESS) {
    return "transfer";
  } else {
    return "unknown";
  }
}
