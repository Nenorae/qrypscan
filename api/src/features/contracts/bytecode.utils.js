// api/src/features/contracts/bytecode.utils.js

/**
 * Menghapus hash metadata dari bytecode.
 * @param {string} bytecode Bytecode yang mungkin mengandung metadata.
 * @returns {string} Bytecode yang sudah bersih dari metadata.
 */
export function stripMetadata(bytecode) {
  // Pattern untuk metadata Swarm (legacy) dan IPFS (modern)
  const legacyRegex = /a165627a7a72305820\w{64}0029$/;
  const modernRegex = /a2646970667358221220\w{64}64736f6c6343\w{6}0033$/;

  let cleaned = bytecode.replace(modernRegex, "");
  cleaned = cleaned.replace(legacyRegex, "");

  return cleaned;
}

/**
 * Menganalisis dan mencetak insight dari sebuah bytecode.
 * @param {string} bytecode Bytecode (tanpa "0x" di depan).
 * @param {string} label Nama untuk logging (misal: "DEPLOYED" atau "COMPILED").
 */
export function analyzeBytecode(bytecode, label) {
  console.log(`\n=== ANALISIS BYTECODE ${label.toUpperCase()} ===`);
  console.log(`Panjang total: ${bytecode.length} karakter`);
  console.log(`Panjang dalam bytes: ${bytecode.length / 2} bytes`);

  const modernMetadata = bytecode.match(/a2646970667358221220\w{64}64736f6c6343\w{6}0033$/);
  if (modernMetadata) {
    console.log(`✅ Metadata modern ditemukan: ${modernMetadata[0]}`);
  }

  const withoutMetadata = stripMetadata(bytecode);
  const constructorArgs = bytecode.substring(withoutMetadata.length);
  if (constructorArgs && constructorArgs !== bytecode) {
    console.log(`✅ Constructor arguments terdeteksi: ${constructorArgs}`);
  }
  
  console.log(`Bagian awal (opcodes): ${bytecode.substring(0, 100)}...`);
  console.log(`=== AKHIR ANALISIS ${label.toUpperCase()} ===\n`);
}

/**
 * Membandingkan bytecode yang di-deploy dengan bytecode hasil kompilasi.
 * @param {string} deployedBytecode Bytecode dari chain (dengan "0x").
 * @param {string} runtimeBytecode Bytecode dari kompilasi (dengan "0x").
 * @returns {{isIdentical: boolean, isSubset: boolean, cleanedDeployed: string, cleanedRuntime: string}}
 */
export function compareBytecode(deployedBytecode, runtimeBytecode) {
  console.log("\n=== PERBANDINGAN BYTECODE DETAIL ===");

  const cleanedDeployed = stripMetadata(deployedBytecode.slice(2));
  const cleanedRuntime = stripMetadata(runtimeBytecode.slice(2));

  console.log(`Panjang deployed (clean): ${cleanedDeployed.length}`);
  console.log(`Panjang compiled (clean): ${cleanedRuntime.length}`);

  const isSubset = cleanedDeployed.startsWith(cleanedRuntime);
  console.log(`Compiled adalah subset dari deployed: ${isSubset}`);

  const isIdentical = cleanedDeployed === cleanedRuntime;
  console.log(`Bytecode identik: ${isIdentical}`);
  
  if (!isIdentical) {
    // Logika untuk menampilkan perbedaan jika ada
    logDifferences(cleanedDeployed, cleanedRuntime);
  }

  console.log("=== AKHIR PERBANDINGAN ===\n");
  return { isIdentical, isSubset, cleanedDeployed, cleanedRuntime };
}

/**
 * Helper untuk mencatat perbedaan antara dua string bytecode.
 * @param {string} deployed 
 * @param {string} compiled 
 */
function logDifferences(deployed, compiled) {
    const minLength = Math.min(deployed.length, compiled.length);
    let firstDiff = -1;

    for (let i = 0; i < minLength; i += 2) {
      if (deployed.substring(i, i + 2) !== compiled.substring(i, i + 2)) {
        firstDiff = i;
        break;
      }
    }

    if (firstDiff !== -1) {
      console.log(`❌ Perbedaan pertama pada posisi: ${firstDiff} (byte ${firstDiff / 2})`);
      console.log(`   Deployed: ...${deployed.substring(firstDiff - 10, firstDiff + 20)}...`);
      console.log(`   Compiled: ...${compiled.substring(firstDiff - 10, firstDiff + 20)}...`);
    }

    if (deployed.length !== compiled.length) {
      const lengthDiff = deployed.length - compiled.length;
      console.log(`📏 Perbedaan panjang: ${lengthDiff} karakter (${lengthDiff / 2} bytes)`);
      if (lengthDiff > 0) {
        const extraData = deployed.substring(compiled.length);
        console.log(`   Data extra di deployed: ${extraData.substring(0, 100)}...`);
      }
    }
}