import Link from 'next/link';
import { useTheme } from '../../context/ThemeContext';
import { useEffect, useState } from 'react';

export default function Header() {
    const { theme, toggleTheme, mounted } = useTheme();
    const [showButton, setShowButton] = useState(false);

    useEffect(() => {
        setShowButton(mounted);
    }, [mounted]);

    return (
        <nav className="bg-gray-800 shadow-md mb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                             <Link href="/" className="text-2xl font-bold text-gray-100">QrypScan</Link>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center space-x-4">
                        <Link href="/" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Home</Link>
                        <Link href="/blocks" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Blocks</Link>
                        <Link href="/transactions" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Transactions</Link>
                        <Link href="/contracts" className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Contracts</Link>
                        {showButton && (
                            <button
                                onClick={toggleTheme}
                                className="p-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                            >
                                {theme === 'dark' ? '☀️' : '🌙'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}