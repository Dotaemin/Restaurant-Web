import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await api.resetPassword({ token, password, confirmPassword });
    setLoading(false);

    if (res?.ok) {
      navigate('/login?msg=password_reset_success');
    } else {
      setError(res?.error?.message || 'Could not update password. Link may have expired.');
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto my-8">
        <div className="bg-white rounded-3xl border-2 border-[#ba1414]/20 p-8 shadow-xl text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invalid Reset Link</h1>
          <p className="text-sm text-slate-600 mb-6">
            A password reset token is required. Please check your email or request a new reset link.
          </p>
          <Link
            to="/forget"
            className="inline-block px-5 py-2.5 rounded-xl bg-[#ba1414] text-white font-bold text-sm"
          >
            Request New Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-8">
      <div className="bg-white rounded-3xl border-2 border-[#ba1414]/20 p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ba1414]/10 text-[#ba1414] flex items-center justify-center text-2xl font-black mb-3">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-[#ba1414] tracking-tight">Create New Password</h1>
          <p className="text-xs text-slate-500 mt-1">Please enter and confirm your new password below.</p>
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-sm font-semibold flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">
              At least 8 characters, with 1 uppercase letter, 1 number, and 1 special symbol (!, @, #, $, %, ^, &, *, &lt;, &gt;, .).
            </p>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-[#ba1414] text-white font-black text-sm hover:bg-[#ba1414]/90 active:scale-[0.99] transition-all shadow-md shadow-[#ba1414]/25 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Updating Password...' : 'Update Password & Sign In'}</span>
            </button>
          </div>
        </form>

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            Changed your mind?{' '}
            <Link to="/login" className="font-bold text-[#ba1414] hover:underline ml-1">
              Cancel and Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
