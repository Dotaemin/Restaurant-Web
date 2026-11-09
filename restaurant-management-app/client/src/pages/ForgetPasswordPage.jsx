import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { KeyRound, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function ForgetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const res = await api.forgetPassword({ email });
    setLoading(false);

    if (res?.ok) {
      setNotice(res.message || 'If your email is registered with us, we have sent instructions to reset your password. Please check your inbox.');
    } else {
      setError(res?.error?.message || 'Unable to submit request. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto my-8">
      <div className="bg-white rounded-3xl border-2 border-[#ba1414]/20 p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ba1414]/10 text-[#ba1414] flex items-center justify-center text-2xl font-black mb-3">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-[#ba1414] tracking-tight">Reset Password</h1>
          <p className="text-xs text-slate-500 mt-1">
            Enter your Gmail address and we will send you a link to reset your password.
          </p>
        </div>

        {notice && (
          <div className="mb-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-semibold flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-sm font-semibold flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
              Gmail Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname@gmail.com"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
            />
            <p className="text-xs text-slate-400 mt-1">
              Password reset instructions will only be delivered to your registered email address.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-[#ba1414] text-white font-black text-sm hover:bg-[#ba1414]/90 active:scale-[0.99] transition-all shadow-md shadow-[#ba1414]/25 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Sending Instructions...' : 'Send Reset Instructions'}</span>
            </button>
          </div>
        </form>

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            Remember your password?{' '}
            <Link to="/login" className="font-bold text-[#ba1414] hover:underline ml-1">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
