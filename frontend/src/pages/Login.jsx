// sensor-server/frontend/src/pages/Login.jsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  useEffect(() => {
    //console.log("✅ Login useEffect fired");
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Cookie 方式にも備えて include（同一オリジンなら害なし）
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'ログインに失敗しました');
        return;
      }

      // ① JWT返却（JSON）パターン
      if (data.token) {
        localStorage.setItem('authToken', data.token);
        localStorage.removeItem('token'); // 旧キーを掃除
      }

      // ② Cookieパターン or ①の後続：役割を取得して保存
      const meRes = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: {
          // JWTヘッダ運用でも /me が通るよう付与（Cookie運用なら存在しなくてもOK）
          Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
        },
      });

      if (meRes.ok) {
        const me = await meRes.json();
        // 旧role（単体）も、新roles（配列）もどちらも保存
        if (me.role) localStorage.setItem('role', String(me.role).toLowerCase());
        if (Array.isArray(me.roles)) localStorage.setItem('roles', JSON.stringify(me.roles));
      } else {
        console.warn('⚠️ /auth/me 取得失敗', meRes.status);
      }

      navigate('/menu');
    } catch (err) {
      console.error(err);
      setError('通信エラーが発生しました');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-3xl sm:text-2xl font-bold mb-12 text-center text-gray-900 dark:text-white">ログイン</h2>
        <form onSubmit={handleLogin} className="space-y-10">
          <div>
            <label className="block mb-4 font-medium text-2xl sm:text-xl text-gray-900 dark:text-gray-200">メールアドレス</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-6 py-4 text-2xl sm:text-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          <div>
            <label className="block mb-4 font-medium text-2xl sm:text-xl text-gray-900 dark:text-gray-200">パスワード</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-6 py-4 text-2xl sm:text-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          <button type="submit" className="w-full bg-blue-500 dark:bg-blue-600 text-white py-4 text-2xl sm:text-xl rounded hover:bg-blue-600 transition-colors">
            ログイン
          </button>
        </form>
        {error && <p className="text-red-500 dark:text-red-400 mt-8 text-xl">{error}</p>}
      </div>
    </div>
  );
}
