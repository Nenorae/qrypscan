import { ethers } from "ethers";

/**
 * Decodes proxy administration transactions to identify which proxy was affected.
 */
export class ProxyAdminTransactionDecoder {
    constructor(provider, config = {}) {
        this.provider = provider;
        this.cache = new Map();
        this.cacheSize = config.cacheSize || 1000;
        this.retryAttempts = config.retryAttempts || 3;
        this.retryDelay = config.retryDelay || 1000;

        this.proxyAdminInterface = new ethers.Interface([
            "function upgrade(address proxy, address implementation)",
            "function upgradeAndCall(address proxy, address implementation, bytes data)",
            "function changeProxyAdmin(address proxy, address newAdmin)",
            "function transferOwnership(address newOwner)",
        ]);
        console.log("[PROXY-DECODER] Initialized with provider.");
    }

    async decodeUpgradeTransaction(transactionHash) {
        const cacheKey = `${transactionHash}_upgrade`;
        if (this.cache.has(cacheKey)) {
            console.log(`[PROXY-DECODER] Cache HIT for tx: ${transactionHash}`);
            return this.cache.get(cacheKey);
        }
        console.log(`[PROXY-DECODER] Cache MISS for tx: ${transactionHash}. Fetching...`);

        const transaction = await this.retryWithBackoff(() => this.provider.getTransaction(transactionHash));
        if (!transaction) {
            throw new Error(`Transaction ${transactionHash} not found`);
        }

        const decodedData = this.decodeTransactionData(transaction);
        
        const result = {
            transactionHash,
            from: transaction.from,
            to: transaction.to,
            ...decodedData,
        };

        this.setCacheWithLimit(cacheKey, result);
        return result;
    }

    decodeTransactionData(transaction) {
        const { data } = transaction;
        if (!data || data === "0x") {
            return { functionName: "unknown", error: "No transaction data" };
        }

        const functionSelector = data.slice(0, 10);
        console.log(`[PROXY-DECODER] Decoding tx data with selector: ${functionSelector}`);
        
        try {
            const decodedCall = this.proxyAdminInterface.parseTransaction({ data });
            if (!decodedCall) {
                 // This is expected when scanning all transactions, so we don't log a warning.
                 return { functionName: "unknown", functionSelector, error: "Unknown function selector" };
            }
            console.log(`[PROXY-DECODER] Matched function: ${decodedCall.name}`);

            const args = this.extractFunctionArguments(decodedCall.name, decodedCall.args);

            return {
                functionName: decodedCall.name,
                signature: decodedCall.signature,
                ...args
            };
        } catch (error) {
            // This error is also expected if the data doesn't match any known function.
            // We can silently ignore it.
            return { functionName: "unknown", functionSelector, error: "Could not decode function" };
        }
    }
    
    extractFunctionArguments(functionName, args) {
        console.log(`[PROXY-DECODER] Extracting arguments for function "${functionName}"`);
        let extractedArgs = {};
        switch (functionName) {
            case "upgrade":
            case "upgradeAndCall":
                extractedArgs = {
                    proxyAddress: args[0],
                    newImplementation: args[1],
                    callData: functionName === 'upgradeAndCall' ? args[2] : null,
                };
                break;
            case "changeProxyAdmin":
                 extractedArgs = {
                    proxyAddress: args[0],
                    newAdmin: args[1],
                };
                break;
            case "transferOwnership":
                extractedArgs = {
                    newOwner: args[0],
                };
                break;
            default:
                extractedArgs = { rawArgs: args.map(arg => arg.toString()) };
                break;
        }
        console.log('[PROXY-DECODER] Extracted arguments:', extractedArgs);
        return extractedArgs;
    }

    setCacheWithLimit(key, value) {
        if (this.cache.size >= this.cacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    async retryWithBackoff(operation) {
        for (let i = 0; i < this.retryAttempts; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === this.retryAttempts - 1) throw error;
                const delay = this.retryDelay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}