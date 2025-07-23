
// frontend/components/ContractInteractor.js
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// Helper untuk mendapatkan provider dan signer
async function getEthers() {
    if (typeof window.ethereum === 'undefined') {
        alert("Please install MetaMask!");
        return null;
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return { provider, signer };
}

// Komponen untuk satu fungsi
function Function({ func, contract }) {
    const [inputs, setInputs] = useState({});
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleInputChange = (paramName, value) => {
        setInputs(prev => ({ ...prev, [paramName]: value }));
    };

    const executeFunction = async () => {
        setIsLoading(true);
        setResult(null);
        setError(null);

        try {
            const args = func.inputs.map(input => inputs[input.name] || '');
            let res;
            if (func.stateMutability === 'view' || func.stateMutability === 'pure') {
                res = await contract[func.name](...args);
            } else {
                // Ini adalah fungsi write
                const ethersData = await getEthers();
                if (!ethersData) return;
                const connectedContract = new ethers.Contract(contract.address, contract.interface.fragments, ethersData.signer);
                
                const txOptions = {};
                if (func.payable) {
                    const payableValue = inputs['payableValue'];
                    if (!payableValue) throw new Error("Value is required for payable function");
                    txOptions.value = ethers.parseEther(payableValue);
                }

                const tx = await connectedContract[func.name](...args, txOptions);
                setResult(`Transaction sent! Hash: ${tx.hash}`);
                await tx.wait();
                setResult(`Transaction confirmed! Hash: ${tx.hash}`);
            }

            if (typeof res !== 'string') {
                 setResult(JSON.stringify(res, null, 2));
            } else {
                setResult(res);
            }

        } catch (e) {
            setError(e.reason || e.message || "An error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-800 dark:border-gray-700 mb-4">
            <h4 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-100">{func.name}</h4>
            <div className="space-y-3">
                {func.inputs.map((input, index) => (
                    <div key={index}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{input.name} ({input.type})</label>
                        <input
                            type="text"
                            onChange={(e) => handleInputChange(input.name, e.target.value)}
                            placeholder={`${input.name} (${input.type})`}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
                        />
                    </div>
                ))}
                {func.payable && (
                     <div >
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Value (ETH)</label>
                        <input
                            type="text"
                            onChange={(e) => handleInputChange('payableValue', e.target.value)}
                            placeholder="Value (ETH)"
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
                        />
                    </div>
                )}
            </div>
            <button
                onClick={executeFunction}
                disabled={isLoading}
                className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
                {isLoading ? 'Executing...' : (func.stateMutability === 'view' || func.stateMutability === 'pure' ? 'Query' : 'Write')}
            </button>
            {result && <pre className="mt-2 p-2 bg-green-100 text-green-800 rounded-md overflow-auto dark:bg-green-900 dark:text-green-100"><code>{result}</code></pre>}
            {error && <pre className="mt-2 p-2 bg-red-100 text-red-800 rounded-md overflow-auto dark:bg-red-900 dark:text-red-100"><code>{error}</code></pre>}
        </div>
    );
}


export default function ContractInteractor({ abi, address, type }) {
    const [contract, setContract] = useState(null);
    const [account, setAccount] = useState(null);

    useEffect(() => {
        const setupContract = async () => {
            const provider = new ethers.JsonRpcProvider('http://localhost:8545'); // Read-only provider
            const contractInstance = new ethers.Contract(address, abi, provider);
            setContract(contractInstance);
        };
        setupContract();
    }, [address, abi]);

    const connectWallet = async () => {
        const ethersData = await getEthers();
        if (ethersData) {
            setAccount(await ethersData.signer.getAddress());
        }
    };

    if (!contract) {
        return <div>Loading contract...</div>;
    }

    const functions = contract.interface.fragments.filter(frag => frag.type === 'function');
    const readFunctions = functions.filter(func => func.stateMutability === 'view' || func.stateMutability === 'pure');
    const writeFunctions = functions.filter(func => func.stateMutability !== 'view' && func.stateMutability !== 'pure');

    const functionsToDisplay = type === 'read' ? readFunctions : writeFunctions;

    return (
        <div>
            {type === 'write' && !account && (
                <div className="mb-4 text-center">
                    <button onClick={connectWallet} className="py-2 px-4 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
                        Connect Wallet to Write
                    </button>
                </div>
            )}
            {type === 'write' && account && (
                <div className="mb-4 p-2 text-center bg-gray-100 rounded-md dark:bg-gray-700">
                    <p className="text-sm text-gray-800 dark:text-gray-200">Connected as: <span className="font-mono">{account}</span></p>
                </div>
            )}

            {functionsToDisplay.length === 0 && <p>No {type} functions found.</p>}
            
            {functionsToDisplay.map((func, index) => (
                <Function key={index} func={func} contract={contract} />
            ))}
        </div>
    );
}
