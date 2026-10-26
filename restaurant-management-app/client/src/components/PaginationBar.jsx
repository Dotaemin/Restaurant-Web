import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PaginationBar({
  currentPage,
  totalPages,
  totalCount,
  itemLabel = 'món',
  onPageChange,
}) {
  const [isJumpOpen, setIsJumpOpen] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState('');

  if (totalPages <= 1) return null;

  const handleJumpSubmit = () => {
    const parsed = parseInt(jumpPageInput.trim(), 10);
    // Check if the page number is within range 1 -> <the last page>, if not, Enter does nothing (blocked)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      onPageChange(parsed);
      setIsJumpOpen(false);
      setJumpPageInput('');
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200">
      <div className="text-xs sm:text-sm text-gray-600">
        Trang <span className="font-bold text-gray-900">{currentPage}</span> /{' '}
        <span className="font-bold text-gray-900">{totalPages}</span> (Tổng số: {totalCount} {itemLabel})
      </div>

      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {/* Trước Button */}
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Trước</span>
        </button>

        {/* Page numbers: all if <= 5, or windowed range e.g. 1 2 3 ... 50 if > 5 */}
        {totalPages <= 5 ? (
          Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                currentPage === p
                  ? 'bg-[#ba1414] text-white shadow-xs'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))
        ) : (
          (() => {
            const startPage = Math.max(1, Math.min(currentPage, totalPages - 3));
            const windowPages = [startPage, startPage + 1, startPage + 2];
            const showEllipsis = startPage + 2 < totalPages - 1;
            const trailingPages = showEllipsis
              ? [totalPages]
              : Array.from({ length: totalPages - (startPage + 2) }, (_, i) => startPage + 3 + i);

            return (
              <>
                {windowPages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange(p)}
                    className={`w-8 h-8 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                      currentPage === p
                        ? 'bg-[#ba1414] text-white shadow-xs'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}

                {/* Ellipsis button or custom page jump input */}
                {showEllipsis &&
                  (isJumpOpen ? (
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      autoFocus
                      value={jumpPageInput}
                      onChange={(e) => setJumpPageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleJumpSubmit();
                        } else if (e.key === 'Escape') {
                          setIsJumpOpen(false);
                          setJumpPageInput('');
                        }
                      }}
                      onBlur={() => {
                        if (!jumpPageInput.trim()) {
                          setIsJumpOpen(false);
                        }
                      }}
                      placeholder="#"
                      className="w-12 h-8 px-1 text-center rounded-lg border-2 border-[#ba1414] bg-white text-xs sm:text-sm font-bold text-gray-900 focus:outline-none shadow-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsJumpOpen(true);
                        setJumpPageInput('');
                      }}
                      title="Nhập số trang để chuyển nhanh"
                      className="w-8 h-8 rounded-lg text-xs sm:text-sm font-bold transition-colors bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-[#ba1414] hover:text-[#ba1414] cursor-pointer flex items-center justify-center shadow-2xs"
                    >
                      ...
                    </button>
                  ))}

                {trailingPages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange(p)}
                    className={`w-8 h-8 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                      currentPage === p
                        ? 'bg-[#ba1414] text-white shadow-xs'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </>
            );
          })()
        )}

        {/* Sau Button */}
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <span>Sau</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
