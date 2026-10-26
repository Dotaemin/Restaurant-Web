import React, { useState, useEffect } from 'react';
import { Utensils, X, Check } from 'lucide-react';

export default function ChefSelectModal({
  isOpen,
  onClose,
  onSelect,
  selectedChefId,
  chefs = [],
  isForm = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSelectedId, setTempSelectedId] = useState(null);

  // Sync state whenever modal opens or initial selection changes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setTempSelectedId(selectedChefId ? (typeof selectedChefId === 'number' ? selectedChefId : parseInt(selectedChefId, 10)) : null);
    }
  }, [isOpen, selectedChefId]);

  if (!isOpen) return null;

  const filteredChefs = chefs.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleChef = (chefId) => {
    setTempSelectedId((prev) => (prev === chefId ? null : chefId));
  };

  const handleConfirm = () => {
    if (!tempSelectedId) return;
    onSelect(tempSelectedId);
    onClose();
  };

  // Overlay container: confined to form window when isForm, or full viewport below top bar when !isForm
  const overlayClasses = isForm
    ? 'absolute inset-0 z-30 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4'
    : 'fixed inset-0 top-16 z-30 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4';

  return (
    <div
      className={overlayClasses}
      onClick={(e) => {
        // Clicking darkened area outside the popup closes popup and cancels selection
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-2xl border-2 border-[#ba1414] p-5 sm:p-6 shadow-2xl max-w-md w-full max-h-[85%] flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-[#ba1414]" />
            <h3 className="font-bold text-lg text-[#ba1414]">Select Chef</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Field */}
        <div className="pt-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter chef name..."
            autoFocus
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] bg-white placeholder-gray-400"
          />
        </div>

        {/* Thin divider line */}
        <div className="border-b border-gray-200 my-3" />

        {/* Scrollable Single Column Chef List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 max-h-60 pr-1 min-h-[140px]">
          {filteredChefs.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-8">
              No chefs found matching "{searchTerm}".
            </p>
          ) : (
            filteredChefs.map((chef) => {
              const isSelected = tempSelectedId === chef.id;
              return (
                <button
                  key={chef.id}
                  type="button"
                  onClick={() => handleToggleChef(chef.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between border cursor-pointer ${
                    isSelected
                      ? 'bg-red-50 border-[#ba1414] text-[#ba1414] font-semibold shadow-xs'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-gray-900 truncate">{chef.name}</div>
                    {chef.specialty && (
                      <div className="text-xs text-gray-500 truncate">{chef.specialty}</div>
                    )}
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#ba1414] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Bottom Right Corner: Cancel & Select Chef */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!tempSelectedId}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#ba1414] hover:bg-red-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
          >
            Select Chef
          </button>
        </div>
      </div>
    </div>
  );
}
