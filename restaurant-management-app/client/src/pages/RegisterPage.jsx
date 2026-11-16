import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { AlertCircle, UserPlus, Loader2, Eye, EyeOff, ShieldCheck, Copy, Check, AlertTriangle, ArrowRight } from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'VIEWER'
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [siteKey, setSiteKey] = useState('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI');
  const recaptchaContainerRef = useRef(null);

  // Mandatory MFA setup screen (for Chef / Admin)
  const [mfaSetup, setMfaSetup] = useState(null);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    api.getAuthConfig().then((res) => {
      if (res?.recaptchaSiteKey) setSiteKey(res.recaptchaSiteKey);
    });

    const timer = setTimeout(() => {
      if (window.grecaptcha && recaptchaContainerRef.current) {
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
    }, 500);

    return () => clearTimeout(timer);
  }, [siteKey]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let token = '';
    if (window.grecaptcha) {
      token = window.grecaptcha.getResponse();
    }

    const payload = {
      ...formData,
      recaptchaToken: token || 'test_token',
      'g-recaptcha-response': token || 'test_token'
    };

    const res = await api.register(payload);
    setLoading(false);

    if (res?.ok) {
      if (res.mfaSetup) {
        // CHEF or ADMIN: Show QR Code & Recovery codes screen
        setRegisteredEmail(formData.email);
        setMfaSetup(res.mfaSetup);
      } else {
        // VIEWER: Directly proceed to activation
        navigate(`/activation?email=${encodeURIComponent(formData.email)}&msg=otp_sent`);
      }
    } else {
      setError(res?.error?.message || 'Registration could not be completed. Please check your information.');
      if (window.grecaptcha) {
        window.grecaptcha.reset();
      }
    }
  };

  const copyAllRecoveryCodes = () => {
    if (!mfaSetup?.recoveryCodes) return;
    navigator.clipboard.writeText(mfaSetup.recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto my-8">
      <div className="bg-white rounded-3xl border-2 border-[#ba1414]/20 p-8 shadow-xl">
        {!mfaSetup ? (
          // ==================== REGISTRATION FORM ====================
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ba1414]/10 text-[#ba1414] flex items-center justify-center text-2xl font-black mb-3">
                <UserPlus className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-black text-[#ba1414] tracking-tight">Create an Account</h1>
              <p className="text-xs text-slate-500 mt-1">Join B.H.T Diner to access our services</p>
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
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="e.g. johndoe"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Gmail Address
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="yourname@gmail.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
                />
                <p className="text-xs text-slate-400 mt-0.5">Must be an active @gmail.com address to receive your activation code.</p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Account Role
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all bg-white"
                >
                  <option value="VIEWER">Viewer (Menu customer / guest reader)</option>
                  <option value="CHEF">Chef (Create and edit dishes you cook)</option>
                  <option value="ADMIN">Admin (Full system management)</option>
                </select>
                {(formData.role === 'CHEF' || formData.role === 'ADMIN') && (
                  <p className="text-2xs text-amber-700 font-bold mt-1">
                    ℹ️ Chefs & Admins must set up two-factor authentication via QR code upon registration.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Must be ≥8 characters with 1 uppercase, 1 number, and 1 symbol (!, @, #, $, %, ^, &, *, &lt;, &gt;, .).
                </p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-300 focus:outline-none focus:border-[#ba1414] focus:ring-2 focus:ring-[#ba1414]/20 text-sm font-medium transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-col items-center gap-1.5 min-h-[78px]">
                <div ref={recaptchaContainerRef} className="g-recaptcha" data-sitekey={siteKey} />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#ba1414] text-white font-black text-sm uppercase tracking-wider hover:bg-red-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loading ? 'Creating Account...' : 'Register'}</span>
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-500 font-medium">
              Already have an account?{' '}
              <Link to="/login" className="text-[#ba1414] hover:underline font-bold">
                Sign in
              </Link>
            </div>
          </>
        ) : (
          // ==================== MANDATORY MFA SETUP FOR CHEF / ADMIN ====================
          <div>
            <div className="text-center mb-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ba1414]/10 text-[#ba1414] flex items-center justify-center text-2xl font-black mb-2">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Two-Factor Authentication Setup</h1>
              <p className="text-xs text-slate-500 mt-1">
                Mandatory security verification for {formData.role} accounts
              </p>
            </div>

            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200 mb-4">
              <img
                src={mfaSetup.qrCode}
                alt="Authenticator QR Code"
                className="w-44 h-44 rounded-xl border border-white shadow-sm"
              />
              <p className="text-2xs font-mono text-slate-500 mt-2 select-all text-center">
                Manual Key: {mfaSetup.secret}
              </p>
              <p className="text-xs text-slate-600 text-center mt-2 font-medium">
                Scan with Google Authenticator or Microsoft Authenticator.
              </p>
            </div>

            {/* 10 Recovery Codes with STRICT warning: NOT shown again */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-wider">10 Recovery Codes</span>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-2xs font-semibold mb-3">
                <strong>Attention:</strong> These 10 recovery codes are generated <strong>only once</strong>. You will <strong>NOT</strong> be given an option to view them again after leaving this page!
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs font-bold text-center text-slate-800">
                {mfaSetup.recoveryCodes.map((code, idx) => (
                  <div key={idx} className="p-1.5 bg-white rounded-lg border border-slate-200">
                    {code}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={copyAllRecoveryCodes}
                className="w-full mt-2.5 flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {copiedCodes ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCodes ? 'Copied 10 Codes!' : 'Copy All 10 Recovery Codes'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                navigate(`/activation?email=${encodeURIComponent(registeredEmail)}&msg=otp_sent`);
              }}
              className="w-full py-3 rounded-xl bg-[#ba1414] text-white font-black text-sm uppercase tracking-wider hover:bg-red-800 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue to Activation</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
