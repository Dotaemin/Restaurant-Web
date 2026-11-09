import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { AlertCircle, UserPlus, Loader2, Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [siteKey, setSiteKey] = useState('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI');
  const recaptchaContainerRef = useRef(null);

  useEffect(() => {
    // Fetch dynamic site key if available
    api.getAuthConfig().then((res) => {
      if (res?.recaptchaSiteKey) setSiteKey(res.recaptchaSiteKey);
    });

    // Render reCAPTCHA if grecaptcha exists
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
      navigate(`/activation?email=${encodeURIComponent(formData.email)}&msg=otp_sent`);
    } else {
      setError(res?.error?.message || 'Registration could not be completed. Please check your information.');
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
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              At least 8 characters, with 1 uppercase letter, 1 number, and 1 special symbol (!, @, #, $, %, ^, &, *, &lt;, &gt;, .).
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
                title={showConfirmPassword ? 'Hide password' : 'Show password'}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-center min-h-[78px]">
            <div ref={recaptchaContainerRef} className="g-recaptcha" data-sitekey={siteKey} />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-[#ba1414] text-white font-black text-sm hover:bg-[#ba1414]/90 active:scale-[0.99] transition-all shadow-md shadow-[#ba1414]/25 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Registering...' : 'Register'}</span>
            </button>
          </div>
        </form>

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-[#ba1414] hover:underline ml-1">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
