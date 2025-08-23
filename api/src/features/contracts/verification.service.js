import { debugUtils } from "./verification.utils.js";
import { validateAndDefault } from "./verification.validator.js";
import { getDeployedBytecode, compareBytecodes } from "./verification.bytecode.js";
import { prepareSolcInput, compile, extractContractArtifact } from "./verification.compiler.js";
import { saveVerificationResult } from "./verification.db.js";

export async function verify(input) {
  debugUtils.logInfo("[verification.service.js] >> verify");
  const startTime = Date.now();
  try {
    // 1. Validate and default input
    const validationResult = validateAndDefault(input);
    if (!validationResult.success) return validationResult;
    const { validatedInput } = validationResult;
    const { address, constructorArguments, compilerVersion } = validatedInput;

    // 2. Get deployed bytecode
    const deployedBytecodeResult = await getDeployedBytecode(address);
    if (!deployedBytecodeResult.success) return deployedBytecodeResult;
    const { bytecode: deployedBytecode } = deployedBytecodeResult;

    // 3. Prepare solc input
    const solcInputResult = prepareSolcInput(validatedInput);
    if (!solcInputResult.success) return solcInputResult;
    const { solcInput, mainContractName, contractPath } = solcInputResult;

    // 4. Compile
    const compileResult = compile(solcInput);
    if (!compileResult.success) return compileResult;
    const { compiledOutput } = compileResult;

    // 5. Extract artifact
    const artifactResult = extractContractArtifact(compiledOutput, contractPath, mainContractName);
    if (!artifactResult.success) return artifactResult;
    const { contractCompiled } = artifactResult;

    // 6. Compare bytecode
    const runtimeBytecode = "0x" + contractCompiled.evm.deployedBytecode.object;
    const comparisonResult = compareBytecodes(deployedBytecode, runtimeBytecode);
    if (!comparisonResult.success) return comparisonResult; // For try-catch errors during comparison

    if (!comparisonResult.isIdentical) {
        return {
            success: false,
            message: comparisonResult.message,
            verificationTime: Date.now() - startTime,
            debugInfo: comparisonResult.debugInfo,
        };
    }

    // 7. Save result
    const saveResult = await saveVerificationResult({
        address,
        mainContractName,
        compilerVersion,
        contractCompiled,
        solcInput,
        constructorArguments,
    });

    if (!saveResult.success) return saveResult;

    const totalTime = Date.now() - startTime;
    debugUtils.logSuccess(`Total waktu verifikasi: ${totalTime}ms`);

    return {
      success: true,
      message: "Kontrak berhasil diverifikasi!",
      contract: saveResult.contract,
      verificationTime: totalTime,
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    debugUtils.logError("Unexpected error during verification process", error);
    console.error("Stack trace:", error.stack);
    return {
      success: false,
      message: `Terjadi kesalahan tidak terduga: ${error.message}`,
      verificationTime: totalTime,
      error: error.name,
    };
  }
}