import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, UtensilsCrossed, ChefHat, Carrot, BookOpen, LogIn, UserPlus,
  LogOut, User, Users, ShieldCheck, ShieldAlert, Check, Copy, AlertTriangle, KeyRound
} from 'lucide-react';
import PageTransition from './PageTransition';
import api from '../api/client';

export default function Layout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [avatarDropdownOpen, setAvatarDropdownOpen] = useState(false);

  // Viewer MFA Modal states (Enable)
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState(null);
  const [mfaCodeInput, setMfaCodeInput] = useState('');
  const [mfaConfirmError, setMfaConfirmError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Viewer MFA Modal states (Disable)
  const [mfaDisableModalOpen, setMfaDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  const dropdownRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const loadCurrentUser = () => {
    api.getCurrentUser().then((res) => {
      if (res?.ok && res.user) {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(null);
      }
    });
  };

  useEffect(() => {
    loadCurrentUser();
  }, [location.pathname]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setAvatarDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setAvatarDropdownOpen(false);
    navigate('/login?msg=logged_out');
  };

  // VIEWER MFA Toggle Handler
  const handleMfaToggle = async () => {
    if (!currentUser) return;

    if (currentUser.mfaEnabled) {
      // Disable MFA: Open modal requesting password and current code
      setDisablePassword('');
      setDisableCode('');
      setDisableError('');
      setMfaDisableModalOpen(true);
    } else {
      // Enable MFA: Start setup modal
      setMfaLoading(true);
      setMfaConfirmError('');
      setRecoveryCodes(null);
      setMfaCodeInput('');
      const res = await api.setupMfa();
      setMfaLoading(false);
      if (res?.ok) {
        setMfaSetupData(res);
        setMfaModalOpen(true);
      } else {
        alert(res?.error?.message || 'Failed to start MFA setup.');
      }
    }
  };

  // Disable MFA with password and code
  const handleDisableMfa = async (e) => {
    e.preventDefault();
    if (!disablePassword || !disableCode) return;

    setDisableLoading(true);
    setDisableError('');

    const res = await api.disableMfa({
      password: disablePassword,
      code: disableCode
    });
    setDisableLoading(false);

    if (res?.ok) {
      setCurrentUser((prev) => ({ ...prev, mfaEnabled: false }));
      setMfaDisableModalOpen(false);
      setDisablePassword('');
      setDisableCode('');
    } else {
      setDisableError(res?.error?.message || 'Failed to disable MFA. Please verify your credentials.');
    }
  };

  // Confirm MFA setup with code
  const handleConfirmMfa = async (e) => {
    e.preventDefault();
    if (!mfaSetupData || !mfaCodeInput) return;

    setMfaLoading(true);
    setMfaConfirmError('');
    const res = await api.confirmMfa({
      secret: mfaSetupData.secret,
      code: mfaCodeInput
    });
    setMfaLoading(false);

    if (res?.ok) {
      setRecoveryCodes(res.recoveryCodes);
      setCurrentUser((prev) => ({ ...prev, mfaEnabled: true }));
    } else {
      setMfaConfirmError(res?.error?.message || 'Verification failed. Please check the code.');
    }
  };

  const copyAllRecoveryCodes = () => {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  // Nav Links based on Role:
  // - Guest/Viewer: only Menu
  // - Chef: Menu, Manage Dishes, Manage Chefs, Manage Ingredients
  // - Admin: Menu, Manage Dishes, Manage Chefs, Manage Ingredients, User Accounts
  const role = currentUser?.role;
  const isChef = role === 'CHEF';
  const isAdmin = role === 'ADMIN';

  const navLinks = [
    { to: '/dishes', label: 'Menu', icon: BookOpen }
  ];

  if (isChef || isAdmin) {
    navLinks.push(
      { to: '/admin/dishes', label: 'Manage Dishes', icon: UtensilsCrossed },
      { to: '/admin/chefs', label: 'Manage Chefs', icon: ChefHat },
      { to: '/admin/ingredients', label: 'Manage Ingredients', icon: Carrot }
    );
  }

  if (isAdmin) {
    navLinks.push(
      { to: '/admin/users', label: 'User Accounts', icon: Users }
    );
  }

  const isActive = (path) => {
    if (path === '/dishes') {
      return location.pathname === '/dishes' || location.pathname.startsWith('/dishes/');
    }
    return location.pathname.startsWith(path);
  };

  const getRoleBadgeColor = (r) => {
    switch (r) {
      case 'ADMIN': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'CHEF': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
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

            {/* Desktop Navigation Links */}
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

              {/* Logged In: Account Avatar & Popdown Dropdown */}
              {currentUser ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setAvatarDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all cursor-pointer border border-white/20 shadow-xs"
                    aria-label="Account Menu"
                  >
                    <div className="w-7 h-7 rounded-full bg-white text-[#ba1414] flex items-center justify-center font-black text-xs shadow-xs">
                      {currentUser.username ? currentUser.username.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                    </div>
                    <span className="text-xs font-bold">{currentUser.username}</span>
                    <span className="text-2xs uppercase px-1.5 py-0.5 rounded-md bg-white/20 font-black text-white/90">
                      {currentUser.role}
                    </span>
                  </button>

                  {/* Popdown Dropdown Window */}
                  {avatarDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-800">
                      <div className="px-4 py-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900">{currentUser.username}</span>
                          <span className={`text-2xs font-black uppercase px-2 py-0.5 rounded-full border ${getRoleBadgeColor(currentUser.role)}`}>
                            {currentUser.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{currentUser.email}</p>
                      </div>

                      {/* VIEWER MFA Toggle Option */}
                      {currentUser.role === 'VIEWER' && (
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {currentUser.mfaEnabled ? (
                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <ShieldAlert className="w-4 h-4 text-slate-400" />
                              )}
                              <span className="text-xs font-bold text-slate-800">MFA</span>
                            </div>

                            {/* Switch Toggle */}
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(currentUser.mfaEnabled)}
                                onChange={handleMfaToggle}
                                disabled={mfaLoading}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#ba1414]"></div>
                            </label>
                          </div>
                          <p className="text-2xs text-slate-500 mt-1">
                            {currentUser.mfaEnabled ? 'Two-step verification is active.' : 'Add authenticator verification.'}
                          </p>
                        </div>
                      )}

                      {/* Sign Out Button */}
                      <div className="pt-2 px-2">
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
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

            {/* Hamburger Button for Mobile */}
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

        {/* Mobile Slide-Out Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />

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
                    <div className="px-4 py-2.5 bg-white/10 rounded-xl flex items-center justify-between text-xs font-bold">
                      <span>{currentUser.username}</span>
                      <span className="uppercase text-2xs px-2 py-0.5 rounded-full bg-white/20">
                        {currentUser.role}
                      </span>
                    </div>

                    {currentUser.role === 'VIEWER' && (
                      <div className="px-4 py-2.5 bg-white/10 rounded-xl flex items-center justify-between text-xs font-bold">
                        <span>MFA</span>
                        <button
                          type="button"
                          onClick={handleMfaToggle}
                          className="text-2xs px-2.5 py-1 rounded-lg bg-white text-[#ba1414] font-black"
                        >
                          {currentUser.mfaEnabled ? 'Turn Off' : 'Turn On'}
                        </button>
                      </div>
                    )}

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
            </div>
          </div>
        )}
      </header>

      {/* Main Page Content */}
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

      {/* VIEWER MFA SETUP MODAL */}
      {mfaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {!recoveryCodes ? (
              // Step 1: Scan QR & Enter 6-digit verification code
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#ba1414]/10 text-[#ba1414]">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900">Set Up Multi-Factor Auth</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMfaModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs text-slate-600 mb-4">
                  Scan this QR code with <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone.
                </p>

                {mfaSetupData?.qrCode && (
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200 mb-4">
                    <img
                      src={mfaSetupData.qrCode}
                      alt="TOTP QR Code"
                      className="w-44 h-44 rounded-xl border border-white shadow-sm"
                    />
                    <span className="text-2xs font-mono text-slate-500 mt-2 select-all text-center">
                      Manual Secret: {mfaSetupData.secret}
                    </span>
                  </div>
                )}

                {mfaConfirmError && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold">
                    {mfaConfirmError}
                  </div>
                )}

                <form onSubmit={handleConfirmMfa} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">
                      Enter 6-Digit Code
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={mfaCodeInput}
                      onChange={(e) => setMfaCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="123456"
                      className="w-full text-center tracking-widest text-xl font-mono px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMfaModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={mfaLoading || mfaCodeInput.length !== 6}
                      className="flex-1 py-2.5 rounded-xl bg-[#ba1414] text-white font-bold text-xs hover:bg-red-800 transition-colors disabled:opacity-50"
                    >
                      {mfaLoading ? 'Verifying...' : 'Verify & Enable'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              // Step 2: Display 10 Recovery Codes with STRICT warning: cannot view again!
              <div>
                <div className="flex items-center gap-2.5 mb-3 text-amber-700">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">Save Your Recovery Codes</h3>
                </div>

                <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold">
                  <strong>Important:</strong> These 10 recovery codes are displayed <strong>only once</strong> and cannot be viewed again. Please save them somewhere secure.
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 mb-4 font-mono text-xs text-center font-bold text-slate-800">
                  {recoveryCodes.map((code, idx) => (
                    <div key={idx} className="p-1.5 bg-white rounded-lg border border-slate-200">
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={copyAllRecoveryCodes}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-100 transition-colors"
                  >
                    {copiedCodes ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCodes ? 'Copied to Clipboard!' : 'Copy All 10 Codes'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaModalOpen(false);
                      setRecoveryCodes(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#ba1414] text-white font-bold text-xs hover:bg-red-800 transition-colors"
                  >
                    I Have Safely Saved My Codes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disable MFA Modal */}
      {mfaDisableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Disable Two-Factor Auth</h3>
                <p className="text-2xs text-slate-500">Requires verification to disable</p>
              </div>
            </div>

            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
              Disabling MFA reduces your account security. You must confirm your password and enter an active verification code or backup recovery code.
            </div>

            {disableError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-100 text-rose-800 text-xs font-semibold">
                {disableError}
              </div>
            )}

            <form onSubmit={handleDisableMfa} className="space-y-3.5">
              <div>
                <label className="block text-2xs font-black uppercase text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm"
                />
              </div>

              <div>
                <label className="block text-2xs font-black uppercase text-slate-700 mb-1">
                  6-Digit TOTP or Recovery Code
                </label>
                <input
                  type="text"
                  required
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456 or XXXX-XXXX"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-mono text-center tracking-widest"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMfaDisableModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disableLoading || !disablePassword || !disableCode}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {disableLoading ? 'Verifying...' : 'Disable MFA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
