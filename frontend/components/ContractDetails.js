// frontend/components/ContractDetails.js

import { useState } from 'react';
import { gql, useMutation } from '@apollo/client';
import Link from 'next/link';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneDark, atomOneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { useTheme } from '../context/ThemeContext';
import { ethers } from 'ethers';
import { useRouter } from 'next/router';
import ContractInteractor from './ContractInteractor';

const VERIFY_PROXY_MUTATION = gql`
  mutation VerifyProxy($input: VerifyProxyInput!) {
    verifyProxy(input: $input) {
      success
      message
      contract {
        address
        isProxy
        implementationAddress
      }
    }
  }
`;

function ProxyInfoBanner({ implementationAddress }) {
    if (!implementationAddress) return null;
    return (
        <div className="p-4 mb-4 border rounded-md bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-100">
            <h2 className="text-lg font-bold">📄 This is a Proxy Contract</h2>
            <p className="mt-1">
                The logic for this contract is handled by the implementation at:
                <Link href={`/contract/${implementationAddress}`} className="font-mono text-blue-600 hover:underline ml-2 dark:text-blue-400">
                    {implementationAddress}
                </Link>
            </p>
        </div>
    );
}

function SourceCodeViewer({ sourceFiles }) {
    const [activeFile, setActiveFile] = useState(0);
    const { theme } = useTheme();

    if (!sourceFiles || sourceFiles.length === 0) {
        return <p>Kode sumber tidak tersedia.</p>;
    }

    const codeTheme = theme === 'dark' ? atomOneDark : atomOneLight;
    const customHighlighterStyle = {
        borderRadius: "0.375rem",
        padding: "1rem",
        backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6', // Tailwind's gray-800 and gray-100
    };

    return (
        <div>
            <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto whitespace-nowrap hide-scrollbar">
                {sourceFiles.map((file, index) => (
                    <button
                        key={index}
                        onClick={() => setActiveFile(index)}
                        className={`px-4 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none 
                            ${activeFile === index 
                                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`
                        }
                    >
                        {file.filePath}
                    </button>
                ))}
            </div>
            <div className="pt-4">
                <SyntaxHighlighter language="solidity" style={codeTheme} customStyle={customHighlighterStyle}>
                    {sourceFiles[activeFile].sourceCode}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}

export function VerifiedInfo({ contract }) {
    const [activeTab, setActiveTab] = useState('contract');

    const tabs = [{ id: 'contract', label: 'Contract' }];
    if (contract.abi) {
        tabs.push({ id: 'read', label: contract.isProxy ? 'Read as Proxy' : 'Read Contract' });
        tabs.push({ id: 'write', label: contract.isProxy ? 'Write as Proxy' : 'Write Contract' });
    }

    return (
      <div className="space-y-4">
        <div className="p-4 border rounded-md bg-green-50 border-green-200 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-100">
          <h2 className="text-lg font-bold">✅ Kode Sumber Kontrak Terverifikasi</h2>
        </div>

        <ProxyInfoBanner implementationAddress={contract.implementationAddress} />

        <div className="flex border-b border-gray-200 dark:border-gray-700">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none 
                        ${activeTab === tab.id 
                            ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`
                        }
                >
                    {tab.label}
                </button>
            ))}
        </div>

        <div className="pt-4">
            {activeTab === 'contract' && (
                <div className="space-y-4">
                    <SourceCodeViewer sourceFiles={contract.sourceFiles} />
                </div>
            )}
            {activeTab === 'read' && (
                <ContractInteractor abi={contract.abi} address={contract.address} type="read" />
            )}
            {activeTab === 'write' && (
                <ContractInteractor abi={contract.abi} address={contract.address} type="write" />
            )}
        </div>
      </div>
    );
}

export function UnverifiedInfo({ contract }) {
    const [activeTab, setActiveTab] = useState('verify');

    return (
        <div className="space-y-4">
            <div className="p-4 border rounded-md bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-100">
                <h2 className="text-lg font-bold">⚠️ Kontrak Ini Belum Terverifikasi</h2>
                <p className="text-yellow-700 mt-1 dark:text-yellow-100">
                    Pilih metode verifikasi di bawah ini.
                </p>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button onClick={() => setActiveTab('verify')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'verify' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}>
                    Verify Contract
                </button>
                <button onClick={() => setActiveTab('proxy')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'proxy' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}>
                    Verify as Proxy
                </button>
            </div>

            {activeTab === 'verify' && (
                <>
                    <div className="p-4 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-700">
                        <h3 className="font-bold mb-2 text-gray-800 dark:text-gray-100">Informasi Blockchain</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            <strong>Alamat Pembuat:</strong>
                            <Link href={`/address/${contract.creatorAddress}`} className="text-blue-600 hover:underline ml-2 dark:text-blue-400">
                                {contract.creatorAddress}
                            </Link>
                        </p>
                        <p className="text-gray-600 dark:text-gray-300">
                            <strong>Hash Transaksi Pembuatan:</strong>
                             <Link href={`/tx/${contract.creationTxHash}`} className="text-blue-600 hover:underline ml-2 dark:text-blue-400">
                                {contract.creationTxHash}
                            </Link>
                        </p>
                    </div>
                    <VerificationInstructions address={contract.address} />
                </>
            )}

            {activeTab === 'proxy' && <ProxyVerificationForm proxyAddress={contract.address} />}
        </div>
    );
}

function ProxyVerificationForm({ proxyAddress }) {
    const [implementationAddress, setImplementationAddress] = useState('');
    const [verifyProxy, { data, loading, error }] = useMutation(VERIFY_PROXY_MUTATION);
    const router = useRouter();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!ethers.isAddress(implementationAddress)) {
            alert("Invalid implementation address.");
            return;
        }
        const result = await verifyProxy({
            variables: {
                input: {
                    proxyAddress,
                    implementationAddress,
                },
            },
        });

        if (result.data?.verifyProxy?.success) {
            router.reload();
        }
    };

    return (
        <div className="p-4 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-700">
            <h3 className="font-bold mb-2 text-gray-800 dark:text-gray-100">Verify Proxy Contract</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Provide the address of the implementation contract. The implementation must be verified first.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="proxy-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Proxy Address</label>
                    <input
                        id="proxy-address"
                        type="text"
                        value={proxyAddress}
                        readOnly
                        className="mt-1 block w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm focus:outline-none sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                </div>
                <div>
                    <label htmlFor="implementation-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Implementation Address</label>
                    <input
                        id="implementation-address"
                        type="text"
                        value={implementationAddress}
                        onChange={(e) => setImplementationAddress(e.target.value)}
                        placeholder="0x..."
                        required
                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-900 dark:border-gray-600"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    {loading ? 'Verifying...' : 'Verify Proxy'}
                </button>
            </form>
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Error: {error.message}</p>}
            {data && !data.verifyProxy.success && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Verification failed: {data.verifyProxy.message}</p>}
        </div>
    );
}

function VerificationInstructions({ address }) {
    const hardhatConfigSnippet = `
// In hardhat.config.js
...
networks: {
  besu: {
    url: 'http://localhost:8545', // URL RPC Node Anda
  },
},
etherscan: {
  apiKey: {
    besu: 'any-string-will-do',
  },
  customChains: [
    {
      network: 'besu',
      chainId: 1337, // Sesuaikan dengan chainId jaringan Anda
      urls: {
        apiURL: 'http://localhost:4000/api', // URL API verifikasi QrypScan Anda
        browserURL: 'http://localhost:3000', // URL frontend QrypScan Anda
      },
    },
  ],
},
...
  `;

    const verifyCommand = `npx hardhat verify --network besu ${address}`;

    return (
        <div className="space-y-6 p-4 border rounded-md bg-gray-50 border-gray-200 mt-6 dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Verifikasi Kontrak Anda</h2>
            <p className="text-gray-700 dark:text-gray-300">
                Gunakan plugin <code>hardhat-verify</code> untuk mempublikasikan kode sumber dan mengaktifkan semua fitur di QrypScan.
            </p>
            
            <div>
                <h3 className="font-bold mb-2 text-gray-800 dark:text-gray-100">1. Konfigurasi <code>hardhat.config.js</code></h3>
                <pre className="p-3 bg-gray-100 text-gray-900 rounded-md overflow-auto text-sm dark:bg-gray-900 dark:text-gray-100">
                    <code>{hardhatConfigSnippet.trim()}</code>
                </pre>
            </div>

            <div>
                <h3 className="font-bold mb-2 text-gray-800 dark:text-gray-100">2. Jalankan Perintah Verifikasi</h3>
                <pre className="p-3 bg-gray-100 text-gray-900 rounded-md overflow-auto text-sm dark:bg-gray-900 dark:text-gray-100">
                    <code>{verifyCommand}</code>
                </pre>
            </div>
             <p className="text-gray-600 pt-4 text-sm dark:text-gray-400">
                Setelah menjalankan perintah di atas, muat ulang halaman ini untuk melihat hasilnya.
            </p>
        </div>
    );
}
