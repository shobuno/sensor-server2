// sensor-server/frontend/src/pages/Login.jsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  useEffect(() => {
    console.log("✅ Login useEffect fired");
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
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ログインに失敗しました');
        return;
      }

      localStorage.setItem('token', data.token);
      navigate('/menu');
    } catch (err) {
      setError('通信エラーが発生しました');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-6xl sm:text-5xl font-bold mb-12 text-center text-gray-900 dark:text-white">ログイン</h2>
        <form onSubmit={handleLogin} className="space-y-10">
          <div>
            <label className="block mb-4 font-medium text-4xl sm:text-3xl text-gray-900 dark:text-gray-200">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-6 py-6 text-4xl sm:text-3xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block mb-4 font-medium text-4xl sm:text-3xl text-gray-900 dark:text-gray-200">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-6 py-6 text-4xl sm:text-3xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 dark:bg-blue-600 text-white py-6 text-4xl sm:text-3xl rounded hover:bg-blue-600 transition-colors"
          >
            ログイン
          </button>
        </form>
        {error && <p className="text-red-500 dark:text-red-400 mt-8 text-2xl">{error}</p>}
      </div>
    </div>
  );
}
