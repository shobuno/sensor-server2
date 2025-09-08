// server2/apps/todo/backend/routes/templates.js
const express = require('express');
const router = express.Router();
const db = require('../../../../backend/config/db');

// JWT のどのキーに UUID が入っていても拾える
function getUserId(req) { return req?.user?.id || req?.user?.id_uuid; }

/** tags/tags_text を CSV に正規化（items.tags_text に保存する前提） */
function normalizeTagsCsv(body) {
  const { tags, tags_text } = body || {};
  if (typeof tags_text === 'string' && tags_text.trim() !== '') return tags_text.trim();
  if (Array.isArray(tags)) return tags.map(String).map(s => s.trim()).filter(Boolean).join(',');
  return null;
}

/** JST の今日の日付で時刻だけを差し替える */
function toTodayWithTimeJST(dateLike) {
  if (!dateLike) return null;
  const src = new Date(dateLike);
  if (Number.isNaN(src.getTime())) return null;

  const tzOffMin = new Date().getTimezoneOffset(); // 現地→UTCの分（JSTは -540）
  const now = new Date();
  const jstNow = new Date(now.getTime() + (9 * 60 + tzOffMin) * 60000);
  const y = jstNow.getFullYear();
  const m = jstNow.getMonth();
  const d = jstNow.getDate();

  const hh = src.getHours();
  const mm = src.getMinutes();
  const ss = src.getSeconds();
  const ms = src.getMilliseconds();

  // 今日(JST)のその時刻 → UTC に戻す
  const jstDt = new Date(y, m, d, hh, mm, ss, ms);
  const utc = new Date(jstDt.getTime() - (9 * 60 + tzOffMin) * 60000);
  return utc;
}

/** GET /api/todo/templates : テンプレート一覧 */
router.get('/', async (req, res) => {
  const userId = getUserId(req);
  try {
    const { rows } = await db.query(
      `SELECT *
         FROM todo.items
        WHERE user_id = $1
          AND kind = 'TEMPLATE'::todo.item_kind
        ORDER BY priority ASC, updated_at DESC, id DESC`,
      [userId]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/todo/templates', e);
    res.status(500).json({ error: 'failed_to_list_templates' });
  }
});

/** POST /api/todo/templates : 新規テンプレ作成（通常追加と同じ項目 + kind=TEMPLATE） */
router.post('/', async (req, res) => {
  const userId = getUserId(req);
  const b = req.body || {};
  try {
    const tagsCsv = normalizeTagsCsv(b);
    const { rows } = await db.query(
      `INSERT INTO todo.items
        (user_id, title, description, status, today_flag, priority, due_at,
         plan_start_at, plan_end_at, category, unit, target_amount, remaining_amount,
         kind, todo_flag, sort_order, tags_text)
       VALUES
        ($1,$2,$3,'INBOX',false,$4,$5,$6,$7,$8,$9,$10,$11,
         'TEMPLATE'::todo.item_kind,$12,0,$13)
       RETURNING *`,
      [
        userId,
        b.title || '',
        b.description || null,
        Math.max(1, Math.min(5, Number(b.priority) || 3)),
        b.due_at || null,
        b.plan_start_at || null,
        b.plan_end_at || null,
        b.category || null,
        b.unit || null,
        b.target_amount ?? null,
        b.remaining_amount ?? null,
        b.todo_flag === true,
        tagsCsv,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/todo/templates', e);
    res.status(500).json({ error: 'failed_to_create_template' });
  }
});

/** POST /api/todo/templates/:id/add-today : テンプレから normal を生成して今日に入れる */
router.post('/:id/add-today', async (req, res) => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

  try {
    // テンプレ取得（本人のみ）
    const { rows: trows } = await db.query(
      `SELECT *
         FROM todo.items
        WHERE id = $1 AND user_id = $2 AND kind = 'TEMPLATE'::todo.item_kind`,
      [id, userId]
    );
    if (trows.length === 0) return res.status(404).json({ error: 'template_not_found' });
    const t = trows[0];

    // 当日日報があれば拾う（JST基準の“今日”）
    const { rows: rrows } = await db.query(
      `SELECT id
         FROM todo.daily_reports
        WHERE user_id = $1
          AND report_date = (now() AT TIME ZONE 'Asia/Tokyo')::date
        ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    const dailyReportId = rrows[0]?.id ?? null;

    const startToday = toTodayWithTimeJST(t.plan_start_at);
    const endToday   = toTodayWithTimeJST(t.plan_end_at);

    const params = [
      userId,
      t.title,
      t.description,
      true, // today_flag
      t.priority,
      t.due_at,           // そのまま継承
      startToday,
      endToday,
      t.category,
      t.unit,
      t.target_amount,
      t.remaining_amount,
      'NORMAL',           // 生成先は通常アイテム
      t.todo_flag,
      dailyReportId,      // 今日の日報があれば紐付け
      0,                  // sort_order
      t.tags_text || null // ★ タグを引き継ぐ
    ];

    const { rows: created } = await db.query(
      `INSERT INTO todo.items
        (user_id, title, description, status, today_flag, priority, due_at,
         plan_start_at, plan_end_at, category, unit, target_amount, remaining_amount,
         kind, todo_flag, daily_report_id, sort_order, tags_text)
       VALUES
        ($1,$2,$3,'INBOX',$4,$5,$6,$7,$8,$9,$10,$11,$12,
         $13::todo.item_kind,$14,$15,$16,$17)
       RETURNING *`,
      params
    );

    res.status(201).json(created[0]);
  } catch (e) {
    console.error('POST /api/todo/templates/:id/add-today', e);
    res.status(500).json({ error: 'failed_to_instantiate_template' });
  }
});

module.exports = router;
