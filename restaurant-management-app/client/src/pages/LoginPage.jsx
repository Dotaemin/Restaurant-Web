import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { Lock, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';

function buildActivationUrl(email) {
  const params = new URLSearchParams({ msg: 'activation_required' });
  if (email) params.set('email', email);
  return `/activation?${params.toString()}`;
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const msg = searchParams.get('msg');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [requireCaptcha, setRequireCaptcha] = useState(false);
  const [siteKey, setSiteKey] = useState('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI');
  const [loading, setLoading] = useState(false);
  const recaptchaContainerRef = useRef(null);

  // Phase 2: MFA States
  const [mfaPendingToken, setMfaPendingToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [mfaRemainingAttempts, setMfaRemainingAttempts] = useState(3);
  const [mfaLoading, setMfaLoading] = useState(false);

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

  // Phase 1: Submit Username & Password
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
      if (res.mfaRequired && res.mfaToken) {
        // Switch to Phase 2: MFA Code Verification
        setMfaPendingToken(res.mfaToken);
        setError(null);
      } else {
        window.location.href = '/dishes';
      }
    } else if (res?.requireActivation) {
      navigate(buildActivationUrl(res.email));
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

  // Phase 2: Submit MFA Code or Recovery Code
  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMfaLoading(true);

    const res = await api.verifyMfa({
      mfaToken: mfaPendingToken,
      code: mfaCode,
      isRecoveryCode: useRecoveryCode
    });
    setMfaLoading(false);

    if (res?.ok) {
      window.location.href = '/dishes';
    } else {
      setError(res?.error?.message || 'Verification failed. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto my-8">
      <div className="bg-white rounded-3xl border-2 border-[#ba1414]/20 p-8 shadow-xl">
        {!mfaPendingToken ? (
          // ==================== PHASE 1: LOGIN ====================
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ba1414]/10 text-[#ba1414] flex items-center justify-center text-2xl font-black mb-3">
                <Lock className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-black text-[#ba1414] tracking-tight">Sign In</h1>
              <p className="text-xs text-slate-500 mt-1">Welcome back to B.H.T Diner</p>
            </div>

            {msg === 'unauthenticated' && (
              <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Please sign in to access this feature.</span>
              </div>
            )}

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
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {requireCaptcha && (
                <div className="pt-2 flex flex-col items-center gap-1.5 min-h-[78px]">
                  <span className="text-2xs font-bold text-amber-700">Security verification required</span>
                  <div ref={recaptchaContainerRef} className="g-recaptcha" data-sitekey={siteKey} />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#ba1414] text-white font-black text-sm uppercase tracking-wider hover:bg-red-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loading ? 'Verifying...' : 'Sign In'}</span>
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-2 text-center text-xs text-slate-500 font-medium">
              <Link to="/forget" className="text-[#ba1414] hover:underline font-bold">
                Forgot your password?
              </Link>
              <span>
                Don't have an account?{' '}
                <Link to="/register" className="text-[#ba1414] hover:underline font-bold">
                  Create an account
                </Link>
              </span>
            </div>
          </>
        ) : (
          // ==================== PHASE 2: MFA VERIFICATION ====================
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ba1414]/10 text-[#ba1414] flex items-center justify-center text-2xl font-black mb-3">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-black text-[#ba1414] tracking-tight">Two-Factor Auth</h1>
              <p className="text-xs text-slate-500 mt-1">
                {useRecoveryCode
                  ? 'Enter one of your 10 backup recovery codes'
                  : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>

            {error && (
              <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-sm font-semibold flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  {useRecoveryCode ? 'Recovery Code' : '6-Digit Security Code'}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={useRecoveryCode ? 16 : 6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(useRecoveryCode ? e.target.value.toUpperCase() : e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={useRecoveryCode ? 'XXXX-XXXX' : '123456'}
                  className="w-full text-center tracking-widest text-2xl font-mono px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20"
                />
              </div>

              <button
                type="submit"
                disabled={mfaLoading || !mfaCode.trim()}
                className="w-full py-3 rounded-xl bg-[#ba1414] text-white font-black text-sm uppercase tracking-wider hover:bg-red-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {mfaLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{mfaLoading ? 'Verifying...' : 'Authenticate'}</span>
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col gap-2.5 text-center text-xs">
              <button
                type="button"
                onClick={() => {
                  setUseRecoveryCode((prev) => !prev);
                  setMfaCode('');
                  setError(null);
                }}
                className="text-[#ba1414] hover:underline font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{useRecoveryCode ? 'Use 6-digit Authenticator code' : 'Lost device? Use a backup recovery code'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMfaPendingToken(null);
                  setMfaCode('');
                  setError(null);
                }}
                className="text-slate-500 hover:text-slate-700 font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to credentials</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
