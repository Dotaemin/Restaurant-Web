import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import BigCutlery from './BigCutlery';

/**
 * PageTransition Component
 * - Big knife and big fork move to the left side of the screen while spinning
 * - Creates a pulling animation pulling the new page into view
 * - Transition main color: #ba1414
 * - Knife and fork color: #f5f5f5
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayLocation, setDisplayLocation] = useState(location);

  const currentPage = new URLSearchParams(location.search).get('page') || '1';

  useEffect(() => {
    const prevPage = new URLSearchParams(displayLocation.search).get('page') || '1';
    const currentSearch = new URLSearchParams(location.search).get('search') || '';
    const prevSearch = new URLSearchParams(displayLocation.search).get('search') || '';

    const pathChanged = location.pathname !== displayLocation.pathname;
    // Page number changed while not in the middle of typing a search query
    const pageChanged = currentPage !== prevPage && currentSearch === prevSearch;

    if (pathChanged || pageChanged) {
      setIsTransitioning(true);
      setDisplayLocation(location);

      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 750);

      return () => clearTimeout(timer);
    } else if (location.search !== displayLocation.search) {
      setDisplayLocation(location);
    }
  }, [location, displayLocation, currentPage]);

  return (
    <div className="relative w-full min-h-[calc(100vh-140px)]">
      {/* Pulling Transition Layer - Rendered via portal on document.body for true fullscreen coverage */}
      {isTransitioning && typeof document !== 'undefined' && createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 w-screen h-screen z-50 overflow-hidden flex items-center justify-center"
        >
          {/* Main Transition Color Background Curtain (#ba1414) pulling across */}
          <div className="absolute inset-0 bg-[#ba1414] transition-curtain shadow-2xl z-30" />

          {/* Big Knife and Fork in #f5f5f5 moving to the left side while spinning */}
          <div className="cutlery-pull-left relative z-40 flex items-center justify-center p-6">
            <BigCutlery className="animate-spin" spinning={false} />
          </div>
        </div>,
        document.body
      )}

      {/* Page Content pulling into view */}
      <div
        key={location.pathname}
        className={isTransitioning ? 'page-transition-content' : ''}
      >
        {children}
      </div>
    </div>
  );
}
