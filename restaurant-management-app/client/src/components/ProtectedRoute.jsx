import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import api from '../api/client';
import { Loader2 } from 'lucide-react';

// roles (optional): e.g. ['CHEF', 'ADMIN']. If omitted, any signed-in active user may enter.
export default function ProtectedRoute({ roles }) {
  const [authState, setAuthState] = useState({ loading: true, user: null });

  useEffect(() => {
    let isMounted = true;

    api.getCurrentUser().then((res) => {
      if (!isMounted) return;
      setAuthState({ loading: false, user: res?.ok && res.user ? res.user : null });
    }).catch(() => {
      if (!isMounted) return;
      setAuthState({ loading: false, user: null });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (authState.loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#ba1414] animate-spin" />
        <span className="text-sm font-semibold text-slate-500">Checking credentials...</span>
      </div>
    );
  }

  const { user } = authState;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (String(user.status).toUpperCase() === 'PENDING') {
    return <Navigate to="/activation?msg=activation_required" replace />;
  }

  if (roles && !roles.includes(String(user.role).toUpperCase())) {
    return <Navigate to="/dishes" replace />;
  }

  return <Outlet context={{ user }} />;
}