import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import LoadHandler from '../components/LoadHandler';
import NotFoundPage from './NotFoundPage';
import { ArrowLeft, ChefHat, Carrot, DollarSign, CheckCircle2, XCircle } from 'lucide-react';

export default function DishDetailPage() {
  const { id } = useParams();
  const [dish, setDish] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notFoundMsg, setNotFoundMsg] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchDish() {
      setLoading(true);
      setNotFound(false);

      const res = await api.getDish(id);
      if (!isMounted) return;

      if (res.ok && res.data) {
        setDish(res.data);
      } else {
        setNotFound(true);
        setNotFoundMsg(res.error?.message || `Dish #${id} not found.`);
      }
      setLoading(false);
    }

    fetchDish();
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return <LoadHandler loading={true} message="Loading dish details..." />;
  }

  if (notFound || !dish) {
    return <NotFoundPage message={notFoundMsg} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Left Redirect Button to /dishes */}
      <div>
        <Link
          to="/dishes"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-[#ba1414] hover:bg-red-800 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </Link>
      </div>

      {/* Main Dish Detail Card */}
      <div className="bg-white rounded-3xl border-2 border-[#ba1414] overflow-hidden shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Dish Image */}
          <div className="relative aspect-square md:aspect-auto h-72 md:h-full bg-gray-100">
            <img
              src={dish.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c'}
              alt={dish.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#ba1414] text-white shadow-md">
                {dish.category}
              </span>
            </div>
          </div>

          {/* Details Content */}
          <div className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                  {dish.name}
                </h1>
                <span className="text-2xl font-black text-[#ba1414] shrink-0">
                  ${parseFloat(dish.price).toFixed(2)}
                </span>
              </div>

              {/* Availability Badge */}
              <div className="mb-4">
                {dish.available ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Available Today
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                    <XCircle className="w-3.5 h-3.5" />
                    Temporarily Sold Out
                  </span>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1 mb-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Description
                </h2>
                <p className="text-gray-700 text-sm sm:text-base leading-relaxed break-words">
                  {dish.description}
                </p>
              </div>

              {/* Chef Info */}
              {dish.chef && (
                <div className="p-4 rounded-2xl bg-red-50/60 border border-red-100 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#ba1414] text-white flex items-center justify-center shrink-0">
                      <ChefHat className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Prepared by Chef</p>
                      <p className="font-bold text-gray-900">{dish.chef.name}</p>
                      <p className="text-xs text-[#ba1414] font-medium">{dish.chef.specialty}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Ingredients List */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                  <Carrot className="w-4 h-4 text-[#ba1414]" />
                  <span>Key Ingredients</span>
                </div>

                {dish.ingredients && dish.ingredients.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {dish.ingredients.map((ing) => (
                      <span
                        key={ing.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ba1414]" />
                        <span>{ing.name}</span>
                        <span className="text-gray-400">({ing.unit})</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">No specific ingredients listed.</p>
                )}
              </div>
            </div>

            {/* Back Button */}
            <div className="pt-4 border-t border-gray-100">
              <Link
                to="/dishes"
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-[#ba1414] border-2 border-[#ba1414] hover:bg-[#ba1414] hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Menu</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
