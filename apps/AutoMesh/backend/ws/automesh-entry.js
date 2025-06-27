//AutoMesh/backend/ws/automesh-entry.js

const path = require('path');
const db = require(path.resolve(__dirname, '../config/db'));

let entryClients = []; // [{ serial_number, ws }]
let entryDevices = []; // [{ serial_number }]

function setupAutoMeshEntryWSS(server) {
  const WebSocket = require("ws");
  const wss = new WebSocket.Server({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/automesh-entry") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (ws) => {
    console.log("🔌 ESP32接続");

    let clientSerial = null;

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.type === "entry" && data.serial_number) {
          clientSerial = data.serial_number;

          // ✅ サーバー上に同じserial_numberのレコードが存在するか確認
          const check = await db.query(
            `SELECT 1 FROM automesh.devices WHERE serial_number = $1`,
            [data.serial_number]
          );

          if (check.rowCount > 0) {
            // ✅ レコード削除（旧登録情報を消す）
            await db.query(
              `DELETE FROM automesh.devices WHERE serial_number = $1`,
              [data.serial_number]
            );
            console.log(`🗑 既存レコード削除: ${data.serial_number}`);
          }

          // 未登録デバイス一覧に追加（重複なし）
          if (!entryDevices.find(d => d.serial_number === data.serial_number)) {
            entryDevices.push({ serial_number: data.serial_number });
            console.log(`📥 未登録デバイス追加: ${data.serial_number}`);
          }

          // entryClients に登録（重複回避のため一度削除）
          entryClients = entryClients.filter(c => c.serial_number !== data.serial_number);
          entryClients.push({ serial_number: data.serial_number, ws });

          console.log(`📡 entryClients 登録: ${data.serial_number}`);
        }
      } catch (e) {
        console.warn("❌ JSON parse エラー:", e);
      }
    });

    ws.on("close", () => {
      entryClients = entryClients.filter(c => c.ws !== ws);
      console.log(`❌ エントリー接続切断: ${clientSerial}`);
    });
  });
}

// ✅ フロントエンド用：未登録デバイス一覧
function getUnregisteredDevices() {
  return entryDevices;
}

// ✅ 登録完了通知 → 1台だけに通知して切断
function notifyDeviceRegistered(serial, name) {
  entryDevices = entryDevices.filter((d) => d.serial_number !== serial);

  const client = entryClients.find(c => c.serial_number === serial);
  if (client && client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify({
      type: "registered",
      serial_number: serial,
      name,
    }));

    setTimeout(() => {
      client.ws.close();
      console.log(`✅ 登録通知 → 接続切断: ${serial}`);
    }, 100);
  } else {
    console.warn(`⚠️ 該当クライアントが未接続または既に閉じています: ${serial}`);
  }

  entryClients = entryClients.filter(c => c.serial_number !== serial);
}

// ✅ LED点滅要求
function requestDeviceBlink(serial_number) {
  const client = entryClients.find(c => c.serial_number === serial_number);
  if (client && client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify({
      type: "blink",
      serial_number,
    }));
    console.log(`💡 点滅要求送信: ${serial_number}`);
  }
}

// ✅ 登録解除通知
function notifyDeviceUnregistered(serial_number) {
  const client = entryClients.find(c => c.serial_number === serial_number);
  if (client && client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify({
      type: 'unregister',
      message: '登録が解除されました。不揮発メモリを消去してください。',
    }));
    client.ws.close();
    console.log(`🔕 解除通知＆切断: ${serial_number}`);
  } else {
    console.warn(`⚠️ 接続なし: ${serial_number} に解除通知を送れませんでした`);
  }

  entryClients = entryClients.filter(c => c.serial_number !== serial_number);
}

module.exports = {
  setupAutoMeshEntryWSS,
  getUnregisteredDevices,
  notifyDeviceRegistered,
  requestDeviceBlink,
  notifyDeviceUnregistered,
};
