// utils/relayState.js

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../data/relayState.json');

let state = {
  relay1: false,
  relay2: false
};

// 初期読み込み
if (fs.existsSync(STATE_FILE)) {
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf8');
    const loaded = JSON.parse(data);
    if (typeof loaded.relay1 === 'boolean' && typeof loaded.relay2 === 'boolean') {
      state = loaded;
    }
  } catch (err) {
    console.error("⚠ リレー状態ファイルの読み込みに失敗:", err.message);
  }
}

// 保存処理
function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("⚠ リレー状態ファイルの保存に失敗:", err.message);
  }
}

// 状態の設定
function setRelay(relay, value) {
  state[`relay${relay}`] = value;
  saveState();
}

// 状態の取得
function getRelayState() {
  return { ...state };
}

module.exports = {
  setRelay,
  getRelayState
};
