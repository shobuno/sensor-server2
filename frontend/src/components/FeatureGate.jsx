// sensor-server/frontend/src/components/FeatureGate.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';

const roleFeatures = {
  admin: ['todo', 'hydro', 'automesh', 'admin'],
  user:  ['todo', 'hydro', 'automesh'],
  viewer:['hydro'],           // todoは不可の例
  guest: []
};

export default function FeatureGate({ feature, children }) {
  const navigate = useNavigate();
  const role = (localStorage.getItem('role') || '').toLowerCase();
  const features = roleFeatures[role] || [];
  const allowed = features.includes(feature);

  if (allowed) return children;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow w-full max-w-md text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          この機能を利用する権限がありません
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          申し訳ありません。管理者にお問い合わせください。
        </p>
        <button
          onClick={() => navigate('/menu')}
          className="w-full bg-blue-500 dark:bg-blue-600 text-white py-3 rounded-lg hover:opacity-90 transition"
        >
          メニューへ戻る
        </button>
      </div>
    </div>
  );
}
