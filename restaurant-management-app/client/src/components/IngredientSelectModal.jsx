import React, { useState, useEffect, useMemo } from 'react';
import { Utensils, X } from 'lucide-react';

export default function IngredientSelectModal({
  isOpen,
  onClose,
  onSelect,
  selectedIngredientIds = [],
  ingredients = [],
  isForm = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSelectedIds, setTempSelectedIds] = useState([]);
  const [initialIds, setInitialIds] = useState([]);

  // Initialize and synchronize state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      const normalized = (selectedIngredientIds || []).map((id) =>
        typeof id === 'number' ? id : parseInt(id, 10)
      );
      setTempSelectedIds(normalized);
      setInitialIds(normalized);
    }
  }, [isOpen, selectedIngredientIds]);

  // Dirty check: disabled until the chosen ingredients are different from what was chosen before
  const isChanged = useMemo(() => {
    if (tempSelectedIds.length !== initialIds.length) return true;
    const initialSet = new Set(initialIds);
    return tempSelectedIds.some((id) => !initialSet.has(id));
  }, [tempSelectedIds, initialIds]);

  if (!isOpen) return null;

  const filteredIngredients = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = (ingId) => {
    setTempSelectedIds((prev) =>
      prev.includes(ingId) ? prev.filter((id) => id !== ingId) : [...prev, ingId]
    );
  };

  const handleClearAll = () => {
    setTempSelectedIds([]);
  };

  const handleConfirm = () => {
    if (!isChanged) return;
    onSelect(tempSelectedIds);
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
        className="bg-white rounded-2xl border-2 border-[#ba1414] p-5 sm:p-6 shadow-2xl max-w-lg w-full max-h-[85%] flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-[#ba1414]" />
            <h3 className="font-bold text-lg text-[#ba1414]">Select Ingredients</h3>
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
            placeholder="Enter ingredient name..."
            autoFocus
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] bg-white placeholder-gray-400"
          />
        </div>

        {/* Thin divider line */}
        <div className="border-b border-gray-200 my-3" />

        {/* Double Column Scrollable Checklist */}
        <div className="flex-1 overflow-y-auto max-h-64 pr-1 min-h-[160px]">
          {filteredIngredients.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-10">
              No ingredients found matching "{searchTerm}".
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredIngredients.map((ing) => {
                const checked = tempSelectedIds.includes(ing.id);
                return (
                  <label
                    key={ing.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                      checked
                        ? 'bg-red-50 border-[#ba1414] text-[#ba1414] shadow-2xs font-semibold'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(ing.id)}
                      className="w-4 h-4 rounded text-[#ba1414] focus:ring-[#ba1414] accent-[#ba1414] cursor-pointer"
                    />
                    <span className="truncate">{ing.name} ({ing.unit})</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-200 mt-3 flex-wrap">
          {/* Bottom Left: Clear selection */}
          <button
            type="button"
            onClick={handleClearAll}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
          >
            Clear selection
          </button>

          {/* Bottom Right: Cancel & Select Ingredients */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isChanged}
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#ba1414] hover:bg-red-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            >
              Select Ingredients
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
