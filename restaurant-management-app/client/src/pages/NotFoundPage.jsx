import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function NotFoundPage({ message }) {
  const location = useLocation();
  const errorMessage = message || location.state?.error || `The requested page "${location.pathname}" could not be found.`;

  return (
    <div className="relative max-w-3xl mx-auto py-8">
      {/* Top Left Redirect Button to /dishes */}
      <div className="mb-8">
        <Link
          to="/dishes"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </Link>
      </div>

      {/* 404 Error Card */}
      <div className="bg-white rounded-2xl border-2 border-[#ba1414] p-8 sm:p-12 text-center shadow-lg">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center text-[#ba1414]">
          <AlertCircle className="w-12 h-12" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-[#ba1414] tracking-tight mb-3">
          404 - Not Found
        </h1>

        <p className="text-lg text-gray-700 font-medium mb-6">
          {errorMessage}
        </p>

        <p className="text-sm text-gray-500 max-w-md mx-auto mb-8">
          The resource you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>

        <Link
          to="/dishes"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-md"
        >
          <span>Explore Delicious Dishes</span>
        </Link>
      </div>
    </div>
  );
}
