import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Mail, AlertCircle, CheckCircle2, RotateCw, Loader2 } from 'lucide-react';

export default function ActivationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const email = searchParams.get('email') || '';
  const initialMsg = searchParams.get('msg');

  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(
    initialMsg === 'otp_sent' ? 'Activation code has been dispatched to your email!' : null
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    let interval = null;
    if (cooldownSeconds > 0) {
      interval = setInterval(() => {
        setCooldownSeconds((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await api.activate({ email, otp });
    setLoading(false);

    if (res?.ok) {
      navigate('/login?msg=activated');
    } else {
      setError(res?.error?.message || 'The activation code is incorrect or has expired. Please check and try again.');
      if (res?.error?.remainingAttempts !== undefined) {
        setRemainingAttempts(res.error.remainingAttempts);
      } else {
        setRemainingAttempts((prev) => Math.max(0, prev - 1));
      }
    }
  };

  const handleResend = async () => {
    if (cooldownSeconds > 0 || resending) return;
    setError(null);
    setResending(true);

    const res = await api.resendActivation({ email });
    setResending(false);

    if (res?.ok) {
      setSuccessMsg('A fresh activation code has been sent to your email.');
      setRemainingAttempts(3);
      setCooldownSeconds(60); // 1-minute cooldown
    } else {
      setError(res?.error?.message || 'Could not resend activation code. Please try again later.');
    }
  };

  return (
    <div className="max-w-md mx-auto my-8">
      <div className="bg-white rounded-3xl border-2 border-[#ba1414]/20 p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl font-black mb-3 border border-amber-200">
            <Mail className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-[#ba1414] tracking-tight">Activate Your Account</h1>
          <p className="text-xs text-slate-500 mt-1">
            We sent a 6-digit verification code to{' '}
            <span className="font-bold text-slate-800">{email || 'your email'}</span>
          </p>
        </div>

        {successMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
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
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1 text-center">
              Enter 6-Digit Code
            </label>
            <input
              type="text"
              name="otp"
              required
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="w-full text-center tracking-[0.5em] text-2xl font-black px-4 py-3 rounded-xl border-2 border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 transition-all text-slate-800 placeholder:text-slate-300 placeholder:tracking-normal placeholder:text-base"
            />
            <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
              <span>Valid for 2 minutes</span>
              <span className="font-bold text-slate-600">{remainingAttempts} attempts remaining</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full py-3 px-4 rounded-xl bg-[#ba1414] text-white font-black text-sm hover:bg-[#ba1414]/90 active:scale-[0.99] transition-all shadow-md shadow-[#ba1414]/25 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Activating...' : 'Activate Account'}</span>
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500 mb-2">Did not receive the code or need a new one?</p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldownSeconds > 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 hover:border-[#ba1414] text-xs font-bold text-slate-700 hover:text-[#ba1414] hover:bg-[#ba1414]/5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
            <span>
              {cooldownSeconds > 0 ? `Resend Code (${cooldownSeconds}s)` : 'Resend Code'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
