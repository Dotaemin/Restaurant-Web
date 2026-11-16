import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import LoadHandler from '../components/LoadHandler';
import NotFoundPage from './NotFoundPage';
import ChefSelectModal from '../components/ChefSelectModal';
import IngredientSelectModal from '../components/IngredientSelectModal';
import { ArrowLeft, Edit2, AlertCircle, ChevronRight, X, ShieldAlert } from 'lucide-react';

const CATEGORIES = ['Main Course', 'Appetizer', 'Dessert', 'Beverage'];

export default function AdminDishEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [notFoundMsg, setNotFoundMsg] = useState('');
  const [errorBanner, setErrorBanner] = useState('');
  const [forbiddenMsg, setForbiddenMsg] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

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
      setForbiddenMsg('');

      try {
        const [dishRes, chefsRes, ingredientsRes, meRes] = await Promise.all([
          api.getDish(id),
          api.getChefs({ pageSize: 100 }),
          api.getIngredients({ pageSize: 100 }),
          api.getCurrentUser()
        ]);

        if (!isMounted) return;

        if (meRes?.ok && meRes.user) {
          setCurrentUser(meRes.user);
        }

        if (!dishRes.ok || !dishRes.data) {
          setNotFound(true);
          setNotFoundMsg(dishRes.error?.message || `Dish #${id} was not found.`);
          setLoading(false);
          return;
        }

        const dish = dishRes.data;
        const user = meRes?.user;

        // ABAC Check: If user is CHEF, must only edit dishes they cook
        if (user && user.role === 'CHEF') {
          if (!user.chefId || dish.chefId !== user.chefId) {
            setForbiddenMsg('You can only edit dishes that you cook.');
            setLoading(false);
            return;
          }
        }

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

  const removeIngredient = (ingId) => {
    setFormData((prev) => ({
      ...prev,
      ingredientIds: prev.ingredientIds.filter((id) => id !== ingId)
    }));
  };

  const validateDishForm = (data) => {
    const errors = {};
    if (!data.name || data.name.trim().length === 0) {
      errors.name = 'Dish name is required and cannot be left blank.';
    }
    const parsedPrice = parseFloat(data.price);
    if (data.price === undefined || data.price === null || data.price === '' || isNaN(parsedPrice)) {
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
      navigate('/admin/dishes');
    } else {
      if (res.error?.fields) {
        setFieldErrors(res.error.fields);
      }
      setErrorBanner(res.error?.message || 'Failed to update dish.');
    }
  };

  if (loading) {
    return <LoadHandler type="form" message="Loading dish details..." />;
  }

  if (notFound) {
    return (
      <NotFoundPage
        title="Dish Not Found"
        message={notFoundMsg}
        backLink="/admin/dishes"
        backText="Back to Dishes Management"
      />
    );
  }

  if (forbiddenMsg) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white rounded-3xl border border-rose-200 p-8 shadow-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-600 mb-6 font-medium">{forbiddenMsg}</p>
        <Link
          to="/admin/dishes"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ba1414] text-white font-bold text-xs hover:bg-red-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Manage Dishes</span>
        </Link>
      </div>
    );
  }

  const isChefUser = currentUser?.role === 'CHEF';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header & Back Button */}
      <div className="flex items-center justify-between">
        <Link
          to="/admin/dishes"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-[#ba1414] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dishes Management</span>
        </Link>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Dish #{id}
        </span>
      </div>

      {/* Main Card */}
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {submitting && <LoadHandler type="form" message="Saving changes to dish..." />}

        {/* Card Header */}
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-50 text-[#ba1414]">
            <Edit2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Edit Dish</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Update dish details, ingredients, chef assignment, or availability.
            </p>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorBanner && (
          <div className="mx-6 mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div className="text-sm font-medium">{errorBanner}</div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Row 1: Dish Name & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Dish Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
                  fieldErrors.name
                    ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                    : 'border-gray-300 focus:border-[#ba1414] focus:ring-1 focus:ring-[#ba1414]'
                }`}
                placeholder="e.g., Margherita Pizza Classica"
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.name}</p>
              )}
            </div>

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
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
                  fieldErrors.price
                    ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                    : 'border-gray-300 focus:border-[#ba1414] focus:ring-1 focus:ring-[#ba1414]'
                }`}
                placeholder="0.00"
              />
              {fieldErrors.price && (
                <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.price}</p>
              )}
            </div>
          </div>

          {/* Row 2: Category & Assigned Chef */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors bg-white ${
                  fieldErrors.category
                    ? 'border-red-500 bg-red-50 focus:border-red-500'
                    : 'border-gray-300 focus:border-[#ba1414]'
                }`}
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

            {/* Chef Selection: Locked for CHEF role */}
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
                      {!isChefUser && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, chefId: '' }))}
                          className="text-[#ba1414] hover:text-red-900 p-0.5 rounded cursor-pointer shrink-0"
                          title="Clear selection"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })()
              ) : (
                <button
                  type="button"
                  onClick={() => setIsChefModalOpen(true)}
                  disabled={isChefUser}
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
              {isChefUser && (
                <p className="text-2xs text-slate-500 mt-1">
                  Chefs cannot change chef assignment on dish updates.
                </p>
              )}
              {fieldErrors.chefId && (
                <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.chefId}</p>
              )}
            </div>
          </div>

          {/* Row 3: Image URL & Availability Checkbox */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
              Image URL *
            </label>
            <input
              type="text"
              name="imageUrl"
              value={formData.imageUrl}
              onChange={handleInputChange}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
                fieldErrors.imageUrl
                  ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-gray-300 focus:border-[#ba1414] focus:ring-1 focus:ring-[#ba1414]'
              }`}
              placeholder="https://images.unsplash.com/photo-..."
            />
            {fieldErrors.imageUrl && (
              <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.imageUrl}</p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                name="available"
                checked={formData.available}
                onChange={handleInputChange}
                className="w-4 h-4 rounded text-[#ba1414] focus:ring-[#ba1414] border-gray-300 cursor-pointer"
              />
              <span className="text-sm font-semibold text-gray-700">
                Mark as Available for Ordering
              </span>
            </label>
          </div>

          {/* Row 4: Ingredients Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
              Ingredients *
            </label>

            {/* Selected Ingredient Tags */}
            {formData.ingredientIds.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.ingredientIds.map((ingId) => {
                  const ing = ingredients.find((i) => i.id === ingId);
                  return (
                    <span
                      key={ingId}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-[#ba1414] border border-[#ba1414]/30"
                    >
                      <span>{ing ? `${ing.name} (${ing.unit})` : `Ingredient #${ingId}`}</span>
                      <button
                        type="button"
                        onClick={() => removeIngredient(ingId)}
                        className="text-[#ba1414] hover:text-red-900 p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setIsIngModalOpen(true)}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-left flex items-center justify-between transition-colors bg-white cursor-pointer ${
                fieldErrors.ingredientIds
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-gray-300 text-gray-700 hover:border-[#ba1414]'
              }`}
            >
              <span>
                {formData.ingredientIds.length > 0
                  ? `Edit Selection (${formData.ingredientIds.length} ingredients selected)`
                  : 'Select Ingredients'}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
            {fieldErrors.ingredientIds && (
              <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.ingredientIds}</p>
            )}
          </div>

          {/* Row 5: Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
              Dish Description *
            </label>
            <textarea
              name="description"
              rows="4"
              value={formData.description}
              onChange={handleInputChange}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
                fieldErrors.description
                  ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                  : 'border-gray-300 focus:border-[#ba1414] focus:ring-1 focus:ring-[#ba1414]'
              }`}
              placeholder="Describe the dish ingredients, preparation, taste, and allergens..."
            />
            {fieldErrors.description && (
              <p className="text-xs text-red-600 font-medium mt-1">{fieldErrors.description}</p>
            )}
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <Link
              to="/admin/dishes"
              className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-[#ba1414] text-white text-sm font-bold shadow-sm hover:bg-red-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>

        {/* Chef Selection Modal */}
        <ChefSelectModal
          isOpen={isChefModalOpen}
          onClose={() => setIsChefModalOpen(false)}
          onSelect={(chefId) => {
            setFormData((prev) => ({ ...prev, chefId }));
            if (fieldErrors.chefId) {
              setFieldErrors((prev) => {
                const updated = { ...prev };
                delete updated.chefId;
                return updated;
              });
            }
          }}
          selectedChefId={formData.chefId}
          isFormContext={true}
        />

        {/* Ingredient Selection Modal */}
        <IngredientSelectModal
          isOpen={isIngModalOpen}
          onClose={() => setIsIngModalOpen(false)}
          onSelect={(selectedIds) => {
            setFormData((prev) => ({ ...prev, ingredientIds: selectedIds }));
            if (fieldErrors.ingredientIds) {
              setFieldErrors((prev) => {
                const updated = { ...prev };
                delete updated.ingredientIds;
                return updated;
              });
            }
          }}
          selectedIngredientIds={formData.ingredientIds}
          isFormContext={true}
        />
      </div>
    </div>
  );
}
