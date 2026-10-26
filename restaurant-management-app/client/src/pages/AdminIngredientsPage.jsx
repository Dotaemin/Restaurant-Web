import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/client';
import LoadHandler from '../components/LoadHandler';
import { Plus, Edit2, Trash2, AlertCircle, CheckCircle2, Carrot, Filter, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

const ALLOWED_UNITS = ['kg', 'g', 'ml', 'l', 'tbsp', 'pcs', 'bunches'];

export default function AdminIngredientsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  // Server-Side Pagination state (PageSize = 20)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalIngredients, setTotalIngredients] = useState(0);

  // Client-Side Filter & Sort State (Admin pages ONLY)
  const [filterUnit, setFilterUnit] = useState('All'); // 'All' | 'kg' | 'g' | 'ml' | 'l' | 'tbsp' | 'pcs' | 'bunches'
  const [sortOption, setSortOption] = useState('name-asc'); // 'name-asc' | 'name-desc'

  // Form State (Add / Edit)
  const [showForm, setShowForm] = useState(false);
  const [editingIngId, setEditingIngId] = useState(null);
  const [formData, setFormData] = useState({ name: '', unit: 'g' });
  const [fieldErrors, setFieldErrors] = useState({});

  const loadIngredients = async (pageToLoad = currentPage) => {
    setLoading(true);
    setErrorBanner('');
    const [field, dir] = sortOption.split('-');
    const res = await api.getIngredients({
      page: pageToLoad,
      pageSize: 20,
      unit: filterUnit,
      sortBy: field,
      sortOrder: dir
    });
    if (res.ok) {
      setIngredients(res.data?.items || []);
      setTotalIngredients(res.data?.meta?.total || 0);
    } else {
      setErrorBanner(res.error?.message || 'Failed to load ingredients.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadIngredients(currentPage);
  }, [currentPage, filterUnit, sortOption]);

  // Client-Side Filter & Sort computation (per spec: "Filter and sort must be client side")
  const filteredAndSortedIngredients = useMemo(() => {
    let result = [...ingredients];

    if (filterUnit !== 'All') {
      result = result.filter((i) => i.unit.toLowerCase() === filterUnit.toLowerCase());
    }

    const [field, dir] = sortOption.split('-');
    result.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [ingredients, filterUnit, sortOption]);

  const totalPages = Math.ceil(totalIngredients / 20) || 1;

  const handleResetFilters = () => {
    setFilterUnit('All');
    setSortOption('name-asc');
    setCurrentPage(1);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const startEdit = (ing) => {
    setEditingIngId(ing.id);
    setFormData({ name: ing.name, unit: ing.unit });
    setFieldErrors({});
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingIngId(null);
    setFormData({ name: '', unit: 'g' });
    setFieldErrors({});
  };

  // Pre-flight Client-Side Validation
  const validateIngredientForm = (data) => {
    const errors = {};
    if (!data.name || data.name.trim().length === 0) {
      errors.name = 'Ingredient name is required and cannot be left blank.';
    }
    if (!data.unit || !ALLOWED_UNITS.includes(data.unit)) {
      errors.unit = `Unit must be one of: ${ALLOWED_UNITS.join(', ')}.`;
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setErrorBanner('');

    // Run client-side validation first
    const clientErrors = validateIngredientForm(formData);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setErrorBanner('Please correct the highlighted form errors before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitMessage(editingIngId ? 'Updating ingredient...' : 'Creating new ingredient...');

    let res;
    if (editingIngId) {
      res = await api.updateIngredient(editingIngId, formData);
    } else {
      res = await api.createIngredient(formData);
    }

    setSubmitting(false);

    if (res.ok) {
      setSuccessBanner(
        editingIngId
          ? `Ingredient "${res.data.name}" was successfully updated.`
          : `Ingredient "${res.data.name}" was successfully added!`
      );
      cancelForm();
      loadIngredients();
    } else {
      if (res.error?.code === 'VALIDATION_FAILED' && res.error.fields) {
        setFieldErrors(res.error.fields);
        setErrorBanner(res.error.message || 'Please correct the highlighted form errors.');
      } else {
        setErrorBanner(res.error?.message || 'Action failed.');
      }
    }
  };

  // Direct deletion without confirmation alert, immediately reloading data
  const handleDelete = async (ing) => {
    setSubmitting(true);
    setSubmitMessage(`Deleting ingredient "${ing.name}" and associated dishes...`);
    const res = await api.deleteIngredient(ing.id);
    setSubmitting(false);

    if (res.ok) {
      setSuccessBanner(res.data?.message || `Ingredient "${ing.name}" was deleted successfully.`);
      loadIngredients();
    } else {
      setErrorBanner(res.error?.message || 'Failed to delete ingredient.');
    }
  };

  return (
    <div className="space-y-6">
      {/* LoadHandler overlay that disables all buttons during load/submit */}
      <LoadHandler loading={loading || submitting} message={submitMessage || 'Loading ingredients...'} />

      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#ba1414]">
            Manage Ingredients
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Track kitchen pantry ingredients, standardized units, and dish usage.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (showForm && !editingIngId) {
              cancelForm();
            } else {
              setEditingIngId(null);
              setFormData({ name: '', unit: 'g' });
              setFieldErrors({});
              setShowForm(true);
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm && !editingIngId ? 'Close Form' : 'Add New Ingredient'}</span>
        </button>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorBanner && (
        <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl text-[#ba1414] text-sm font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[#ba1414]" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner('')}
            className="text-red-700 hover:text-red-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Add / Edit Ingredient Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-[#ba1414] p-6 shadow-md animate-in fade-in duration-200">
          <h2 className="text-xl font-bold text-[#ba1414] mb-4 flex items-center gap-2">
            <Carrot className="w-5 h-5" />
            <span>{editingIngId ? `Edit Ingredient: ${formData.name}` : 'Add New Ingredient'}</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Ingredient Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Rosemary"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] ${
                    fieldErrors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Unit of Measurement *
                </label>
                <select
                  name="unit"
                  value={formData.unit}
                  onChange={handleInputChange}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] bg-white ${
                    fieldErrors.unit ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  {ALLOWED_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                {fieldErrors.unit && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.unit}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-md"
              >
                {editingIngId ? 'Update Ingredient' : 'Save Ingredient'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Client-Side Filter & Sort Controls Panel (Admin Only) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-[#ba1414]" />
            <span>Bộ lọc & Sắp xếp (Client-Side)</span>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#ba1414] font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Unit Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Lọc theo Đơn vị đo (Unit)</label>
            <select
              value={filterUnit}
              onChange={(e) => {
                setFilterUnit(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            >
              <option value="All">Tất cả đơn vị</option>
              {ALLOWED_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sắp xếp theo Tên (A → Z)</label>
            <select
              value={sortOption}
              onChange={(e) => {
                setSortOption(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            >
              <option value="name-asc">Tên nguyên liệu: A → Z</option>
              <option value="name-desc">Tên nguyên liệu: Z → A</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-gray-500 flex items-center justify-between pt-1">
          <span>Đang hiển thị {filteredAndSortedIngredients.length} nguyên liệu trên trang này</span>
          <span>Trang {currentPage} / {totalPages} (Tổng: {totalIngredients} nguyên liệu)</span>
        </div>
      </div>

      {/* Desktop View (>=768px): Table */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="py-3.5 px-4">Ingredient</th>
              <th className="py-3.5 px-4">Measurement Unit</th>
              <th className="py-3.5 px-4">Used In Dishes</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {filteredAndSortedIngredients.length === 0 ? (
              <tr>
                <td colSpan="4" className="py-8 text-center text-gray-500">
                  Không tìm thấy nguyên liệu nào khớp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredAndSortedIngredients.map((ing) => (
                <tr key={ing.id} className="hover:bg-red-50/30 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-gray-900">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#ba1414]" />
                      <span>{ing.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-block px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      {ing.unit}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {ing.dishes && ing.dishes.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-sm">
                        {ing.dishes.map((d) => (
                          <span
                            key={d.id}
                            className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200"
                          >
                            {d.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Not in any dishes</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(ing)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                        title="Edit Ingredient"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ing)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                        title="Delete Ingredient"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile View (<768px): Stacked Cards (Fixes horizontal scroll out-of-bounds) */}
      <div className="md:hidden space-y-4">
        {filteredAndSortedIngredients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-500 text-sm">
            Không tìm thấy nguyên liệu nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          filteredAndSortedIngredients.map((ing) => (
            <div
              key={ing.id}
              className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ba1414]" />
                  <h3 className="font-bold text-gray-900 text-base">{ing.name}</h3>
                </div>
                <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {ing.unit}
                </span>
              </div>

              <div className="pt-2 border-t border-gray-100 text-xs">
                <span className="font-semibold text-gray-700 block mb-1">Used In Dishes:</span>
                {ing.dishes && ing.dishes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {ing.dishes.map((d) => (
                      <span key={d.id} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {d.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic">None</span>
                )}
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => startEdit(ing)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ing)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Server-Side Pagination Bar (Admin PageSize = 20) */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200">
          <div className="text-xs sm:text-sm text-gray-600">
            Trang <span className="font-bold text-gray-900">{currentPage}</span> / <span className="font-bold text-gray-900">{totalPages}</span> (Tổng số: {totalIngredients} nguyên liệu)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => {
                setCurrentPage((p) => p - 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Trước</span>
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p;
              if (totalPages <= 5) p = i + 1;
              else if (currentPage <= 3) p = i + 1;
              else if (currentPage >= totalPages - 2) p = totalPages - 4 + i;
              else p = currentPage - 2 + i;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setCurrentPage(p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-8 h-8 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                    currentPage === p
                      ? 'bg-[#ba1414] text-white shadow-xs'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => {
                setCurrentPage((p) => p + 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
