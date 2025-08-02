// sensor-server/frontend/src/RequireAuth.jsx

import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getToken } from './auth';

export default function RequireAuth({ children }) {
  const [tokenChecked, setTokenChecked] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const token = getToken();
    setHasToken(!!token);
    setTokenChecked(true);
  }, []);

  if (!tokenChecked) {
    return null; // ✅ 一旦何も表示しない（スケルトン化も可能）
  }

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
