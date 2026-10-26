import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import LoadHandler from '../components/LoadHandler';
import NotFoundPage from './NotFoundPage';
import ChefSelectModal from '../components/ChefSelectModal';
import IngredientSelectModal from '../components/IngredientSelectModal';
import { ArrowLeft, Edit2, AlertCircle, ChevronRight, X } from 'lucide-react';

const CATEGORIES = ['Main Course', 'Appetizer', 'Dessert', 'Beverage'];

export default function AdminDishEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [notFoundMsg, setNotFoundMsg] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  const [chefs, setChefs] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  // Modal State for Chef & Ingredient Selection
  const [isChefModalOpen, setIsChefModalOpen] = useState(false);
  const [isIngModalOpen, setIsIngModalOpen] = useState(false);

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

  useEffect(() => {
    let isMounted = true;
    async function loadDishAndMeta() {
      setLoading(true);
      setErrorBanner('');

      try {
        const [dishRes, chefsRes, ingredientsRes] = await Promise.all([
          api.getDish(id),
          api.getChefs({ pageSize: 100 }),
          api.getIngredients({ pageSize: 100 })
        ]);

        if (!isMounted) return;

        if (!dishRes.ok || !dishRes.data) {
          setNotFound(true);
          setNotFoundMsg(dishRes.error?.message || `Dish #${id} was not found.`);
          setLoading(false);
          return;
        }

        const dish = dishRes.data;
        setFormData({
          name: dish.name || '',
          description: dish.description || '',
          price: dish.price?.toString() || '',
          category: dish.category || 'Main Course',
          available: dish.available ?? true,
          imageUrl: dish.imageUrl || '',
          chefId: dish.chefId || (dish.chef?.id ? dish.chef.id : ''),
          ingredientIds: dish.ingredients ? dish.ingredients.map((i) => i.id) : []
        });

        if (chefsRes.ok) setChefs(chefsRes.data?.items || chefsRes.data || []);
        if (ingredientsRes.ok) setIngredients(ingredientsRes.data?.items || ingredientsRes.data || []);
      } catch (err) {
        setErrorBanner('Failed to load dish details.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDishAndMeta();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const handleIngredientToggle = (ingId) => {
    setFormData((prev) => {
      const exists = prev.ingredientIds.includes(ingId);
      const nextIngs = exists
        ? prev.ingredientIds.filter((i) => i !== ingId)
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

  const handleSubmit = async (e) => {
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

    const res = await api.updateDish(id, formData);
    setSubmitting(false);

    if (res.ok) {
      // Per spec: On successful form submission, redirect client-side to origin page with no reloading
      navigate('/admin/dishes', {
        state: { msg: `Dish "${res.data.name}" was successfully updated.` }
      });
    } else {
      if (res.error?.code === 'VALIDATION_FAILED' && res.error.fields) {
        setFieldErrors(res.error.fields);
        setErrorBanner(res.error.message || 'Please correct the highlighted form errors.');
      } else {
        setErrorBanner(res.error?.message || 'Failed to update dish.');
      }
    }
  };

  if (loading) {
    return <LoadHandler loading={true} message="Loading dish details..." />;
  }

  if (notFound) {
    return <NotFoundPage message={notFoundMsg} />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* LoadHandler overlay that disables all buttons during update */}
      <LoadHandler loading={submitting} message="Saving dish changes..." />

      {/* Top Left Redirect Button to origin page */}
      <div>
        <Link
          to="/admin/dishes"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Manage Dishes</span>
        </Link>
      </div>

      {/* Error Banner */}
      {errorBanner && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-[#ba1414] text-sm font-medium">
          <AlertCircle className="w-5 h-5 text-[#ba1414]" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Edit Form Card */}
      <div className="relative overflow-hidden bg-white rounded-3xl border-2 border-[#ba1414] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-[#ba1414]">
            <Edit2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">
              Edit Dish: {formData.name || `#${id}`}
            </h1>
            <p className="text-xs text-gray-500">
              Update dish information, pricing, assigned chef, and ingredients.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dish Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Dish Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
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

            {/* Chef Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Assigned Chef *
              </label>
              {formData.chefId ? (
                (() => {
                  const selectedChef = chefs.find(
                    (c) => c.id === (typeof formData.chefId === 'number' ? formData.chefId : parseInt(formData.chefId, 10))
                  );
                  return (
                    <div className="w-full px-3.5 py-2.5 rounded-xl border border-[#ba1414] bg-red-50 text-[#ba1414] text-sm font-semibold flex items-center justify-between shadow-2xs">
                      <span className="truncate pr-2">
                        {selectedChef?.name || `Chef #${formData.chefId}`}
                        {selectedChef?.specialty ? ` (${selectedChef.specialty})` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, chefId: '' }))}
                        className="text-[#ba1414] hover:text-red-900 p-0.5 rounded cursor-pointer shrink-0"
                        title="Clear selection"
                        aria-label="Clear chef selection"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })()
              ) : (
                <button
                  type="button"
                  onClick={() => setIsChefModalOpen(true)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-left flex items-center justify-between transition-colors bg-white cursor-pointer ${
                    fieldErrors.chefId
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-300 text-gray-700 hover:border-[#ba1414]'
                  }`}
                >
                  <span>Select Chef</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              )}
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
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414] ${
                  fieldErrors.description ? 'border-red-500 bg-red-50' : 'border-gray-300'
                }`}
              />
              {fieldErrors.description && (
                <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.description}</p>
              )}
            </div>

            {/* Availability Toggle */}
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="available"
                  checked={formData.available}
                  onChange={handleInputChange}
                  className="w-4 h-4 rounded text-[#ba1414] focus:ring-[#ba1414]"
                />
                <span className="text-sm font-semibold text-gray-800">
                  Available for Customer Ordering
                </span>
              </label>
            </div>

            {/* Ingredients Selection */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  Ingredients * (Select at least one)
                </label>
                {formData.ingredientIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsIngModalOpen(true)}
                    className="text-xs font-bold text-[#ba1414] hover:underline cursor-pointer"
                  >
                    Edit selection
                  </button>
                )}
              </div>

              {formData.ingredientIds.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-2.5 border border-gray-200 rounded-xl bg-gray-50">
                  {formData.ingredientIds.map((id) => {
                    const ing = ingredients.find((i) => i.id === id);
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#ba1414] text-[#ba1414] shadow-2xs truncate"
                      >
                        <span className="truncate">{ing?.name || `Ingredient #${id}`}</span>
                        {ing?.unit && <span className="text-[10px] text-gray-500 font-normal">({ing.unit})</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsIngModalOpen(true)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-left flex items-center justify-between transition-colors bg-white cursor-pointer ${
                    fieldErrors.ingredientIds
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-300 text-gray-700 hover:border-[#ba1414]'
                  }`}
                >
                  <span>Select Ingredients</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              )}
              {fieldErrors.ingredientIds && (
                <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.ingredientIds}</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-5 border-t border-gray-200">
            <Link
              to="/admin/dishes"
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-all shadow-md"
            >
              Update Dish
            </button>
          </div>
        </form>

        {/* Form Context Modals: Confined to form window */}
        <ChefSelectModal
          isOpen={isChefModalOpen}
          onClose={() => setIsChefModalOpen(false)}
          onSelect={(chefId) => {
            setFormData((prev) => ({ ...prev, chefId }));
            if (fieldErrors.chefId) {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.chefId;
                return next;
              });
            }
          }}
          selectedChefId={formData.chefId}
          chefs={chefs}
          isForm={true}
        />

        <IngredientSelectModal
          isOpen={isIngModalOpen}
          onClose={() => setIsIngModalOpen(false)}
          onSelect={(ingredientIds) => {
            setFormData((prev) => ({ ...prev, ingredientIds }));
            if (fieldErrors.ingredientIds) {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.ingredientIds;
                return next;
              });
            }
          }}
          selectedIngredientIds={formData.ingredientIds}
          ingredients={ingredients}
          isForm={true}
        />
      </div>
    </div>
  );
}
