// sensor-server/apps/todo/backend/routes/todo/repeat_logic.js
const {
  dbQuery, dlog, j, nowJst, startOfDayJst, withTimeOnDateJst,
  lastDayOfMonthJst, jstBounds,
} = require('./helpers');

// 次回期日計算
function computeNextDueAtJst(ruleJson, baseJst) {
  dlog('computeNextDueAtJst in', { type: ruleJson?.type, rule: ruleJson, base: j(baseJst) });
  const r = ruleJson || {};
  const type = String(r.type || 'daily').toLowerCase();
  const interval = Math.max(1, Number(r.interval ?? r.every) || 1);
  const timeHHMM = r.time || '09:00';
  const today0 = startOfDayJst(baseJst);

  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  const getNthWeekdayOfMonth = (y, m, weekday, nth) => {
    const first = new Date(y, m, 1), firstDow = first.getDay();
    let day1 = 1 + ((weekday - firstDow + 7) % 7);
    let dayN = day1 + (nth - 1) * 7;
    const lastDay = new Date(y, m + 1, 0).getDate();
    if (dayN > lastDay) dayN -= 7;
    return new Date(y, m, dayN);
  };

  let out = null;

  if (type === 'daily') {
    let due = withTimeOnDateJst(today0, timeHHMM);
    if (due.getTime() <= baseJst.getTime()) due = withTimeOnDateJst(addDays(today0, interval), timeHHMM);
    out = due;

  } else if (type === 'weekly') {
    const normalizeWeeklyArray = (input) => {
      if (!input) return [];
      const raw = Array.isArray(input) ? input : String(input).split(',');
      const map = { sun:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, 日:7, 月:1, 火:2, 水:3, 木:4, 金:5, 土:6 };
      const toNum = (v) => { const s=String(v).trim().toLowerCase(); if (map[s]) return map[s]; const n=Number(v); return Number.isFinite(n)?(n===0?7:n):null; };
      return Array.from(new Set(raw.map(toNum).filter((x)=>x>=1 && x<=7)));
    };
    const normalized = Array.isArray(r.byweekday) && r.byweekday.length ? r.byweekday.map(Number) : normalizeWeeklyArray(r.weekdays || ['mon']);
    const dow = (d) => { const w = d.getDay(); return w === 0 ? 7 : w; };
    const thisMonday0 = addDays(today0, 1 - dow(today0));
    let found = null;
    for (let week = 0; week < 8 && !found; week++) {
      const weekBase = addDays(thisMonday0, week * 7 * interval);
      const cands = normalized.map((wd) => withTimeOnDateJst(addDays(weekBase, wd - 1), timeHHMM));
      const future = cands.filter((d) => d.getTime() > baseJst.getTime());
      if (future.length) found = future.sort((a, b) => a - b)[0];
    }
    out = found || withTimeOnDateJst(addDays(thisMonday0, 7 * interval), timeHHMM);

  } else if (type === 'monthly') {
    const cur = new Date(today0);
    const y = cur.getFullYear(), m = cur.getMonth();
    const isEom = !!(r.month_end || (r.monthly && String(r.monthly.mode).toLowerCase() === 'eom'));
    const isNth = !!(r.monthly && String(r.monthly.mode).toLowerCase() === 'nth');

    if (isEom) {
      let cand = withTimeOnDateJst(lastDayOfMonthJst(cur), timeHHMM);
      if (cand.getTime() <= baseJst.getTime()) {
        const next = new Date(y, m + interval, 1);
        cand = withTimeOnDateJst(lastDayOfMonthJst(next), timeHHMM);
      }
      out = cand;

    } else if (isNth) {
      const wkMap = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, 日:0, 月:1, 火:2, 水:3, 木:4, 金:5, 土:6 };
      const nth = Math.min(5, Math.max(1, Number(r.monthly?.nth ?? 1)));
      const wkStr = String(r.monthly?.weekday ?? 'mon').toLowerCase();
      const weekday = wkMap[wkStr] ?? 1;
      let cand = withTimeOnDateJst(getNthWeekdayOfMonth(y, m, weekday, nth), timeHHMM);
      if (cand.getTime() <= baseJst.getTime()) {
        const next = addMonths(cur, interval);
        cand = withTimeOnDateJst(getNthWeekdayOfMonth(next.getFullYear(), next.getMonth(), weekday, nth), timeHHMM);
      }
      out = cand;
    } else {
      const rawDay = r.bymonthday ?? r.monthday ?? r.day ?? (r.monthly && r.monthly.day);
      const dayNum = Math.max(1, Math.min(31, Number(rawDay) || cur.getDate()));
      let cand = withTimeOnDateJst(new Date(y, m, dayNum), timeHHMM);
      if (cand.getTime() <= baseJst.getTime()) cand = withTimeOnDateJst(new Date(y, m + interval, dayNum), timeHHMM);
      out = cand;
    }

  } else if (type === 'yearly') {
    const cur = new Date(today0);
    const y = cur.getFullYear();
    const mon = Math.max(1, Math.min(12, Number(r.month) || (cur.getMonth() + 1))) - 1;
    const day = Math.max(1, Math.min(31, Number(r.day ?? r.bymonthday ?? (r.monthly && r.monthly.day)) || cur.getDate()));
    let cand = withTimeOnDateJst(new Date(y, mon, day), timeHHMM);
    if (cand.getTime() <= baseJst.getTime()) cand = withTimeOnDateJst(new Date(y + interval, mon, day), timeHHMM);
    out = cand;

  } else if (type === 'after_days') {
    const n = Math.max(1, Number(r.n) || 1);
    out = withTimeOnDateJst(new Date(today0.getTime() + n*24*60*60*1000), timeHHMM);

  } else if (type === 'after_hours') {
    const n = Math.max(1, Number(r.n) || 1);
    out = new Date(baseJst.getTime() + n * 60 * 60 * 1000);
  }

  if (!out) {
    let fallback = withTimeOnDateJst(today0, timeHHMM);
    if (fallback.getTime() <= baseJst.getTime()) fallback = withTimeOnDateJst(new Date(today0.getTime()+24*60*60*1000), timeHHMM);
    out = fallback;
  }
  dlog('computeNextDueAtJst out', { dueAt: j(out), type, interval, timeHHMM });
  return out;
}

