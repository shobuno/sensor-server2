// sensor-server/frontend/src/RequireAuth.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

function getToken() {
  // localStorage のキー名揺れに両対応
  return localStorage.getItem('authToken') || localStorage.getItem('token') || '';
}

export default function RequireAuth({ children, role }) {
  const location = useLocation();
  const [ok, setOk] = useState(null); // null=判定中 / true=通過 / false=非認証

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = getToken();

      // 1) そもそもトークンなし → 非認証
      if (!token && !document.cookie.includes('auth_token=')) {
        if (!cancelled) setOk(false);
        return;
      }

      // 2) /api/auth/me で最終確認（Cookie or Bearer どちらでも通る）
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!cancelled) setOk(res.ok);
      } catch (e) {
        if (!cancelled) setOk(false);
      }
    })();

    return () => { cancelled = true; };
  }, [location.pathname]);

  // 判定中は軽いプレースホルダ
  if (ok === null) return <div className="p-4 text-gray-500">認証確認中...</div>;

  // 必要ロールが指定されている場合はここでチェック（roles配列対応）
  if (ok && role) {
    try {
      const roles = JSON.parse(localStorage.getItem('roles') || '[]').map(r => String(r).toLowerCase());
      const single = (localStorage.getItem('role') || '').toLowerCase();
      const has = roles.includes(role.toLowerCase()) || single === role.toLowerCase();
      if (!has) return <Navigate to="/menu" replace />;
    } catch {
      // roles が不正なら単純に通さない
      return <Navigate to="/menu" replace />;
    }
  }

  return ok ? children : <Navigate to="/login" replace />;
}
