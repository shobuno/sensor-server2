// ws/automesh.js
const WebSocket = require('ws');

const connectedDevices = new Map(); // serial_number -> ws

function setupAutoMeshWebSocket(server, broadcastToClients) {
  const wss = new WebSocket.Server({ noServer: true });

  wss.on('connection', (ws) => {
    let serial = null;

    // 👇 接続直後に1回、現在のデバイス一覧を送信
    ws.send(JSON.stringify(getCurrentDevices()));

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'entry' && data.serial_number) {
          serial = data.serial_number;
          connectedDevices.set(serial, ws);
          broadcastToClients(getCurrentDevices());

        } else if (data.type === 'blink-request' && data.serial_number) {
          // console.log(`🔔 点滅リクエスト受信: ${data.serial_number}`);
          const deviceWs = connectedDevices.get(data.serial_number);
          if (deviceWs) {
            deviceWs.send(JSON.stringify({ type: 'blink' }));
          }
        }
      } catch (e) {
        console.error('Invalid message:', msg);
      }
    });

    ws.on('close', () => {
      if (serial && connectedDevices.has(serial)) {
        connectedDevices.delete(serial);
        broadcastToClients(getCurrentDevices());
      }
    });
  });

  // HTTP upgrade対応
  server.on('upgrade', (req, socket, head) => {
    const { url } = req;
    if (url === '/ws/automesh') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  function getCurrentDevices() {
    return [...connectedDevices.keys()].map((serial_number) => ({
      serial_number,
      connected: true
    }));
  }

  return {
    getCurrentDevices,
    sendToDevice: (serial, messageObj) => {
      const deviceWs = connectedDevices.get(serial);
      if (deviceWs) {
        deviceWs.send(JSON.stringify(messageObj));
      }
    }
  };
}

module.exports = setupAutoMeshWebSocket;
