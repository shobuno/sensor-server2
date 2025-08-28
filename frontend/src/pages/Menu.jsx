// sensor-server/frontend/src/pages/Menu.jsx
import { getToken, logout } from '../auth';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Menu() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = getToken();

      // RequireAuthで守られているので、ここでは強制遷移はしない
      // そのまま /auth/me で最終確認（Cookie or Bearer 両対応）
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`認証エラー status=${res.status}`);

        const data = await res.json();

        // role（単体）と roles（配列）の両方を保存（FeatureGate 用）
        const single = String(data.role || '').toLowerCase();
        const rolesArr = Array.isArray(data.roles)
          ? data.roles.map(r => String(r).toLowerCase())
          : (single ? [single] : []);

        if (single) localStorage.setItem('role', single);
        localStorage.setItem('roles', JSON.stringify(rolesArr));

        if (!cancelled) {
          setUser({
            ...data,
            role: single || (rolesArr[0] || ''), // 表示用
            roles: rolesArr,
          });
        }
      } catch (err) {
        console.error('🚨 認証失敗 @Menu:', err);
        logout();
        if (!cancelled) navigate('/login', { replace: true });
      }
    })();

    return () => { cancelled = true; };
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
        <h2 className="text-3xl sm:text-2xl font-bold text-center mb-12 text-gray-900 dark:text-white break-words">
          ようこそ、<span className="block">{user.name} さん</span>
        </h2>

        <p className="text-center mb-8 text-xl sm:text-lg text-gray-900 dark:text-gray-200">
          権限: {user.roles?.join(', ') || user.role}
        </p>

        <ul className="space-y-6">
          <li>
            <button
              onClick={() => navigate('/todo')}
              className="w-full bg-green-500 dark:bg-green-600 text-white py-4 text-2xl sm:text-xl rounded hover:bg-green-600 transition"
            >
              📝 Todo
            </button>
          </li>
          <li>
            <button
              onClick={() => navigate('/hydro-sense/latest')}
              className="w-full bg-blue-500 dark:bg-blue-600 text-white py-4 text-2xl sm:text-xl rounded hover:bg-blue-600 transition"
            >
              💧 Hydro Sense
            </button>
          </li>
          <li>
            <button
              onClick={() => navigate('/auto-mesh/control')}
              className="w-full bg-blue-500 dark:bg-blue-600 text-white py-4 text-2xl sm:text-xl rounded hover:bg-blue-600 transition"
            >
              ⚙️ AutoMesh
            </button>
          </li>
          {(user.roles?.includes('admin') || user.role === 'admin') && (
            <li>
              <button
                onClick={() => navigate('/admin')}
                className="w-full bg-yellow-500 dark:bg-yellow-600 text-white py-4 text-2xl sm:text-xl rounded hover:bg-yellow-600 transition"
              >
                🔒 管理者専用ページ
              </button>
            </li>
          )}
        </ul>

        <button
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
          className="w-full bg-red-500 dark:bg-red-600 text-white py-4 text-2xl sm:text-xl rounded hover:bg-red-600 transition mt-8"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
