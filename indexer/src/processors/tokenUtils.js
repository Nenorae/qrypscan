// File: indexer/src/processors/tokenUtils.js

import { TOKEN_EVENT_SIGNATURES } from "./tokenConstants.js";

/**
 * Detect token standard based on event signature and topic structure
 */
export function detectTokenStandard(log) {
  const eventTopic = log.topics[0];
  console.log(`[TOKEN-UTIL] Mendeteksi standar token dari topik: ${eventTopic}`);

  switch (eventTopic) {
    case TOKEN_EVENT_SIGNATURES.TRANSFER:
      // Both ERC20 and ERC721 use the same Transfer signature
      // ERC20: Transfer(address,address,uint256) - 3 topics
      // ERC721: Transfer(address,address,uint256) - 4 topics (tokenId is indexed)
      const standard = log.topics.length === 4 ? "ERC721" : "ERC20";
      console.log(`[TOKEN-UTIL] Topik transfer cocok. Jumlah topik: ${log.topics.length}, terdeteksi sebagai: ${standard}`);
      return standard;

    case TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_SINGLE:
      console.log(`[TOKEN-UTIL] Topik cocok dengan ERC1155_TRANSFER_SINGLE, terdeteksi sebagai: ERC1155`);
      return "ERC1155";

    case TOKEN_EVENT_SIGNATURES.ERC1155_TRANSFER_BATCH:
      console.log(`[TOKEN-UTIL] Topik cocok dengan ERC1155_TRANSFER_BATCH, terdeteksi sebagai: ERC1155`);
      return "ERC1155";

    default:
      console.log(`[TOKEN-UTIL] Topik tidak cocok dengan standar token yang dikenali.`);
      return null;
  }
}

/**
 * Determine transfer type based on from/to addresses
 */
export function getTransferType(from, to) {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  console.log(`[TOKEN-UTIL] Menentukan tipe transfer dari: ${from}, ke: ${to}`);

  if (from === ZERO_ADDRESS && to !== ZERO_ADDRESS) {
    console.log(`[TOKEN-UTIL] Tipe transfer terdeteksi: mint`);
    return "mint";
  } else if (from !== ZERO_ADDRESS && to === ZERO_ADDRESS) {
    console.log(`[TOKEN-UTIL] Tipe transfer terdeteksi: burn`);
    return "burn";
  } else if (from !== ZERO_ADDRESS && to !== ZERO_ADDRESS) {
    console.log(`[TOKEN-UTIL] Tipe transfer terdeteksi: transfer`);
    return "transfer";
  } else {
    console.log(`[TOKEN-UTIL] Tipe transfer terdeteksi: unknown`);
    return "unknown";
  }
}
