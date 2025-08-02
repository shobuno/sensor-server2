// sensor-server/frontend/src/AdminOnly.jsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getToken, logout } from './auth';

export default function AdminOnly({ children }) {
  const [authorized, setAuthorized] = useState(null); // null = ロード中

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthorized(false);
      return;
    }

    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('認証失敗');
        return res.json();
      })
      .then((user) => {
        if (user.role === 'admin') {
          setAuthorized(true);
        } else {
          setAuthorized(false);
        }
      })
      .catch(() => {
        logout();
        setAuthorized(false);
      });
  }, []);

  if (authorized === null) return <p>認証中...</p>;
  if (authorized === false) return <Navigate to="/menu" replace />;

  return children;
}
