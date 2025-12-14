// frontend/components/SourceCodeViewer.js

import React from 'react';

const SourceCodeViewer = ({ sourceFiles }) => {
  if (!sourceFiles || sourceFiles.length === 0) {
    return <p>Source code not available.</p>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
      <div className="p-4 border-b dark:border-gray-700">
        <h3 className="text-lg font-semibold">Source Code</h3>
      </div>
      {sourceFiles.map((file, index) => (
        <div key={index} className="p-4">
          <p className="font-mono text-sm text-gray-600 dark:text-gray-400 mb-2">{file.filePath}</p>
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-md overflow-x-auto text-sm">
            <code>{file.sourceCode}</code>
          </pre>
        </div>
      ))}
    </div>
  );
};

export default SourceCodeViewer;
