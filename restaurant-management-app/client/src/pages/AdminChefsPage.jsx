import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import LoadHandler from '../components/LoadHandler';
import PaginationBar from '../components/PaginationBar';
import { Plus, Edit2, Trash2, AlertCircle, CheckCircle2, ChefHat, UtensilsCrossed, Filter, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

export default function AdminChefsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = urlPage > 0 ? urlPage : 1;

  const [chefs, setChefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  // Server-Side Pagination state (PageSize = 20)
  const [totalChefs, setTotalChefs] = useState(0);

  // Client-Side Filter & Sort State (Admin pages ONLY)
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [debouncedSpecialty, setDebouncedSpecialty] = useState('');
  const [sortOption, setSortOption] = useState('name-asc'); // 'name-asc' | 'name-desc' | 'specialty-asc' | 'specialty-desc'

  // Debounce specialty filter input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSpecialty(filterSpecialty.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [filterSpecialty]);

  // Form State (Add / Edit)
  const [showForm, setShowForm] = useState(false);
  const [editingChefId, setEditingChefId] = useState(null);
  const [formData, setFormData] = useState({ name: '', specialty: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  const loadChefs = async (pageToLoad = currentPage) => {
    setLoading(true);
    setErrorBanner('');
    try {
      const [field, dir] = sortOption.split('-');
      const res = await api.getChefs({
        page: pageToLoad,
        pageSize: 20,
        specialty: debouncedSpecialty,
        sortBy: field,
        sortOrder: dir
      });
      if (res.ok) {
        setChefs(res.data?.items || []);
        setTotalChefs(res.data?.meta?.total || 0);
      } else {
        setErrorBanner(res.error?.message || 'Failed to load chefs list.');
      }
    } catch (err) {
      setErrorBanner('Failed to load chefs list.');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadChefs(currentPage);
  }, [currentPage, debouncedSpecialty, sortOption]);

  const totalPages = Math.ceil(totalChefs / 20) || 1;

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(newPage));
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetFilters = () => {
    setFilterSpecialty('');
    setSortOption('name-asc');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      return next;
    });
  };

  // Client-Side Filter & Sort computation (per spec: "Filter and sort must be client side")
  const filteredAndSortedChefs = useMemo(() => {
    let result = [...chefs];

    if (filterSpecialty.trim().length > 0) {
      const q = filterSpecialty.trim().toLowerCase();
      result = result.filter((c) => c.specialty.toLowerCase().includes(q));
    }

    const [field, dir] = sortOption.split('-');
    result.sort((a, b) => {
      if (field === 'name') {
        const cmp = a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      }
      if (field === 'specialty') {
        const cmp = a.specialty.localeCompare(b.specialty, 'vi', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });

    return result;
  }, [chefs, filterSpecialty, sortOption]);

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

  const startEdit = (chef) => {
    setEditingChefId(chef.id);
    setFormData({ name: chef.name, specialty: chef.specialty });
    setFieldErrors({});
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingChefId(null);
    setFormData({ name: '', specialty: '' });
    setFieldErrors({});
  };

  // Pre-flight Client-Side Validation
  const validateChefForm = (data) => {
    const errors = {};
    if (!data.name || data.name.trim().length === 0) {
      errors.name = 'Chef name is required and cannot be left blank.';
    }
    if (!data.specialty || data.specialty.trim().length === 0) {
      errors.specialty = 'Chef specialty is required and cannot be left blank.';
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setErrorBanner('');

    // Run client-side validation first
    const clientErrors = validateChefForm(formData);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setErrorBanner('Please correct the highlighted form errors before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitMessage(editingChefId ? 'Updating chef...' : 'Creating new chef...');

    let res;
    if (editingChefId) {
      res = await api.updateChef(editingChefId, formData);
    } else {
      res = await api.createChef(formData);
    }

    setSubmitting(false);

    if (res.ok) {
      setSuccessBanner(
        editingChefId
          ? `Chef "${res.data.name}" was successfully updated.`
          : `Chef "${res.data.name}" was successfully added!`
      );
      cancelForm();
      loadChefs();
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
  const handleDelete = async (chef) => {
    setSubmitting(true);
    setSubmitMessage(`Deleting chef "${chef.name}" and associated dishes...`);
    const res = await api.deleteChef(chef.id);
    setSubmitting(false);

    if (res.ok) {
      setSuccessBanner(res.data?.message || `Chef "${chef.name}" was deleted successfully.`);
      loadChefs();
    } else {
      setErrorBanner(res.error?.message || 'Failed to delete chef.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Red Loading Overlay on navigation, removed after loading completes */}
      <LoadHandler loading={initialLoading || submitting} message={submitMessage || 'Loading chefs...'} />

      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#ba1414]">
            Manage Chefs
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Maintain culinary staff profiles and assigned dish specialties.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (showForm && !editingChefId) {
              cancelForm();
            } else {
              setEditingChefId(null);
              setFormData({ name: '', specialty: '' });
              setFieldErrors({});
              setShowForm(true);
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm && !editingChefId ? 'Close Form' : 'Add New Chef'}</span>
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

      {/* Add / Edit Chef Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-[#ba1414] p-6 shadow-md animate-in fade-in duration-200">
          <h2 className="text-xl font-bold text-[#ba1414] mb-4 flex items-center gap-2">
            <ChefHat className="w-5 h-5" />
            <span>{editingChefId ? `Edit Chef: ${formData.name}` : 'Add New Chef'}</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Chef Full Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Gordon Ramsay"
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
                  Specialty *
                </label>
                <input
                  type="text"
                  name="specialty"
                  value={formData.specialty}
                  onChange={handleInputChange}
                  placeholder="e.g. French Cuisine & Pastries"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] ${
                    fieldErrors.specialty ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.specialty && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.specialty}</p>
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
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-md disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editingChefId ? 'Update Chef' : 'Save Chef'}
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
            <span>Bộ lọc & Sắp xếp</span>
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
          {/* Specialty Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Lọc theo Chuyên môn (Specialty)</label>
            <input
              type="text"
              value={filterSpecialty}
              onChange={(e) => {
                setFilterSpecialty(e.target.value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', '1');
                  return next;
                });
              }}
              placeholder="Nhập chuyên môn cần lọc (ví dụ: Nướng, Lẩu, Bún)..."
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            />
            {/* Loading text below the search bar - removed when loading finishes */}
            {(loading || filterSpecialty.trim() !== debouncedSpecialty) && (
              <div className="text-gray-500 text-xs font-medium py-1.5 text-center">
                Loading...
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sắp xếp theo (A → Z)</label>
            <select
              value={sortOption}
              onChange={(e) => {
                setSortOption(e.target.value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', '1');
                  return next;
                });
              }}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            >
              <option value="name-asc">Tên đầu bếp: A → Z</option>
              <option value="name-desc">Tên đầu bếp: Z → A</option>
              <option value="specialty-asc">Chuyên môn: A → Z</option>
              <option value="specialty-desc">Chuyên môn: Z → A</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-gray-500 flex items-center justify-between pt-1">
          <span>Đang hiển thị {filteredAndSortedChefs.length} đầu bếp trên trang này</span>
          <span>Trang {currentPage} / {totalPages} (Tổng: {totalChefs} đầu bếp)</span>
        </div>
      </div>

      {/* Desktop View (>=768px): Table */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="py-3.5 px-4">Chef Name</th>
              <th className="py-3.5 px-4">Specialty</th>
              <th className="py-3.5 px-4">Cooked Dishes</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {filteredAndSortedChefs.length === 0 ? (
              <tr>
                <td colSpan="4" className="py-8 text-center text-gray-500">
                  Không tìm thấy đầu bếp nào khớp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredAndSortedChefs.map((chef) => (
                <tr key={chef.id} className="hover:bg-red-50/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-red-100 text-[#ba1414] flex items-center justify-center font-bold text-sm shrink-0">
                        {chef.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-gray-900">{chef.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-gray-700 font-medium">
                    {chef.specialty}
                  </td>
                  <td className="py-3.5 px-4">
                    {chef.dishes && chef.dishes.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-sm">
                        {chef.dishes.map((d) => (
                          <span
                            key={d.id}
                            className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200"
                          >
                            {d.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No dishes assigned</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(chef)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                        title="Edit Chef"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(chef)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                        title="Delete Chef"
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
        {filteredAndSortedChefs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-500 text-sm">
            Không tìm thấy đầu bếp nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          filteredAndSortedChefs.map((chef) => (
            <div
              key={chef.id}
              className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-[#ba1414] flex items-center justify-center font-bold text-base shrink-0">
                    {chef.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{chef.name}</h3>
                    <p className="text-xs text-[#ba1414] font-medium">{chef.specialty}</p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 text-xs">
                <span className="font-semibold text-gray-700 block mb-1">Cooked Dishes:</span>
                {chef.dishes && chef.dishes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {chef.dishes.map((d) => (
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
                  onClick={() => startEdit(chef)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(chef)}
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
      <PaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalChefs}
        itemLabel="đầu bếp"
        onPageChange={handlePageChange}
      />
    </div>
  );
}
