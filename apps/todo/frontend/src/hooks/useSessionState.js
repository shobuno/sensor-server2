// sensor-server/apps/todo/frontend/src/hooks/useSessionState.js

import { useEffect, useRef, useState } from "react";

/**
 * useSessionState
 * - sessionStorage に JSON で保存/復元する useState 互換フック
 * - 初回は initialValue、以降は保存済み値を復元
 */
export default function useSessionState(key, initialValue) {
  const isFirst = useRef(true);

  // 初期化（sessionStorage を優先）
  const [state, setState] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // 変更を保存（初回の setState はスキップ）
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  return [state, setState];
}