// REPEATからNORMALを1日1回だけ生成
async function generateItemsFromRepeatRules(userId) {
  const now = nowJst();
  dlog('generate start', { userId, now: j(now) });

  const rows = await dbQuery(`
    SELECT
      rr.id AS rule_id, rr.rule,
      r.title, r.priority, r.category, r.tags_text, r.unit,
      r.target_amount, r.remaining_amount, r.plan_start_at, r.plan_end_at,
      COALESCE(LOWER(rr.rule::jsonb #>> '{generate,policy}'), 'immediate') AS gen_policy,
      CASE WHEN (rr.rule::jsonb #>> '{generate,advance_days}') ~ '^-?\\d+$'
           THEN (rr.rule::jsonb #>> '{generate,advance_days}')::int ELSE 0 END AS advance_days,
      COALESCE(rr.default_today_flag, FALSE) AS default_today_flag,
      COALESCE(rr.default_todo_flag,  FALSE) AS default_todo_flag
    FROM todo.items r
    JOIN todo.repeat_rules rr ON rr.id = r.repeat_rule_id AND rr.user_id = r.user_id
    WHERE r.user_id = $1 AND r.kind = 'REPEAT'
  `, [userId]);

  const normalizePolicy = (p) => {
    const s = String(p || '').toLowerCase();
    if (['immediate','now','at_once','right_now'].includes(s)) return 'immediate';
    if (['before','advance','prior','due_minus'].includes(s))   return 'before';
    if (['same','on_due','due'].includes(s))                     return 'same';
    return 'immediate';
  };

  for (const r of rows.rows) {
    const baseHHMM = r.plan_start_at
      ? `${String(new Date(r.plan_start_at).getHours()).padStart(2,'0')}:${String(new Date(r.plan_start_at).getMinutes()).padStart(2,'0')}`
      : '09:00';

    const rule = typeof r.rule === 'string' ? JSON.parse(r.rule) : (r.rule || {});
    if (!rule.time) rule.time = baseHHMM;

    const dueAt = computeNextDueAtJst(rule, now);
    if (!dueAt) continue;

    const policy = normalizePolicy(r.gen_policy);
    const adv = Math.max(0, Number.isFinite(r.advance_days) ? r.advance_days : 0);

    let shouldGenerateNow = false;
    if (policy === 'immediate') shouldGenerateNow = true;
    else if (policy === 'before') {
      const appearDate0 = startOfDayJst(new Date(dueAt.getTime() - adv * 24 * 60 * 60 * 1000));
      shouldGenerateNow = now >= appearDate0;
    } else { // 'same'
      const appearDate0 = startOfDayJst(dueAt);
      shouldGenerateNow = now >= appearDate0;
    }
    if (!shouldGenerateNow) continue;

    const ymd = `${dueAt.getFullYear()}-${String(dueAt.getMonth()+1).padStart(2,'0')}-${String(dueAt.getDate()).padStart(2,'0')}`;
    const { start: dueStart, end: dueEnd } = jstBounds(ymd);

    const exist = await dbQuery(`
      SELECT 1 FROM todo.items
       WHERE user_id=$1 AND kind='NORMAL'
         AND repeat_rule_id=$2
         AND due_at >= $3::timestamptz AND due_at < $4::timestamptz
       LIMIT 1
    `, [userId, r.rule_id, dueStart, dueEnd]);
    if (exist.rowCount) continue;

    const planStart = r.plan_start_at ? dueAt : null;
    let planEnd = null;
    if (r.plan_start_at && r.plan_end_at) {
      const durMs = new Date(r.plan_end_at) - new Date(r.plan_start_at);
      planEnd = new Date(dueAt.getTime() + Math.max(0, durMs));
    }

    await dbQuery(`
      INSERT INTO todo.items (
        user_id, kind, title, status, priority,
        category, tags_text, unit, target_amount, remaining_amount,
        due_at, plan_start_at, plan_end_at,
        repeat_rule_id, today_flag, todo_flag
      )
      VALUES (
        $1, 'NORMAL', $2, 'INBOX', $3,
        $4, $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14
      )
    `, [
      userId, r.title, r.priority,
      r.category, r.tags_text, r.unit, r.target_amount, r.remaining_amount,
      dueAt, planStart, planEnd,
      r.rule_id,
      !!r.default_today_flag, !!r.default_todo_flag
    ]);
  }
}

