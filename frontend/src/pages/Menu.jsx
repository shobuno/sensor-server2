// sensor-server/frontend/src/pages/Menu.jsx

import { getToken, logout } from '../auth';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Menu() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      console.warn('🔒 トークンが無いためログインへリダイレクト');
      navigate('/login');
      return;
    }

    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('認証エラー');
        return res.json();
      })
      .then(data => setUser(data))
      .catch((err) => {
        console.error('🚨 認証失敗:', err);
        logout();
        navigate('/login');
      });
  }, [navigate]);

  if (!user) {
    return (
      <div style={{ padding: 20 }}>
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>ようこそ、{user.email} さん</h2>
      <p>権限: {user.role}</p>

      <ul>
        <li>
          <button onClick={() => navigate('/hydro-sense/latest')}>
            💧 Hydro Sense
          </button>
        </li>
        <li>
          <button onClick={() => navigate('/auto-mesh/control')}>
            ⚙️ AutoMesh
          </button>
        </li>
        {user.role === 'admin' && (
          <li>
            <button onClick={() => navigate('/admin')}>
              🔒 管理者専用ページ
            </button>
          </li>
        )}
      </ul>

      <button onClick={() => {
        logout();
        navigate('/login');
      }}>
        ログアウト
      </button>
    </div>
  );
}
