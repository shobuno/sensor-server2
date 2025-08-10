// AutoMesh/backend/ws/automesh-command.js

const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

let commandClients = [];

function setupAutoMeshCommandWSS(wss) {
  wss.on('connection', (ws) => {
    // console.log('🔌 /automesh-command WebSocket接続');

    let serial_number = null;

    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.type === 'command-entry' && data.serial_number) {
          serial_number = data.serial_number;

          // ✅ DBに存在確認
          const check = await db.query(
            `SELECT 1 FROM automesh.devices WHERE serial_number = $1`,
            [serial_number]
          );

          if (check.rowCount === 0) {
            console.warn(`⚠️ DBに登録がないため解除通知を送信: ${serial_number}`);
            notifyCommandUnregistered(serial_number);
            return;
          }

          // 登録成功
          commandClients = commandClients.filter(c => c.serial_number !== serial_number);
          commandClients.push({ serial_number, ws });

          // console.log(`✅ ${serial_number} が command に接続`);
        }

        if (data.type === 'relay-state' && typeof data.relay_index === 'number') {
          updateRelayState(serial_number, data.relay_index, data.state);
        }
      } catch (err) {
        console.warn('❌ command parse エラー:', err);
      }
    });

    ws.on('close', () => {
      commandClients = commandClients.filter(c => c.ws !== ws);
      // console.log(`❌ command 接続切断: ${serial_number}`);
    });
  });
}

function sendCommandToDevice(serial_number, message) {
  const client = commandClients.find(c => c.serial_number === serial_number);
  if (client && client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify(message));
    console.log(`💡 Command送信: ${serial_number}`, message);
  } else {
    console.warn(`⚠️ Command送信失敗: ${serial_number} は未接続`);
  }
}

function notifyCommandUnregistered(serial_number) {
  const client = commandClients.find(c => c.serial_number === serial_number);
  if (client && client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify({
      type: 'unregistered',
      message: '登録が解除されました。不揮発メモリを消去してください。',
    }));
    client.ws.close();
    // console.log(`🔕 Command: 解除通知＆切断: ${serial_number}`);
  } else {
    console.warn(`⚠️ Command: 解除通知対象未接続: ${serial_number}`);
  }

  commandClients = commandClients.filter(c => c.serial_number !== serial_number);
}

function getConnectedCommandSerials() {
  return commandClients.map(c => c.serial_number);
}

let relayStates = {};

function updateRelayState(serial_number, relay_index, state) {
  const key = `${serial_number}-${relay_index}`;
  relayStates[key] = state;
  // console.log(`📥 状態記録: ${key} = ${state}`);
}

function getRelayStates() {
  return Object.entries(relayStates).map(([key, state]) => {
    const parts = key.split('-');
    const relay_index = parseInt(parts.pop());
    const serial_number = parts.join('-');

    return {
      serial_number,
      relay_index,
      state
    };
  });
}

module.exports = {
  setupAutoMeshCommandWSS,
  sendCommandToDevice,
  notifyCommandUnregistered,
  getConnectedCommandSerials,
  updateRelayState,
  getRelayStates,
};
