// File: frontend/components/layout/Footer.js

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-800 border-t border-gray-700 mt-auto">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="text-center text-sm text-gray-400">
          <p>&copy; {currentYear} QrypScan. All Rights Reserved.</p>
          <p className="mt-1">A simple Block Explorer Interface.</p>
        </div>
      </div>
    </footer>
  );
}