// sensor-server/apps/AutoMesh/backend/routes/deviceStatus.js

const router = require('express').Router();
const { queryStatus } = require('../ws/automesh-command');
// const auth = require('../config/authMiddleware');

router.post('/batch', /*auth,*/ async (req, res) => {
  const { serial_numbers } = req.body || {};
  if (!Array.isArray(serial_numbers)) {
    return res.status(400).json({ error: 'serial_numbers[] が必要です' });
  }
  const results = await Promise.allSettled(serial_numbers.map(s => queryStatus(s)));
  const list = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { serial_number: serial_numbers[i], online: false, error: true }
  );
  res.json(list);
});

module.exports = router;
