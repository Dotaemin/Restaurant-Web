import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Users, Shield, CheckCircle2, AlertCircle, Loader2, Save, RotateCcw } from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [chefs, setChefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);

  const handleResetMfa = async (user) => {
    if (!window.confirm(`Are you sure you want to reset MFA for user "${user.username}"? They will be required to configure it again upon next login.`)) {
      return;
    }

    setResettingId(user.id);
    setErrorBanner('');
    setSuccessBanner('');

    const res = await api.resetAdminUserMfa(user.id);
    setResettingId(null);

    if (res?.ok) {
      setSuccessBanner(`MFA successfully reset for ${user.username}.`);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, mfaEnabled: false } : u))
      );
    } else {
      setErrorBanner(res?.error?.message || `Failed to reset MFA for ${user.username}.`);
    }
  };
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // Local draft changes: { [userId]: { role, chefId } }
  const [userDrafts, setUserDrafts] = useState({});
  // Step-up MFA prompt shown when promoting a user to ADMIN: { user, payload } | null
  const [mfaPrompt, setMfaPrompt] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setErrorBanner('');
    try {
      const [usersRes, chefsRes, meRes] = await Promise.all([
        api.getAdminUsers(),
        api.getChefs({ pageSize: 100 }),
        api.getCurrentUser()
      ]);

      if (usersRes?.ok) {
        setUsers(usersRes.data || []);
        const drafts = {};
        (usersRes.data || []).forEach((u) => {
          drafts[u.id] = {
            role: u.role,
            chefId: u.chefId ? String(u.chefId) : ''
          };
        });
        setUserDrafts(drafts);
      } else {
        setErrorBanner(usersRes?.error?.message || 'Failed to load user accounts.');
      }

      if (chefsRes?.ok) {
        setChefs(chefsRes.data?.items || chefsRes.data || []);
      }

      if (meRes?.ok) {
        setCurrentUser(meRes.user);
      }
    } catch (err) {
      setErrorBanner('Failed to connect to users service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFieldChange = (userId, field, value) => {
    setUserDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value
      }
    }));
  };

    const saveUser = async (user, payload) => {
    setErrorBanner('');
    setSuccessBanner('');
    setSavingId(user.id);

    const res = await api.updateAdminUser(user.id, payload);
    setSavingId(null);

    if (res?.ok) {
      setMfaPrompt(null);
      setSuccessBanner(res.message || `User "${user.username}" was updated successfully.`);
      loadData();
      return;
    }

    const code = res?.error?.code;
    const isMfaError = ['MFA_REQUIRED', 'MFA_NOT_ENABLED', 'MFA_LOCKED', 'INVALID_MFA_CODE'].includes(code);
    if (payload.mfaCode && isMfaError) {
      // keep the dialog open so the admin can retry
      setMfaError(res?.error?.message || 'Verification failed.');
    } else {
      setMfaPrompt(null);
      setErrorBanner(res?.error?.message || 'Failed to update user.');
    }
  };

  const handleSaveUser = async (user) => {
    const draft = userDrafts[user.id];
    if (!draft) return;

    const payload = {
      role: draft.role,
      chefId: draft.chefId ? parseInt(draft.chefId, 10) : null
    };

    // Granting the ADMIN role requires MFA confirmation from the acting admin
    if (draft.role === 'ADMIN' && user.role !== 'ADMIN') {
      setMfaCode('');
      setMfaError('');
      setMfaPrompt({ user, payload });
      return;
    }

    await saveUser(user, payload);
  };

  const handleConfirmMfa = async () => {
    if (!mfaPrompt) return;
    if (!mfaCode.trim()) {
      setMfaError('Enter your 6-digit authenticator code or a recovery code.');
      return;
    }
    setMfaError('');
    await saveUser(mfaPrompt.user, { ...mfaPrompt.payload, mfaCode: mfaCode.trim() });
  };

  const getRoleBadge = (r) => {
    switch (r) {
      case 'ADMIN': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'CHEF': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#ba1414] animate-spin" />
        <span className="text-sm font-semibold text-slate-500">Loading user accounts...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-[#ba1414]" />
            <span>Manage User Accounts</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Assign user roles (Viewer, Chef, Admin) and link Chef accounts to restaurant kitchen profiles.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {errorBanner && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-2xs uppercase tracking-wider text-slate-500 font-black border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Current Status</th>
                <th className="py-3.5 px-4">Role Assignment</th>
                <th className="py-3.5 px-4">Linked Chef Profile</th>
                <th className="py-3.5 px-4">MFA Active</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {users.map((user) => {
                const draft = userDrafts[user.id] || { role: user.role, chefId: user.chefId || '' };
                const isSelf = currentUser?.id === user.id;
                const isModified = draft.role !== user.role || (draft.chefId ? parseInt(draft.chefId, 10) : null) !== user.chefId;

                return (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{user.username}</div>
                      <div className="text-2xs text-slate-400">{user.email}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-2xs font-black uppercase ${
                        user.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {user.status}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <select
                        value={draft.role}
                        disabled={isSelf}
                        onChange={(e) => handleFieldChange(user.id, 'role', e.target.value)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                          isSelf
                            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-white border-slate-300 focus:outline-none focus:border-[#ba1414]'
                        }`}
                      >
                        <option value="VIEWER">VIEWER</option>
                        <option value="CHEF">CHEF</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      {isSelf && (
                        <span className="block text-3xs text-slate-400 mt-0.5">Cannot change self</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <select
                        value={draft.chefId}
                        onChange={(e) => handleFieldChange(user.id, 'chefId', e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:border-[#ba1414] max-w-[200px]"
                      >
                        <option value="">(None - Not linked)</option>
                        {chefs.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.id} - {c.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-4">
                      {user.mfaEnabled ? (
                        <span className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <Shield className="w-3 h-3 text-emerald-600" />
                          <span>Enabled</span>
                        </span>
                      ) : (
                        <span className="text-2xs text-slate-400 font-medium">Disabled</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {user.mfaEnabled && (
                        <button
                          type="button"
                          onClick={() => handleResetMfa(user)}
                          disabled={resettingId === user.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-2xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer mr-2 disabled:opacity-50"
                          title="Reset MFA configuration & recovery codes"
                        >
                          {resettingId === user.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          <span>Reset MFA</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSaveUser(user)}
                        disabled={savingId === user.id || !isModified}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                          isModified
                            ? 'bg-[#ba1414] text-white hover:bg-red-800'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {savingId === user.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Save</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
            {/* Step-up MFA dialog (promoting a user to ADMIN) */}
      {mfaPrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMfaPrompt(null);
          }}
        >
          <div className="bg-white rounded-2xl border-2 border-[#ba1414] p-6 shadow-2xl max-w-sm w-full space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#ba1414]" />
              <h3 className="font-bold text-lg text-[#ba1414]">Confirm with MFA</h3>
            </div>
            <p className="text-xs text-slate-600">
              You are granting the <span className="font-bold">ADMIN</span> role to{' '}
              <span className="font-bold">{mfaPrompt.user.username}</span>. Enter the 6-digit code from your
              authenticator app (or a recovery code) to continue.
            </p>
            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmMfa();
              }}
              placeholder="123456 or A7B29F-4D31C8"
              autoFocus
              autoComplete="one-time-code"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#ba1414]"
            />
            {mfaError && (
              <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{mfaError}</span>
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMfaPrompt(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMfa}
                disabled={savingId === mfaPrompt.user.id}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#ba1414] hover:bg-red-800 disabled:opacity-40 cursor-pointer"
              >
                {savingId === mfaPrompt.user.id ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
