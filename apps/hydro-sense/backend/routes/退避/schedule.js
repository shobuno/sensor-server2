// routes/schedule.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const SCHEDULE_FILE = path.join(__dirname, '../data/schedules.json');

// JSONファイル読み込み（存在しない場合は空配列）
function loadSchedules() {
  try {
    const data = fs.readFileSync(SCHEDULE_FILE);
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// JSONファイル保存
function saveSchedules(schedules) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2));
}

// GET: スケジュール一覧取得
router.get('/api/schedule', (req, res) => {
  const schedules = loadSchedules();
  res.json(schedules);
});

// POST: 新規スケジュール追加
router.post('/api/schedule', (req, res) => {
  const schedules = loadSchedules();
  const newItem = {
    id: Date.now().toString(),
    enabled: false, // 初期状態は無効
    ...req.body
  };
  schedules.push(newItem);
  saveSchedules(schedules);
  res.status(201).json(newItem);
});

// PUT: 既存スケジュールの更新
router.put('/api/schedule/:id', (req, res) => {
  let schedules = loadSchedules();
  const index = schedules.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).send('Not found');
  schedules[index] = { ...schedules[index], ...req.body };
  saveSchedules(schedules);
  res.json(schedules[index]);
});

// DELETE: スケジュール削除
router.delete('/api/schedule/:id', (req, res) => {
  let schedules = loadSchedules();
  schedules = schedules.filter(s => s.id !== req.params.id);
  saveSchedules(schedules);
  res.status(204).send();
});

module.exports = router;
