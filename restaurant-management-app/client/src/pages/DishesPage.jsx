import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import api from '../api/client';
import LoadHandler from '../components/LoadHandler';
import { ChefHat, AlertCircle, Sparkles, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const CATEGORIES = ['All', 'Main Course', 'Appetizer', 'Dessert', 'Beverage'];

export default function DishesPage({ paginationMode = 'page' }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Mode 1 uses URL search params for page & search
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const initialSearch = searchParams.get('search') || '';

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Debounce search input (server-side FTS)
  useEffect(() => {
    const trimmed = searchTerm.trim();
    const currentUrlSearch = searchParams.get('search') || '';

    // If search term hasn't changed compared to URL, do NOT update searchParams or reset page
    if (trimmed === currentUrlSearch) {
      setDebouncedSearch(trimmed);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
      if (paginationMode === 'page') {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          if (trimmed) next.set('search', trimmed);
          else next.delete('search');
          next.set('page', '1');
          return next;
        });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm, paginationMode, searchParams, setSearchParams]);

  // Sync search state if URL search param changes externally (e.g. browser back/forward)
  useEffect(() => {
    const currentUrlSearch = searchParams.get('search') || '';
    if (currentUrlSearch !== debouncedSearch && currentUrlSearch !== searchTerm) {
      setSearchTerm(currentUrlSearch);
      setDebouncedSearch(currentUrlSearch);
    }
  }, [searchParams, debouncedSearch, searchTerm]);

  // Mode 1: Page Numbers Query (URL changes with ?page=X)
  const pageQuery = useQuery({
    queryKey: ['dishes', 'page', { page: urlPage, search: debouncedSearch }],
    queryFn: () => api.getDishes({ page: urlPage, pageSize: 12, search: debouncedSearch }),
    enabled: paginationMode === 'page',
  });

  // Mode 2: Load More Query (URL static)
  const loadMoreQuery = useInfiniteQuery({
    queryKey: ['dishes', 'load-more', { search: debouncedSearch }],
    queryFn: ({ pageParam = 1 }) =>
      api.getDishes({ page: pageParam, pageSize: 12, search: debouncedSearch }),
    getNextPageParam: (lastPage) => {
      const meta = lastPage?.data?.meta;
      if (!meta) return undefined;
      const totalPages = Math.ceil(meta.total / meta.pageSize);
      return meta.page < totalPages ? meta.page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: paginationMode === 'load-more',
  });

  // Mode 3: Infinite Scroll Query (URL static)
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['dishes', 'infinite-scroll', { search: debouncedSearch }],
    queryFn: ({ pageParam = 1 }) =>
      api.getDishes({ page: pageParam, pageSize: 12, search: debouncedSearch }),
    getNextPageParam: (lastPage) => {
      const meta = lastPage?.data?.meta;
      if (!meta) return undefined;
      const totalPages = Math.ceil(meta.total / meta.pageSize);
      return meta.page < totalPages ? meta.page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: paginationMode === 'infinite-scroll',
  });

  // Infinite Scroll IntersectionObserver
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (paginationMode !== 'infinite-scroll') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) {
          infiniteQuery.fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [paginationMode, infiniteQuery]);

  // Aggregate current active query state
  const activeQuery =
    paginationMode === 'page'
      ? pageQuery
      : paginationMode === 'load-more'
      ? loadMoreQuery
      : infiniteQuery;

  const isFetchingNext =
    paginationMode === 'load-more'
      ? loadMoreQuery.isFetchingNextPage
      : paginationMode === 'infinite-scroll'
      ? infiniteQuery.isFetchingNextPage
      : false;

  // Search loading state (debouncing or query fetching)
  const isSearchActive = Boolean(searchTerm.trim() || debouncedSearch);
  const isSearchLoading = isSearchActive && (searchTerm.trim() !== debouncedSearch || activeQuery.isFetching);

  // Red loading overlay is only for initial mount on page mode without search
  const showOverlayLoading = paginationMode === 'page' && !isSearchActive && pageQuery.isLoading;
  const isAnyLoading = activeQuery.isLoading || isSearchLoading || isFetchingNext;
  const error = activeQuery.error?.message || (activeQuery.data?.ok === false ? activeQuery.data?.error?.message : null);

  // Extract raw items
  let rawDishes = [];
  let totalCount = 0;
  if (paginationMode === 'page') {
    rawDishes = pageQuery.data?.data?.items || [];
    totalCount = pageQuery.data?.data?.meta?.total || 0;
  } else if (paginationMode === 'load-more') {
    rawDishes = loadMoreQuery.data?.pages?.flatMap((p) => p?.data?.items || []) || [];
    totalCount = loadMoreQuery.data?.pages?.[0]?.data?.meta?.total || 0;
  } else {
    rawDishes = infiniteQuery.data?.pages?.flatMap((p) => p?.data?.items || []) || [];
    totalCount = infiniteQuery.data?.pages?.[0]?.data?.meta?.total || 0;
  }

  // Client-side category filtering (per instruction: "Filter and sort must be client side")
  const displayedDishes =
    selectedCategory === 'All'
      ? rawDishes
      : rawDishes.filter((d) => d.category === selectedCategory);

  // Pagination calculations for Mode 1
  const pageSize = 12;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(newPage));
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Fullscreen Loading Overlay: Disables all buttons and displays spinning cutlery */}
      <LoadHandler loading={showOverlayLoading} message="Loading dishes..." />

      {/* Header Banner */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#ba1414] tracking-tight">
          Our Special Menu
        </h1>
        <p className="text-sm sm:text-base text-gray-600 max-w-xl mx-auto">
          Crafted with passion and authentic Vietnamese seasonal ingredients by our world-class chefs.
        </p>

        {/* 3 Pagination Demo Modes Segmented Control */}
        <div className="inline-flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-gray-200 shadow-xs max-w-md mx-auto">
          <Link
            to="/dishes"
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              paginationMode === 'page'
                ? 'bg-[#ba1414] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            📄 Page Numbers
          </Link>
          <Link
            to="/dishes/load-more"
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              paginationMode === 'load-more'
                ? 'bg-[#ba1414] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            ➕ Load More
          </Link>
          <Link
            to="/dishes/infinite-scroll"
            className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              paginationMode === 'infinite-scroll'
                ? 'bg-[#ba1414] text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            📜 Infinite Scroll
          </Link>
        </div>
      </div>

      {/* Server-Side Full-Text Search Input */}
      <div className="max-w-md mx-auto w-full">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm món ăn (PostgreSQL Full-Text Search)..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white border border-gray-300 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ba1414] focus:border-transparent shadow-xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold p-1"
            >
              ✕
            </button>
          )}
        </div>
        {/* Gray Loading indicator below search bar for User Search */}
        {isSearchLoading && (
          <div className="text-gray-500 text-sm font-medium py-1.5 text-center">
            Loading...
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500 mt-1.5 px-1">
          <span>{debouncedSearch ? `Kết quả tìm kiếm cho: "${debouncedSearch}"` : 'Toàn bộ thực đơn B.H.T Diner'}</span>
          <span>Tổng: {totalCount} món</span>
        </div>
      </div>

      {/* Client-Side Category Selection Section */}
      <div className="space-y-3">
        {/* Mobile Dropdown Menu for Category Selection */}
        <div className="sm:hidden flex items-center gap-2 bg-white p-3 rounded-xl border border-gray-300 shadow-xs">
          <Filter className="w-5 h-5 text-[#ba1414]" />
          <label htmlFor="mobile-category" className="sr-only">Choose Category</label>
          <select
            id="mobile-category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-transparent font-semibold text-gray-800 text-sm focus:outline-none cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                Category: {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop / Tablet: Category Buttons arranged in a row */}
        <div className="hidden sm:flex items-center justify-center gap-2.5 flex-wrap">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                  isSelected
                    ? 'bg-[#ba1414] text-white border-[#ba1414] shadow-xs scale-102'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#ba1414] hover:text-[#ba1414]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border-2 border-[#ba1414] rounded-2xl p-6 text-center max-w-lg mx-auto">
          <AlertCircle className="w-10 h-10 text-[#ba1414] mx-auto mb-2" />
          <h2 className="text-lg font-bold text-[#ba1414]">Unable to Load Dishes</h2>
          <p className="text-sm text-gray-700 mt-1">{error}</p>
          <button
            type="button"
            onClick={() => activeQuery.refetch()}
            className="mt-4 px-4 py-2 bg-[#ba1414] text-white text-sm font-medium rounded-lg hover:bg-red-800"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isAnyLoading && !error && displayedDishes.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center max-w-md mx-auto">
          <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-700">No Dishes Found</h2>
          <p className="text-sm text-gray-500 mt-1">
            {debouncedSearch
              ? `Không tìm thấy món ăn nào khớp với "${debouncedSearch}".`
              : `There are currently no dishes available in category "${selectedCategory}".`}
          </p>
        </div>
      )}

      {/* Dishes Grid: 2 Columns */}
      {displayedDishes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayedDishes.map((dish) => (
            <div
              key={dish.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/dishes/${dish.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(`/dishes/${dish.id}`);
                }
              }}
              className="dish-card-button group block text-left rounded-2xl border border-[#ba1414] bg-white p-4 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ba1414] shadow-xs hover:shadow-md"
            >
              <div className="flex flex-col sm:flex-row gap-4 h-full">
                {/* Food Photo: 1:1 ratio */}
                <div className="w-full sm:w-36 md:w-40 sm:shrink-0">
                  <img
                    src={dish.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c'}
                    alt={dish.name}
                    className="w-full aspect-square object-cover rounded-xl shadow-xs group-hover:scale-102 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>

                {/* Dish Info on the right */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h2 className="text-base sm:text-lg font-bold text-gray-900 group-hover:text-[#ba1414] transition-colors line-clamp-1">
                        {dish.name}
                      </h2>
                      <span className="shrink-0 text-base font-extrabold text-[#ba1414]">
                        ${parseFloat(dish.price).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-[#ba1414]">
                        {dish.category}
                      </span>
                      {dish.available ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Available
                        </span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                          Sold Out
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-gray-600 break-words line-clamp-2 mb-3">
                      {dish.description}
                    </p>
                  </div>

                  {/* Chef name and ingredients */}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-1.5 font-medium text-gray-700">
                      <ChefHat className="w-4 h-4 text-[#ba1414]" />
                      <span className="truncate max-w-[150px]">{dish.chef?.name || 'Executive Chef'}</span>
                    </div>

                    {dish.ingredients && dish.ingredients.length > 0 && (
                      <span className="text-gray-400 shrink-0">
                        {dish.ingredients.length} nguyên liệu
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mode 1 Controls: Server-Side Page Numbers */}
      {paginationMode === 'page' && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200">
          <div className="text-xs sm:text-sm text-gray-600">
            Hiển thị trang <span className="font-bold text-gray-900">{urlPage}</span> / <span className="font-bold text-gray-900">{totalPages}</span> (Tổng: {totalCount} món)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={urlPage <= 1}
              onClick={() => handlePageChange(urlPage - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Trước</span>
            </button>

            {/* Render 5 page numbers centered around current page */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p;
              if (totalPages <= 5) {
                p = i + 1;
              } else if (urlPage <= 3) {
                p = i + 1;
              } else if (urlPage >= totalPages - 2) {
                p = totalPages - 4 + i;
              } else {
                p = urlPage - 2 + i;
              }
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePageChange(p)}
                  className={`w-8 h-8 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                    urlPage === p
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
              disabled={urlPage >= totalPages}
              onClick={() => handlePageChange(urlPage + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mode 2 Controls: Load More Button */}
      {paginationMode === 'load-more' && loadMoreQuery.hasNextPage && (
        <div className="text-center pt-6">
          {loadMoreQuery.isFetchingNextPage ? (
            <div className="text-gray-500 text-sm font-medium py-3 text-center">
              Loading...
            </div>
          ) : (
            <button
              type="button"
              onClick={() => loadMoreQuery.fetchNextPage()}
              className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-[#ba1414] text-white font-bold text-sm shadow-md hover:bg-red-800 transition-colors cursor-pointer"
            >
              Xem thêm món ăn (Load More)
            </button>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Đã tải {displayedDishes.length} / {totalCount} món
          </p>
        </div>
      )}

      {/* Mode 3 Sentinel: Infinite Scroll Sentinel Element */}
      {paginationMode === 'infinite-scroll' && (
        <div ref={sentinelRef} className="py-6 text-center space-y-2">
          {infiniteQuery.isFetchingNextPage && (
            <p className="text-gray-500 text-sm font-medium py-3 text-center">
              Loading...
            </p>
          )}
          {infiniteQuery.hasNextPage ? (
            <p className="text-xs text-gray-400">Cuộn xuống để tự động tải thêm món...</p>
          ) : (
            <p className="text-xs text-gray-400 italic">Đã hiển thị toàn bộ {totalCount} món ăn.</p>
          )}
        </div>
      )}
    </div>
  );
}
