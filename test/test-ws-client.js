// test/test-ws-client.js

const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ws/automesh');

ws.on('open', () => {
  console.log('✅ WebSocket接続完了');

  // 接続時に serial_number を送信
  ws.send(JSON.stringify({
    type: 'entry',
    serial_number: 'TEST-ESP32-001'
  }));

  console.log('📡 エントリーメッセージ送信完了');
});

ws.on('message', (msg) => {
  try {
    const data = JSON.parse(msg);
    console.log('📨 メッセージ受信:', data);

    if (data.type === 'blink') {
      console.log('💡 受信: 点滅コマンドを受け取りました！');
      // ここにLED点滅処理などESP32側の動作を模擬することも可能
    }

  } catch (err) {
    console.error('❌ 受信メッセージの解析に失敗:', msg.toString());
  }
});

ws.on('close', () => {
  console.log('❌ WebSocket接続が切断されました');
});
