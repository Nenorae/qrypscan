// api/src/features/token/token.service.js
import * as tokenModel from "./token.model.js";
import config from "../../config/index.js";
import logger from "../../core/logger.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the image asset folder, relative to the project root
const IMAGE_ASSET_BASE_PATH = path.resolve(__dirname, "../../../tokenAsset/image");

/**
 * Mendapatkan semua informasi aset untuk token tertentu.
 * @param {string} address Alamat kontrak token.
 * @returns {Promise<object|null>} Objek yang berisi semua detail token dan URL aset.
 */
export async function getTokenAssetInfo(address) {
  logger.info(`[token.service.js] >> getTokenAssetInfo: ${address}`);
  const normalizedAddress = address.toLowerCase();

  try {
    const tokenInfo = await tokenModel.getTokenInfoByAddress(normalizedAddress);

    if (!tokenInfo) {
      logger.warn(`[token.service.js] Token info tidak ditemukan untuk ${normalizedAddress}`);
      return null;
    }

    // Konstruksi URL gambar
    // Pastikan gambar memiliki format yang sama, misalnya .png
    // Asumsi: Nama file gambar adalah alamat kontrak tanpa '0x' dan lowercase + .png
    const imageFileName = `${normalizedAddress}.png`;
    const imageFilePath = path.join(IMAGE_ASSET_BASE_PATH, imageFileName);

    let imageUrl = null;
    // Periksa apakah file gambar ada secara fisik
    if (fs.existsSync(imageFilePath)) {
      // Jika API diakses melalui HTTP, kita perlu host dan port yang benar
      // Ini harus diganti dengan domain publik yang sebenarnya saat deploy
      const apiHost = process.env.API_HOST || "http://localhost"; // Ambil dari env atau default
      const apiPort = config.port;
      imageUrl = `${apiHost}:${apiPort}/images/${imageFileName}`;
      logger.info(`[token.service.js] Image found: ${imageUrl}`);
    } else {
      logger.warn(`[token.service.js] Image file not found for ${imageFileName} at ${imageFilePath}`);
      // Bisa fallback ke gambar default atau null
    }

    return {
      address: tokenInfo.contractAddress,
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      decimals: tokenInfo.decimals,
      tokenType: tokenInfo.tokenType,
      logo: imageUrl,
    };
  } catch (error) {
    logger.error(`[token.service.js] Gagal mendapatkan info aset token untuk ${address}:`, error);
    throw error;
  }
}
