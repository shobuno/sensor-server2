// AutoMesh/backend/utils/sendRelayCommand.js

const { sendCommandToDevice } = require("../ws/automesh-command");

/**
 * リレー制御コマンドを対象の装置に送信する
 * @param {string} serial_number 装置のシリアル番号
 * @param {number} relay_index 対象リレー番号（1, 2 など）
 * @param {'on' | 'off'} action 動作指示
 * @returns {boolean} 成功ならtrue、送信失敗ならfalse
 */
function sendRelayCommand(serial_number, relay_index, action) {
  const message = {
    type: "relay-toggle",
    relay_index,
    on: action === "on"  // ← ここが重要
  };

  try {
    sendCommandToDevice(serial_number, message);
    return true;
  } catch (err) {
    console.error("❌ リレー送信失敗:", err);
    return false;
  }
}

module.exports = { sendRelayCommand };
