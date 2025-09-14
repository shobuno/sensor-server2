// server/apps/todo/backend/routes/repeat_rules.js
const express = require('express');
const router = express.Router();
const db = require('../../../../backend/config/db');

// JWT のどのキーに UUID が入っていても拾える
function getUserId(req) { return req?.user?.id || req?.user?.id_uuid; }

/* ========= 小さなユーティリティ ========= */
const ALLOW_TYPES = new Set(['daily', 'weekly', 'monthly', 'yearly', 'interval']);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:MM" 24h

function normalizeBool(v, def = false) {
  if (v == null) return def;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return def;
}
function parseRuleMaybe(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (_e) { return null; }
  }
  return (typeof v === 'object') ? v : null;
}
function normalizeDateStr(v) {
  if (v == null || v === '') return null;
  return (/^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null; // Postgres DATE に素直に入る形だけ許可
}
function toIntOr(v, def = 0, { min = -365, max = 365 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

/* ========= Rule バリデーション（最小実装+時間/日付の軽い検証） ========= */
function validateRuleObject(ruleInput) {
  const rule = parseRuleMaybe(ruleInput);
  if (!rule || typeof rule !== 'object') return 'rule は JSON オブジェクトで必須です';
  if (!ALLOW_TYPES.has(rule.type)) return `rule.type は ${Array.from(ALLOW_TYPES).join(', ')} のいずれか必須`;

  // 共通: time があれば "HH:MM"
  if (rule.time != null && !TIME_RE.test(rule.time)) {
    return 'time は "HH:MM"（24時間）形式';
  }

  switch (rule.type) {
    case 'daily': {
      if (rule.interval != null && (!Number.isInteger(rule.interval) || rule.interval < 1)) {
        return 'daily.interval は 1 以上の整数';
      }
      return null;
    }
    case 'weekly': {
      if (rule.interval != null && (!Number.isInteger(rule.interval) || rule.interval < 1)) {
        return 'weekly.interval は 1 以上の整数';
      }
      if (!Array.isArray(rule.byweekday) || rule.byweekday.length === 0) {
        return 'weekly.byweekday は配列（0=日 .. 6=土）で必須';
      }
      if (rule.byweekday.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
        return 'weekly.byweekday の値は 0..6 の整数';
      }
      return null;
    }
    case 'monthly': {
      if (rule.day == null || !Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31) {
        return 'monthly.day は 1..31 の整数で必須（末日は後段ロジックで調整可）';
      }
      return null;
    }
    case 'yearly': {
      if (!Number.isInteger(rule.month) || rule.month < 1 || rule.month > 12) {
        return 'yearly.month は 1..12 の整数で必須';
      }
      if (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31) {
        return 'yearly.day は 1..31 の整数で必須';
      }
      return null;
    }
    case 'interval': {
      // 例: {"type":"interval","hours":48} または {"days":2}
      if (rule.hours == null && rule.days == null) {
        return 'interval は hours か days のいずれかが必須';
      }
      if (rule.hours != null && (!Number.isFinite(rule.hours) || rule.hours <= 0)) {
        return 'interval.hours は正の数';
      }
      if (rule.days != null && (!Number.isFinite(rule.days) || rule.days <= 0)) {
        return 'interval.days は正の数';
      }
      return null;
    }
    default:
      return '未知の type';
  }
}

function pickRulePayload(body) {
  const {
    title,
    summary = null,
    rule, // 文字列JSONでもオブジェクトでもOK
    timezone = 'Asia/Tokyo',
    due_offset_days = 0,
    default_today_flag = true,
    default_todo_flag = false,
    active = true,
    start_date = null,
    end_date = null,
  } = body || {};

  const payload = {
    title,
    summary: (summary === '' ? null : summary),
    rule: parseRuleMaybe(rule),
    timezone: (timezone && typeof timezone === 'string') ? timezone : 'Asia/Tokyo',
    due_offset_days: toIntOr(due_offset_days, 0, { min: -365, max: 365 }),
    default_today_flag: normalizeBool(default_today_flag, true),
    default_todo_flag: normalizeBool(default_todo_flag, false),
    active: normalizeBool(active, true),
    start_date: normalizeDateStr(start_date),
    end_date: normalizeDateStr(end_date),
  };

  // 期間の整合（両方あるときだけチェック）
  if (payload.start_date && payload.end_date && payload.start_date > payload.end_date) {
    return { error: 'start_date は end_date 以下である必要があります' };
  }
  return payload;
}

/* ========= 作成 ========= */
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const payload = pickRulePayload(req.body);
    if (payload.error) return res.status(400).json({ error: payload.error });

    if (!payload.title || typeof payload.title !== 'string') {
      return res.status(400).json({ error: 'title は必須の文字列です' });
    }
    if (payload.title.length > 200) {
      return res.status(400).json({ error: 'title は 200 文字以内にしてください' });
    }
    const err = validateRuleObject(payload.rule);
    if (err) return res.status(400).json({ error: err });

    const q = `
      INSERT INTO todo.repeat_rules
        (user_id, title, summary, rule, timezone, due_offset_days,
         default_today_flag, default_todo_flag, active, start_date, end_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`;
    const params = [
      userId,
      payload.title,
      payload.summary,
      payload.rule,
      payload.timezone,
      payload.due_offset_days,
      payload.default_today_flag,
      payload.default_todo_flag,
      payload.active,
      payload.start_date,
      payload.end_date,
    ];
    const { rows } = await db.query(q, params);
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ========= 一覧 ========= */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const activeOnly = normalizeBool(req.query.active_only, false);
    const q = `
      SELECT *
      FROM todo.repeat_rules
      WHERE user_id = $1
        ${activeOnly ? 'AND active = true' : ''}
      ORDER BY active DESC, title ASC, id DESC`;
    const { rows } = await db.query(q, [userId]);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ========= 取得 ========= */
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT * FROM todo.repeat_rules WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ========= 更新 ========= */
router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;

    // まず所有チェック
    const cur = await db.query(
      `SELECT id FROM todo.repeat_rules WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    if (cur.rows.length === 0) return res.status(404).json({ error: 'not_found' });

    const payload = pickRulePayload(req.body);
    if (payload.error) return res.status(400).json({ error: payload.error });

    if (payload.title != null) {
      if (typeof payload.title !== 'string') return res.status(400).json({ error: 'title は文字列' });
      if (payload.title.length > 200) return res.status(400).json({ error: 'title は 200 文字以内にしてください' });
    }
    if (payload.rule != null) {
      const err = validateRuleObject(payload.rule);
      if (err) return res.status(400).json({ error: err });
    }

    const q = `
      UPDATE todo.repeat_rules SET
        title = COALESCE($1, title),
        summary = COALESCE($2, summary),
        rule = COALESCE($3, rule),
        timezone = COALESCE($4, timezone),
        due_offset_days = COALESCE($5, due_offset_days),
        default_today_flag = COALESCE($6, default_today_flag),
        default_todo_flag = COALESCE($7, default_todo_flag),
        active = COALESCE($8, active),
        start_date = COALESCE($9, start_date),
        end_date = COALESCE($10, end_date),
        updated_at = now()
      WHERE id=$11 AND user_id=$12
      RETURNING *`;
    const params = [
      payload.title ?? null,
      payload.summary ?? null,
      payload.rule ?? null,
      payload.timezone ?? null,
      (payload.due_offset_days != null ? payload.due_offset_days : null),
      (payload.default_today_flag != null ? payload.default_today_flag : null),
      (payload.default_todo_flag  != null ? payload.default_todo_flag  : null),
      (payload.active != null ? payload.active : null),
      payload.start_date ?? null,
      payload.end_date ?? null,
      id, userId
    ];
    const { rows } = await db.query(q, params);
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ========= 削除（ハード削除、参照は items.repeat_rule_id ON DELETE SET NULL） ========= */
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;

    // 所有チェック
    const cur = await db.query(
      `SELECT id FROM todo.repeat_rules WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    if (cur.rows.length === 0) return res.status(404).json({ error: 'not_found' });

    await db.query(`DELETE FROM todo.repeat_rules WHERE id=$1 AND user_id=$2`, [id, userId]);
    // 参照していた items.repeat_rule_id は DDL の ON DELETE SET NULL により自動で NULL 化
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
