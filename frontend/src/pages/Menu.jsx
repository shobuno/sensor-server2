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
      <div className="p-4">
        <p className="text-lg">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-2">
      <div className="bg-white dark:bg-gray-800 p-8 rounded shadow-md w-full max-w-2xl">
        <h2 className="text-6xl sm:text-5xl font-bold text-center mb-12 text-gray-900 dark:text-white break-words">
          ようこそ、<span className="block">{user.email} さん</span>
        </h2>
        <p className="text-center mb-8 text-4xl sm:text-3xl text-gray-900 dark:text-gray-200">権限: {user.role}</p>

        <ul className="space-y-6">
          <li>
            <button
              onClick={() => navigate('/hydro-sense/latest')}
              className="w-full bg-blue-500 dark:bg-blue-600 text-white py-8 text-5xl sm:text-4xl rounded hover:bg-blue-600 transition"
            >
              💧 Hydro Sense
            </button>
          </li>
          <li>
            <button
              onClick={() => navigate('/auto-mesh/control')}
              className="w-full bg-blue-500 dark:bg-blue-600 text-white py-8 text-5xl sm:text-4xl rounded hover:bg-blue-600 transition"
            >
              ⚙️ AutoMesh
            </button>
          </li>
          {user.role === 'admin' && (
            <li>
              <button
                onClick={() => navigate('/admin')}
                className="w-full bg-yellow-500 dark:bg-yellow-600 text-white py-8 text-5xl sm:text-4xl rounded hover:bg-yellow-600 transition"
              >
                🔒 管理者専用ページ
              </button>
            </li>
          )}
        </ul>

        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="w-full bg-red-500 dark:bg-red-600 text-white py-8 text-5xl sm:text-4xl rounded hover:bg-red-600 transition mt-8"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