async function upsertRepeatRuleFromItem(userId, payload) {
  const {
    repeat_rule_id, title, summary = null, rule,
    timezone = 'Asia/Tokyo', due_offset_days = 0,
    default_today_flag = false, default_todo_flag = false,
  } = payload || {};
  const ruleJson = typeof rule === 'string' ? rule : JSON.stringify(rule || {});

  if (repeat_rule_id) {
    const u = await dbQuery(
      `UPDATE todo.repeat_rules
          SET title=$2, summary=$3, rule=$4::jsonb, timezone=$5,
              due_offset_days=$6, default_today_flag=$7, default_todo_flag=$8, updated_at=NOW()
        WHERE id=$9 AND user_id=$1 RETURNING id`,
      [userId, title, summary, ruleJson, timezone, due_offset_days, default_today_flag, default_todo_flag, repeat_rule_id]
    );
    if (!u.rowCount) throw new Error('repeat_rules: update failed or not found');
    return u.rows[0].id;
  }
  const ins = await dbQuery(
    `INSERT INTO todo.repeat_rules (
      user_id, title, summary, rule, timezone, due_offset_days,
      default_today_flag, default_todo_flag, created_at, updated_at
    ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,NOW(),NOW()) RETURNING id`,
    [userId, title, summary, ruleJson, timezone, due_offset_days, default_today_flag, default_todo_flag]
  );
  return ins.rows[0].id;
}

module.exports = { computeNextDueAtJst, generateItemsFromRepeatRules, upsertRepeatRuleFromItem };
