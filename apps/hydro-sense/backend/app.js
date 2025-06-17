// apps/hydro-sense/backend/app.js
const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes');

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://192.168.0.2:5173'],
  credentials: true,
}));
app.use(express.json());
app.use('/api', apiRouter);

module.exports = app;
