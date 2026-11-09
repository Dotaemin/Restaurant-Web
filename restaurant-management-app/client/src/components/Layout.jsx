import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, UtensilsCrossed, ChefHat, Carrot, BookOpen, LogIn, UserPlus, LogOut, User } from 'lucide-react';
import PageTransition from './PageTransition';
import api from '../api/client';

export default function Layout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Check current user session on mount and route change
    api.getCurrentUser().then((res) => {
      if (res?.ok && res.user) {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(null);
      }
    });
  }, [location.pathname]);

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    navigate('/login?msg=logged_out');
  };

  const navLinks = [
    { to: '/dishes', label: 'Menu', icon: BookOpen },
    { to: '/admin/dishes', label: 'Manage Dishes', icon: UtensilsCrossed },
    { to: '/admin/chefs', label: 'Manage Chefs', icon: ChefHat },
    { to: '/admin/ingredients', label: 'Manage Ingredients', icon: Carrot },
  ];

  const isActive = (path) => {
    if (path === '/dishes') {
      return location.pathname === '/dishes' || location.pathname.startsWith('/dishes/');
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f5f5] text-gray-900">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#ba1414] text-[#f5f5f5] shadow-md border-b border-red-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo & Name */}
            <Link
              to="/dishes"
              className="flex items-center gap-3 font-bold text-xl sm:text-2xl tracking-wide text-[#f5f5f5] hover:opacity-90 transition-opacity"
            >
              <div className="p-2 bg-white/10 rounded-lg">
                <UtensilsCrossed className="w-6 h-6 text-white" />
              </div>
              <span>B.H.T Diner</span>
            </Link>

            {/* Desktop Navigation Links (>=768px) */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      active
                        ? 'bg-white text-[#ba1414] shadow-sm'
                        : 'text-[#f5f5f5] hover:bg-white/15'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}

              <div className="h-5 w-px bg-white/30 mx-2" />

              {/* Auth links (Desktop) */}
              {currentUser ? (
                <div className="flex items-center gap-2 pl-1">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-xs font-bold text-white">
                    <User className="w-3.5 h-3.5" />
                    <span>{currentUser.username}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white/90 border border-white/30 hover:bg-white hover:text-[#ba1414] transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 pl-1">
                  <Link
                    to="/login"
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-[#f5f5f5] hover:bg-white/15 transition-all"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </Link>
                  <Link
                    to="/register"
                    className="flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs font-black bg-white text-[#ba1414] hover:bg-white/90 transition-all shadow-sm"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register</span>
                  </Link>
                </div>
              )}
            </nav>

            {/* Hamburger Button for Mobile (<768px) */}
            <div className="flex md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle Navigation Menu"
                className="p-2 rounded-lg text-[#f5f5f5] hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Slide-Out Drawer / Overlay (<768px) */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Drawer Content */}
            <div className="relative ml-auto w-4/5 max-w-xs bg-[#ba1414] text-[#f5f5f5] h-full shadow-2xl flex flex-col p-6 z-50 animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-white/20 mb-6">
                <div className="flex items-center gap-2 font-bold text-lg">
                  <UtensilsCrossed className="w-5 h-5" />
                  <span>B.H.T Diner</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-white hover:bg-white/20"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <nav className="flex flex-col space-y-2">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(link.to);
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold transition-all ${
                        active
                          ? 'bg-white text-[#ba1414] shadow-sm'
                          : 'text-[#f5f5f5] hover:bg-white/15'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}

                <div className="border-t border-white/20 my-2 pt-2" />

                {currentUser ? (
                  <div className="flex flex-col gap-2">
                    <div className="px-4 py-2 bg-white/10 rounded-lg text-xs font-bold flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>{currentUser.username}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base font-semibold border border-white/30 hover:bg-white hover:text-[#ba1414] transition-all"
                    >
                      <LogOut className="w-5 h-5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base font-semibold border border-white/30 hover:bg-white/10 transition-all"
                    >
                      <LogIn className="w-5 h-5" />
                      <span>Sign In</span>
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base font-black bg-white text-[#ba1414] hover:bg-white/90 transition-all shadow-sm"
                    >
                      <UserPlus className="w-5 h-5" />
                      <span>Register</span>
                    </Link>
                  </div>
                )}
              </nav>

              <div className="mt-auto pt-6 border-t border-white/20 text-xs text-white/70 text-center">
                B.H.T Diner Management
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Page Content with Knife & Fork Transition */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PageTransition>
          {children}
        </PageTransition>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm font-medium text-gray-700">
            © {new Date().getFullYear()} B.H.T Diner. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
