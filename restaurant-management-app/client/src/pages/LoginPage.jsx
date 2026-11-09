import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const msg = searchParams.get('msg');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [requireCaptcha, setRequireCaptcha] = useState(false);
  const [siteKey, setSiteKey] = useState('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI');
  const [loading, setLoading] = useState(false);
  const recaptchaContainerRef = useRef(null);

  useEffect(() => {
    api.getAuthConfig().then((res) => {
      if (res?.recaptchaSiteKey) setSiteKey(res.recaptchaSiteKey);
    });
  }, []);

  useEffect(() => {
    if (requireCaptcha && window.grecaptcha && recaptchaContainerRef.current) {
      try {
        if (!recaptchaContainerRef.current.innerHTML) {
          window.grecaptcha.render(recaptchaContainerRef.current, {
            sitekey: siteKey
          });
        }
      } catch (e) {
        // already rendered
      }
    }
  }, [requireCaptcha, siteKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let token = '';
    if (requireCaptcha && window.grecaptcha) {
      token = window.grecaptcha.getResponse();
    }

    const res = await api.login({
      identifier,
      password,
      recaptchaToken: token || (requireCaptcha ? '' : 'test_token'),
      'g-recaptcha-response': token || (requireCaptcha ? '' : 'test_token')
    });
    setLoading(false);

    if (res?.ok) {
      window.location.href = '/dishes';
    } else {
      setError(res?.error?.message || 'Please check your details and try retyping your Email/Username and Password.');
      if (res?.requireCaptcha || res?.status === 429) {
        setRequireCaptcha(true);
      }
      if (window.grecaptcha) {
        window.grecaptcha.reset();
      }
    }
  };

  return (
    <div className="max-w-md mx-auto my-8">
      <div className="bg-white rounded-3xl border-2 border-[#ba1414]/20 p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ba1414]/10 text-[#ba1414] flex items-center justify-center text-2xl font-black mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-[#ba1414] tracking-tight">Sign In</h1>
          <p className="text-xs text-slate-500 mt-1">Welcome back to B.H.T Diner</p>
        </div>

        {msg === 'activated' && (
          <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Your account has been activated! Please sign in.</span>
          </div>
        )}

        {msg === 'password_reset_success' && (
          <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Password updated successfully! Please sign in with your new password.</span>
          </div>
        )}

        {msg === 'logged_out' && (
          <div className="mb-5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold text-center">
            You have signed out successfully.
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
              Username or Gmail Address
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username or email@gmail.com"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
            />
          </div>

          {requireCaptcha && (
            <div className="pt-2 flex flex-col items-center gap-1.5 min-h-[78px]">
              <span className="text-2xs font-bold text-amber-700">Security verification required</span>
              <div ref={recaptchaContainerRef} className="g-recaptcha" data-sitekey={siteKey} />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-[#ba1414] text-white font-black text-sm hover:bg-[#ba1414]/90 active:scale-[0.99] transition-all shadow-md shadow-[#ba1414]/25 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </div>

          <div className="text-center pt-1">
            <Link to="/forget" className="text-xs font-bold text-[#ba1414] hover:underline">
              Forget Password?
            </Link>
          </div>
        </form>

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            Don't have an account yet?{' '}
            <Link to="/register" className="font-bold text-[#ba1414] hover:underline ml-1">
              Create one here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
