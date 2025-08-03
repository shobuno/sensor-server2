// apps/hydro-sense/wsHandlers/ws.js

module.exports = function setupHydroWS(ws) {
  // console.log('[HydroSense WS] クライアント接続');

  ws.send(JSON.stringify({ type: 'connected', message: 'HydroSense WebSocket 接続完了' }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
      }

      // 必要なロジックをここに追加（例：グラフ更新要求、設定変更など）

    } catch (e) {
      console.error('[HydroSense WS] 無効なメッセージ:', message);
    }
  });

  ws.on('close', () => {
    console.log('[HydroSense WS] 接続終了');
  });
};
