import React from 'react';

/**
 * BigCutlery Component
 * Displays a big knife and a big fork colored #f5f5f5 for loading & transition animations
 */
export default function BigCutlery({ className = '', spinning = true }) {
  return (
    <div className={`relative flex items-center justify-center gap-4 ${spinning ? 'animate-spin' : ''} ${className}`}>
      {/* Big Knife */}
      <svg
        viewBox="0 0 24 24"
        fill="#f5f5f5"
        className="w-20 h-20 sm:w-28 sm:h-28 drop-shadow-xl transform -rotate-12"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M19.78 2.22c-.39-.39-1.02-.39-1.41 0l-9.19 9.19c-.39.39-.39 1.02 0 1.41l2.12 2.12c.39.39 1.02.39 1.41 0l9.19-9.19c.39-.39.39-1.02 0-1.41l-2.12-2.12zm-8.83 13.08l-5.66 5.66c-.39.39-1.02.39-1.41 0l-1.41-1.41c-.39-.39-.39-1.02 0-1.41l5.66-5.66 2.82 2.82z" />
      </svg>

      {/* Big Fork */}
      <svg
        viewBox="0 0 24 24"
        fill="#f5f5f5"
        className="w-20 h-20 sm:w-28 sm:h-28 drop-shadow-xl transform rotate-12"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm8-7v20h2V2h-2z" />
      </svg>
    </div>
  );
}
