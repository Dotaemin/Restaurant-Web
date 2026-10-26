import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export default function BadRequestPage({ cause: propCause }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cause = propCause || location.state?.cause || 'Invalid request parameters or server processing error.';

  return (
    <div className="relative max-w-3xl mx-auto py-8">
      {/* Top Left Redirect Button to Previous Page */}
      <div className="mb-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Previous Page</span>
        </button>
      </div>

      {/* 400 Bad Request Card */}
      <div className="bg-white rounded-2xl border-2 border-[#ba1414] p-8 sm:p-12 text-center shadow-lg">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
          <AlertTriangle className="w-12 h-12" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#ba1414] tracking-tight mb-3">
          Bad Request
        </h1>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-6 mb-6 text-left max-w-lg mx-auto">
          <p className="text-xs uppercase font-bold text-red-600 tracking-wider mb-1">
            Cause of Error:
          </p>
          <p className="text-sm sm:text-base text-gray-800 font-medium break-words">
            {cause}
          </p>
        </div>

        <p className="text-sm text-gray-500 max-w-md mx-auto mb-8">
          Please check the submitted details or return to the previous page to try again.
        </p>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Previous Page</span>
        </button>
      </div>
    </div>
  );
}
