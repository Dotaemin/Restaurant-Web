import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import LoadHandler from '../components/LoadHandler';
import { Plus, Edit2, Trash2, AlertCircle, CheckCircle2, XCircle, Utensils, ChefHat, Filter, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

const CATEGORIES = ['Main Course', 'Appetizer', 'Dessert', 'Beverage'];

export default function AdminDishesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const currentPage = urlPage > 0 ? urlPage : 1;

  // Page local state
  const [dishes, setDishes] = useState([]);
  const [chefs, setChefs] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  // Server-Side Pagination state (PageSize = 20)
  const [totalDishes, setTotalDishes] = useState(0);

  // Client-Side Filter State (Admin pages ONLY)
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterIngredientId, setFilterIngredientId] = useState('All');
  const [filterChefId, setFilterChefId] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All'); // 'All' | 'available' | 'soldout'

  // Client-Side Sort State (Admin pages ONLY)
  const [sortOption, setSortOption] = useState('name-asc');

  // Add Dish Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Main Course',
    available: true,
    imageUrl: '',
    chefId: '',
    ingredientIds: []
  });
  const [fieldErrors, setFieldErrors] = useState({});

  // Fetch all required data on mount and on filter/sort/page change
  const loadData = async (pageToLoad = currentPage) => {
    setLoading(true);
    setErrorBanner('');
    try {
      const [field, dir] = sortOption.split('-');
      const queryParams = {
        page: pageToLoad,
        pageSize: 20,
        category: filterCategory,
        chefId: filterChefId,
        ingredientId: filterIngredientId,
        available: filterStatus === 'available' ? 'true' : filterStatus === 'soldout' ? 'false' : undefined,
        sortBy: field,
        sortOrder: dir
      };

      const [dishesRes, chefsRes, ingredientsRes] = await Promise.all([
        api.getAdminDishes(queryParams),
        api.getChefs({ pageSize: 100 }),
        api.getIngredients({ pageSize: 100 })
      ]);

      if (dishesRes.ok) {
        setDishes(dishesRes.data?.items || []);
        setTotalDishes(dishesRes.data?.meta?.total || 0);
      }
      if (chefsRes.ok) setChefs(chefsRes.data?.items || chefsRes.data || []);
      if (ingredientsRes.ok) setIngredients(ingredientsRes.data?.items || ingredientsRes.data || []);

      if (chefsRes.ok && (chefsRes.data?.items || chefsRes.data)?.length > 0 && !formData.chefId) {
        const firstChefId = (chefsRes.data?.items || chefsRes.data)[0].id;
        setFormData((prev) => ({ ...prev, chefId: firstChefId }));
      }
    } catch (err) {
      setErrorBanner('Failed to load dishes and metadata.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, filterCategory, filterIngredientId, filterChefId, filterStatus, sortOption]);

  // Client-Side Filtering & Sorting computation (per spec: "Filter and sort must be client side")
  const filteredAndSortedDishes = useMemo(() => {
    let result = [...dishes];

    // Filter by Category
    if (filterCategory !== 'All') {
      result = result.filter((d) => d.category === filterCategory);
    }
    // Filter by Ingredient
    if (filterIngredientId !== 'All') {
      const ingIdNum = parseInt(filterIngredientId, 10);
      result = result.filter((d) => d.ingredients?.some((i) => i.id === ingIdNum));
    }
    // Filter by Chef
    if (filterChefId !== 'All') {
      const chefIdNum = parseInt(filterChefId, 10);
      result = result.filter((d) => d.chefId === chefIdNum || d.chef?.id === chefIdNum);
    }
    // Filter by Status
    if (filterStatus === 'available') {
      result = result.filter((d) => d.available === true);
    } else if (filterStatus === 'soldout') {
      result = result.filter((d) => d.available === false);
    }

    // Sort
    const [field, dir] = sortOption.split('-');
    result.sort((a, b) => {
      if (field === 'name') {
        const cmp = a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      }
      if (field === 'price') {
        const pA = parseFloat(a.price);
        const pB = parseFloat(b.price);
        return dir === 'asc' ? pA - pB : pB - pA;
      }
      if (field === 'category') {
        const cmp = a.category.localeCompare(b.category, 'vi', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      }
      if (field === 'chef') {
        const cA = a.chef?.name || '';
        const cB = b.chef?.name || '';
        const cmp = cA.localeCompare(cB, 'vi', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });

    return result;
  }, [dishes, filterCategory, filterIngredientId, filterChefId, filterStatus, sortOption]);

  const totalPages = Math.ceil(totalDishes / 20) || 1;

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
    setFilterCategory('All');
    setFilterIngredientId('All');
    setFilterChefId('All');
    setFilterStatus('All');
    setSortOption('name-asc');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      return next;
    });
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear field-specific error upon typing
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  // Handle ingredient checkbox toggle
  const handleIngredientToggle = (ingId) => {
    setFormData((prev) => {
      const exists = prev.ingredientIds.includes(ingId);
      const nextIngs = exists
        ? prev.ingredientIds.filter((id) => id !== ingId)
        : [...prev.ingredientIds, ingId];
      return { ...prev, ingredientIds: nextIngs };
    });
    if (fieldErrors.ingredientIds) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated.ingredientIds;
        return updated;
      });
    }
  };

  // Pre-flight Client-Side Validation
  const validateDishForm = (data) => {
    const errors = {};
    if (!data.name || data.name.trim().length === 0) {
      errors.name = 'Dish name is required and cannot be left blank.';
    }
    const parsedPrice = parseFloat(data.price);
    if (data.price === '' || data.price === null || data.price === undefined || isNaN(parsedPrice)) {
      errors.price = 'Price is required and must be a valid number.';
    } else if (parsedPrice < 0) {
      errors.price = 'Price must not be a negative number.';
    }
    if (!data.category || !CATEGORIES.includes(data.category)) {
      errors.category = `Category must be one of: ${CATEGORIES.join(', ')}.`;
    }
    if (!data.chefId) {
      errors.chefId = 'Please select an assigned chef.';
    }
    if (!data.imageUrl || data.imageUrl.trim().length === 0) {
      errors.imageUrl = 'Dish image URL is required and cannot be left blank.';
    }
    if (!data.description || data.description.trim().length === 0) {
      errors.description = 'Dish description is required and cannot be left blank.';
    }
    if (!data.ingredientIds || data.ingredientIds.length === 0) {
      errors.ingredientIds = 'At least one ingredient must be chosen for the dish.';
    }
    return errors;
  };

  // Submit Add Dish Form
  const handleCreateDish = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setErrorBanner('');

    // Run client-side validation first
    const clientErrors = validateDishForm(formData);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setErrorBanner('Please correct the highlighted form errors before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitMessage('Creating new dish...');

    const res = await api.createDish(formData);
    setSubmitting(false);

    if (res.ok) {
      setSuccessBanner(`Dish "${res.data.name}" was created successfully!`);
      // Reset form
      setFormData({
        name: '',
        description: '',
        price: '',
        category: 'Main Course',
        available: true,
        imageUrl: '',
        chefId: chefs[0]?.id || '',
        ingredientIds: []
      });
      setShowAddForm(false);
      // Refresh list without page reload
      loadData();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (res.error?.code === 'VALIDATION_FAILED' && res.error.fields) {
        setFieldErrors(res.error.fields);
        setErrorBanner(res.error.message || 'Please correct the highlighted form errors.');
      } else {
        setErrorBanner(res.error?.message || 'Failed to create dish.');
      }
    }
  };

  // Delete Dish Action: Direct deletion without alert, immediately reloading data
  const handleDeleteDish = async (dish) => {
    setSubmitting(true);
    setSubmitMessage(`Deleting dish "${dish.name}"...`);
    const res = await api.deleteDish(dish.id);
    setSubmitting(false);

    if (res.ok) {
      setSuccessBanner(`Dish "${dish.name}" was successfully deleted.`);
      loadData();
    } else {
      setErrorBanner(res.error?.message || 'Failed to delete dish.');
    }
  };

  return (
    <div className="space-y-6">
      {/* LoadHandler overlay that disables all buttons during load/submit */}
      <LoadHandler loading={loading || submitting} message={submitMessage || 'Loading dishes...'} />

      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#ba1414]">
            Manage Dishes
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Create, update, and manage all menu items and their ingredients.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>{showAddForm ? 'Close Dish Form' : 'Add New Dish'}</span>
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

      {/* Add Dish Form (Collapsible) */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border-2 border-[#ba1414] p-6 shadow-md animate-in fade-in duration-200">
          <h2 className="text-xl font-bold text-[#ba1414] mb-4 flex items-center gap-2">
            <Utensils className="w-5 h-5" />
            <span>Add New Dish</span>
          </h2>

          <form onSubmit={handleCreateDish} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Dish Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Wagyu Ribeye Steak"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] ${
                    fieldErrors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.name}</p>
                )}
              </div>

              {/* Price */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Price ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  placeholder="e.g. 29.50"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] ${
                    fieldErrors.price ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.price && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.price}</p>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] bg-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {fieldErrors.category && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.category}</p>
                )}
              </div>

              {/* Chef */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Assigned Chef *
                </label>
                <select
                  name="chefId"
                  value={formData.chefId}
                  onChange={handleInputChange}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] bg-white ${
                    fieldErrors.chefId ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select Chef...</option>
                  {chefs.map((chef) => (
                    <option key={chef.id} value={chef.id}>
                      {chef.name} ({chef.specialty})
                    </option>
                  ))}
                </select>
                {fieldErrors.chefId && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.chefId}</p>
                )}
              </div>

              {/* Image URL (REQUIRED) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Image URL *
                </label>
                <input
                  type="url"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleInputChange}
                  placeholder="https://images.unsplash.com/photo-..."
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] ${
                    fieldErrors.imageUrl ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.imageUrl && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.imageUrl}</p>
                )}
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  name="description"
                  rows="3"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Describe taste, ingredients, and preparation..."
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] ${
                    fieldErrors.description ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.description && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.description}</p>
                )}
              </div>

              {/* Available Toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    name="available"
                    checked={formData.available}
                    onChange={handleInputChange}
                    className="w-4 h-4 rounded text-[#ba1414] focus:ring-[#ba1414]"
                  />
                  <span className="text-sm font-semibold text-gray-800">Available for Ordering</span>
                </label>
              </div>

              {/* Ingredients Selection */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                  Ingredients * (Choose at least one)
                </label>
                {ingredients.length === 0 ? (
                  <p className="text-xs text-amber-600">
                    No ingredients found. Please add ingredients in Manage Ingredients first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto p-3 border border-gray-200 rounded-xl bg-gray-50">
                    {ingredients.map((ing) => {
                      const checked = formData.ingredientIds.includes(ing.id);
                      return (
                        <label
                          key={ing.id}
                          className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                            checked
                              ? 'bg-red-50 border-[#ba1414] text-[#ba1414]'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleIngredientToggle(ing.id)}
                            className="rounded text-[#ba1414] focus:ring-[#ba1414]"
                          />
                          <span className="truncate">{ing.name} ({ing.unit})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {fieldErrors.ingredientIds && (
                  <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.ingredientIds}</p>
                )}
              </div>
            </div>

            {/* Submit & Cancel Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-md"
              >
                Save Dish
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Category Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Danh mục</label>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', '1');
                  return next;
                });
              }}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            >
              <option value="All">Tất cả danh mục</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Ingredient Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nguyên liệu</label>
            <select
              value={filterIngredientId}
              onChange={(e) => {
                setFilterIngredientId(e.target.value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', '1');
                  return next;
                });
              }}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            >
              <option value="All">Tất cả nguyên liệu</option>
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>{ing.name}</option>
              ))}
            </select>
          </div>

          {/* Chef Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Đầu bếp</label>
            <select
              value={filterChefId}
              onChange={(e) => {
                setFilterChefId(e.target.value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', '1');
                  return next;
                });
              }}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            >
              <option value="All">Tất cả đầu bếp</option>
              {chefs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Trạng thái</label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', '1');
                  return next;
                });
              }}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ba1414]"
            >
              <option value="All">Tất cả trạng thái</option>
              <option value="available">Đang phục vụ (Available)</option>
              <option value="soldout">Hết hàng (Sold Out)</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sắp xếp theo</label>
            <div className="relative">
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
                <option value="name-asc">Tên món: A → Z</option>
                <option value="name-desc">Tên món: Z → A</option>
                <option value="price-asc">Giá: Thấp → Cao</option>
                <option value="price-desc">Giá: Cao → Thấp</option>
                <option value="category-asc">Danh mục: A → Z</option>
                <option value="category-desc">Danh mục: Z → A</option>
                <option value="chef-asc">Đầu bếp: A → Z</option>
                <option value="chef-desc">Đầu bếp: Z → A</option>
              </select>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-gray-500 flex items-center justify-between pt-1">
          <span>Đang hiển thị {filteredAndSortedDishes.length} món trên trang này</span>
          <span>Trang {currentPage} / {totalPages} (Tổng: {totalDishes} món)</span>
        </div>
      </div>

      {/* Desktop View (>=768px): Clean Table View */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="py-3.5 px-4">Dish</th>
              <th className="py-3.5 px-4">Category</th>
              <th className="py-3.5 px-4">Price</th>
              <th className="py-3.5 px-4">Chef</th>
              <th className="py-3.5 px-4">Ingredients</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {filteredAndSortedDishes.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-8 text-center text-gray-500">
                  Không tìm thấy món ăn nào khớp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filteredAndSortedDishes.map((dish) => (
                <tr key={dish.id} className="hover:bg-red-50/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={dish.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c'}
                        alt={dish.name}
                        className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0"
                      />
                      <div>
                        <div className="font-bold text-gray-900">{dish.name}</div>
                        <div className="text-xs text-gray-500 max-w-xs truncate">{dish.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 whitespace-nowrap">
                      {dish.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-[#ba1414]">
                    ${parseFloat(dish.price).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-gray-800">
                    {dish.chef?.name || '—'}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {dish.ingredients?.map((ing) => (
                        <span key={ing.id} className="px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600 border border-gray-200">
                          {ing.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {dish.available ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500">
                        <XCircle className="w-3.5 h-3.5" />
                        Sold Out
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/admin/dishes/${dish.id}/edit`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                        title="Edit Dish"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteDish(dish)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                        title="Delete Dish"
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

      {/* Mobile View (<768px): Stacked Cards */}
      <div className="md:hidden space-y-4">
        {filteredAndSortedDishes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-500 text-sm">
            Không tìm thấy món ăn nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          filteredAndSortedDishes.map((dish) => (
            <div
              key={dish.id}
              className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start gap-3">
                <img
                  src={dish.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c'}
                  alt={dish.name}
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-200"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-bold text-gray-900 text-base truncate">{dish.name}</h3>
                    <span className="font-black text-[#ba1414] text-base shrink-0">
                      ${parseFloat(dish.price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 whitespace-nowrap">
                      {dish.category}
                    </span>
                    {dish.available ? (
                      <span className="text-xs text-emerald-700 font-medium">Available</span>
                    ) : (
                      <span className="text-xs text-gray-500 font-medium">Sold Out</span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-600 line-clamp-2">{dish.description}</p>

              <div className="pt-2 border-t border-gray-100 text-xs flex flex-col gap-1 text-gray-600">
                <div>
                  <span className="font-semibold text-gray-700">Chef:</span> {dish.chef?.name || '—'}
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Ingredients:</span>{' '}
                  {dish.ingredients?.map((i) => i.name).join(', ') || '—'}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <Link
                  to={`/admin/dishes/${dish.id}/edit`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteDish(dish)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
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
            Trang <span className="font-bold text-gray-900">{currentPage}</span> / <span className="font-bold text-gray-900">{totalPages}</span> (Tổng số: {totalDishes} món)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                  onClick={() => handlePageChange(p)}
                  className={`w-8 h-8 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
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
              onClick={() => handlePageChange(currentPage + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
