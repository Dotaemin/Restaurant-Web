import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import BigCutlery from './BigCutlery';

/**
 * LoadHandler Component
 * - Uses React Portal (document.body) to guarantee 100% coverage of the entire screen
 *   unaffected by any ancestor transforms, clip-paths, or max-width containers.
 * - Encloses the big spinning cutlery AND all loading text inside a unified loading area
 *   so text never falls out.
 * - Disables ANY button that can be pressed until loading completes.
 */
export default function LoadHandler({ loading, message = 'Loading, please wait...' }) {
  useEffect(() => {
    if (!loading) return;

    // Query and disable all buttons and interactive elements across the entire page
    const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]');
    const prevStates = new Map();

    buttons.forEach((btn) => {
      prevStates.set(btn, btn.disabled);
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    });

    // Also disable pointer events on all anchor links to prevent click-away
    const links = document.querySelectorAll('a');
    links.forEach((link) => {
      link.style.pointerEvents = 'none';
      link.style.cursor = 'not-allowed';
    });

    // Prevent background scrolling while loading overlay is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      // Re-enable buttons and restore states after loading completes
      buttons.forEach((btn) => {
        if (btn) {
          btn.disabled = prevStates.get(btn) || false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        }
      });
      links.forEach((link) => {
        if (link) {
          link.style.pointerEvents = '';
          link.style.cursor = '';
        }
      });
      document.body.style.overflow = originalOverflow;
    };
  }, [loading]);

  if (!loading || typeof document === 'undefined') return null;

  // Render directly into document.body to break out of all parent containers and CSS stacking contexts
  return createPortal(
    <div
      role="alert"
      aria-busy="true"
      aria-label={message}
      className="fixed inset-0 w-screen h-screen min-h-screen z-[99999] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md select-none cursor-wait p-4 overflow-y-auto"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Unified Loading Area Card: keeps all cutlery and text firmly inside */}
      <div className="relative flex flex-col items-center justify-center text-center p-8 sm:p-10 max-w-md w-full mx-auto rounded-3xl bg-[#ba1414] border-2 border-[#f5f5f5]/40 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Loading Animation: A big knife and a big fork spinning */}
        <div className="flex items-center justify-center p-2">
          <BigCutlery className="animate-spin-big-cutlery" spinning={false} />
        </div>

        {/* Loading Text - Securely enclosed inside the loading area card */}
        <div className="space-y-1.5 w-full">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#f5f5f5] tracking-wide drop-shadow-sm">
            B.H.T Diner
          </h2>
          <p className="text-base sm:text-lg font-medium text-[#f5f5f5]/95 break-words px-2">
            {message}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
