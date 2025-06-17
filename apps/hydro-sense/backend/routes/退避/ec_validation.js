// このコードは、EC（電気伝導度）検証データを登録するためのExpressルーターです。
// フロントエンドからのPOSTリクエストを受け取り、データベースに保存します。
// // データベースのテーブルは `ec_validation` で、カラムは `timestamp`, `measured_ec`, `calculated_ec`, `comment` です。
// エラーハンドリングも含まれており、登録成功時には200ステータス、失敗時には500ステータスを返します。
// このルーターは、WebSocketサーバーと連携して、リアルタイムでのデータ更新を可能にすることもできます。
// routes/ec_validation.js
// このコードは、EC（電気伝導度）検証データを登録するためのExpressルーターです。
// フロントエンドからのPOSTリクエストを受け取り、データベースに保存します。
// データベースのテーブルは `ec_validation` で、カラムは `timestamp`, `measured_ec`, `calculated_ec`, `comment` です。
// エラーハンドリングも含まれており、登録成功時には200ステータス、失敗時には500ステータスを返します。
// このルーターは、WebSocketサーバーと連携して、リアルタイムでのデータ更新を可能にすることもできます。


const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 }); 

const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/ec-validation', async (req, res) => {
  const { timestamp, measuredEc, calculatedEc, comment } = req.body;

  try {
    await db.query(
      `INSERT INTO ec_validation (timestamp, measured_ec, calculated_ec, comment)
       VALUES ($1, $2, $3, $4)`,
      [timestamp, measuredEc, calculatedEc, comment]
    );
    res.status(200).json({ message: '登録完了' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登録失敗' });
  }
});

module.exports = router;
