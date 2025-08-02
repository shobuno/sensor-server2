// sensor-server/frontend/src/pages/VerifyEmail.jsx

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const token = searchParams.get('token');

  const hasVerified = useRef(false); // 実行済み判定用（useRefなら再レンダリングしない）

  useEffect(() => {
    const verify = async () => {
      if (hasVerified.current) return; // 二重実行防止
      hasVerified.current = true;

      if (!token) {
        setStatus('error');
        setMessage('❌ トークンが見つかりません');
        return;
      }

      try {
        const res = await fetch(`/api/email/verify-email?token=${token}`);
        const contentType = res.headers.get('content-type');

        if (!res.ok) {
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            setStatus('error');
            setMessage(`❌ ${data.error || '認証に失敗しました'}`);
          } else {
            setStatus('error');
            setMessage('❌ サーバーから不正な応答がありました');
          }
        } else {
          const data = await res.json();
          setStatus('success');
          setMessage(`✅ ${data.message || 'メール認証が完了しました！ログインしてください。'}`);
        }
      } catch (err) {
        console.error('認証エラー', err);
        setStatus('error');
        setMessage('❌ サーバーエラーが発生しました');
      }
    };

    verify();
  }, [token]);

  return (
    <div style={{ padding: 20 }}>
      <h2>メール認証</h2>
      {status === 'loading' && <p>認証処理中...</p>}
      {status !== 'loading' && <p>{message}</p>}
    </div>
  );
}
