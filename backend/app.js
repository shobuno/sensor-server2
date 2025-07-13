// sensor-server/backend/app.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin/users', require('./routes/adminUsers'));
app.use('/api/email', require('./routes/emailVerification'));


app.get('/', (req, res) => {
  res.send('✅ 認証APIサーバー起動中');
});

app.listen(PORT, () => {
  console.log(`🚀 サーバー起動: http://localhost:${PORT}`);
});
