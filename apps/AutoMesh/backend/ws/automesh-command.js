// AutoMesh/backend/ws/automesh-command.js

const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

const { v4: uuid } = require('uuid');
let commandClients = [];
const pending = new Map(); // request_id -> { resolve, timer }


// 装置に get-status を送り、status 応答を待つ
async function queryStatus(serial, timeoutMs = 1500) {
  const c = commandClients.find(x => x.serial_number === serial);
  if (!c || c.ws?.readyState !== 1) return { serial_number: serial, online: false };

  const request_id = uuid();
  const payload = { type: 'get-status', request_id };

  const p = new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(request_id);
      resolve({ serial_number: serial, online: true, timeout: true });
    }, timeoutMs);
    pending.set(request_id, { resolve, timer });
  });

  c.ws.send(JSON.stringify(payload));
  const resp = await p;               // { type:'status', led_brightness, ... }
  return { ...resp, online: true };
}
module.exports.queryStatus = queryStatus;

// 受信メッセージで pending を解決する関数
function handleDeviceMessage(serial, msg) {
  // 既存の処理はそのまま…

  if (msg.type === 'status' && msg.request_id && pending.has(msg.request_id)) {
    const { resolve, timer } = pending.get(msg.request_id);
    clearTimeout(timer);
    pending.delete(msg.request_id);
    resolve({ serial_number: serial, ...msg }); // 呼び出し側に返す
  }
}
module.exports.handleDeviceMessage = handleDeviceMessage;

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

        // ★ 追加: 常にデバイスメッセージとしても処理（status 応答の解決など）
        if (serial_number) {
          handleDeviceMessage(serial_number, data);
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
    // console.log(`💡 Command送信: ${serial_number}`, message);
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
  queryStatus,
  handleDeviceMessage,
};
