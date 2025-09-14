// sensor-server/apps/todo/backend/routes/todo.js

const express = require('express');

const isDbg = () => process.env.TODO_DEBUG === '1';
const dlog  = (...a) => { if (isDbg()) console.log('[todo]', new Date().toISOString(), ...a); };
const jst = (d) => d instanceof Date ? new Date(d.getTime() + 9*60*60000) : d;
const j = (d) => (d instanceof Date ? jst(d).toISOString().replace('Z','+09:00') : d);

const router = express.Router();
const { pool, query: dbQuery } = require('../../../../backend/config/db');

/* ======================= Helpers ======================= */

function normalizePriority(input) {
  if (input == null) return 3;
  const n = Number(input);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.floor(n)));
}
function denormalizePriority(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 3;
}

function getUserId(req) {
  return req?.user?.id || req?.user?.id_uuid;
}

function normalizeTagsCsv(body) {
  const { tags, tags_text } = body || {};
  if (typeof tags_text === 'string' && tags_text.trim() !== '') return tags_text.trim();
  if (Array.isArray(tags)) return tags.map(String).map(s => s.trim()).filter(Boolean).join(',');
  return null;
}

function buildDueAt({ due_at, due_date, due_time }) {
  if (due_at !== undefined) return due_at;
  if (!due_date) return undefined;
  const time = (typeof due_time === 'string' && /^\d{2}:\d{2}$/.test(due_time)) ? due_time : '00:00';
  return `${due_date}T${time}:00+09:00`;
}

function resolveJstDate(inputDate) {
  if (typeof inputDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(inputDate)) return inputDate;
  return null;
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function normalizeBool(v, fallback = null) {
  if (v === true)  return true;
  if (v === false) return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true','1','on','yes'].includes(s))  return true;
    if (['false','0','off','no'].includes(s)) return false;
  }
  return fallback;
}


// DB enum: NORMAL / TEMPLATE / REPEAT
function normalizeKind(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'NORMAL';
  const upper = s.toUpperCase();
  if (upper === 'NORMAL' || upper === 'TEMPLATE' || upper === 'REPEAT') return upper;
  const lower = s.toLowerCase();
  if (lower === 'normal') return 'NORMAL';
  if (lower === 'template') return 'TEMPLATE';
  if (lower === 'repeat' || lower === 'repeat_rule') return 'REPEAT';
  return 'NORMAL';
}
/* ===== JST日付ユーティリティ ===== */
function nowJst() {
  const now = new Date();
  const offMin = new Date().getTimezoneOffset(); // 現地→UTC
  return new Date(now.getTime() + (9 * 60 + offMin) * 60000);
}
function startOfDayJst(d = nowJst()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDayJst(d = nowJst()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
/** "HH:MM"をその日のJST日時に合成（無ければ09:00） */
function withTimeOnDateJst(baseDate, hhmm) {
  const d = new Date(baseDate);
  const [h, m] = (hhmm || "09:00").split(":").map((x) => parseInt(x, 10) || 0);
  d.setHours(h, m, 0, 0);
  return d;
}
/** 月末日（JST） */
function lastDayOfMonthJst(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  return new Date(y, m + 1, 0); // 翌月0日
}

function jstTodayYmd() {
  const offMin = new Date().getTimezoneOffset();
  const j = new Date(Date.now() + (9*60 + offMin)*60000);
  const y = j.getFullYear(), m = String(j.getMonth()+1).padStart(2,'0'), d = String(j.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function jstBounds(ymd = jstTodayYmd()) {
  const addDays = (ymd, n) => {
    const [y,m,d] = ymd.split('-').map(Number);
    const base = new Date(Date.UTC(y, m-1, d, 15, 0, 0)); // UTC15:00 = JST00:00
    base.setUTCDate(base.getUTCDate() + n);
    const yy=base.getUTCFullYear(), mm=String(base.getUTCMonth()+1).padStart(2,'0'), dd=String(base.getUTCDate()).padStart(2,'0');
    return `${yy}-${mm}-${dd}`;
  };
  return {
    start: `${ymd}T00:00:00+09:00`,
    end:   `${addDays(ymd,1)}T00:00:00+09:00`,
  };
}

function normalizeWeeklyArray(input) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(',');
  const toNum = (v) => {
    const map = { sun:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, 日:7, 月:1, 火:2, 水:3, 木:4, 金:5, 土:6 };
    const s = String(v).trim().toLowerCase();
    if (map[s]) return map[s];
    const n = Number(v);
    return Number.isFinite(n) ? (n === 0 ? 7 : n) : null;
  };
  return Array.from(new Set(raw.map(toNum).filter((x)=>x>=1 && x<=7)));
}

/* ===== ルール→次回期限の算出（daily/weekly/monthly/yearly/after_days/after_hours） ===== */
function computeNextDueAtJst(ruleJson, baseJst) {
  dlog('computeNextDueAtJst in', { type: ruleJson?.type, rule: ruleJson, base: j(baseJst) });

  const r = ruleJson || {};
  const type = String(r.type || 'daily').toLowerCase();
  const interval = Math.max(1, Number(r.interval ?? r.every) || 1);
  const timeHHMM = r.time || '09:00';

  const today0 = startOfDayJst(baseJst);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

  // 第n◯曜日の日時を返す（nth: 1..5, weekday: 0=Sun..6=Sat）
  const getNthWeekdayOfMonth = (y, m /* 0-based */, weekday /* 0..6 */, nth /* 1..5 */) => {
    // その月の1日
    const first = new Date(y, m, 1);
    const firstDow = first.getDay(); // 0..6
    // その月で最初に weekday になる日（1〜7）
    let day1 = 1 + ((weekday - firstDow + 7) % 7);
    // n番目
    let dayN = day1 + (nth - 1) * 7;
    const lastDay = new Date(y, m + 1, 0).getDate(); // 月末日
    if (dayN > lastDay) {
      // 第5が存在しない場合は月内の最後の該当曜日に丸める
      dayN -= 7;
      if (dayN < 1) dayN = day1; // 念のための保険
    }
    return new Date(y, m, dayN);
  };

  let out = null;

  if (type === 'daily') {
    let due = withTimeOnDateJst(today0, timeHHMM);
    if (due.getTime() <= baseJst.getTime()) {
      due = withTimeOnDateJst(addDays(today0, interval), timeHHMM);
    }
    out = due;

  } else if (type === 'weekly') {
    const normalized = Array.isArray(r.byweekday) && r.byweekday.length
      ? r.byweekday.map(Number)
      : normalizeWeeklyArray(r.weekdays || ['mon']);
    const dow = (d) => { const w = d.getDay(); return w === 0 ? 7 : w; }; // 1..7(Mon..Sun with 7=Sun)
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

    // UI互換：r.month_end か r.monthly.mode === 'eom' を「月末」
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
      // 第n◯曜日: weekday は 'mon' などの文字列で来る
      const wkMap = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, 日:0, 月:1, 火:2, 水:3, 木:4, 金:5, 土:6 };
      const nth = Math.min(5, Math.max(1, Number(r.monthly?.nth ?? 1)));
      const wkStr = String(r.monthly?.weekday ?? 'mon').toLowerCase();
      const weekday = wkMap[wkStr] ?? 1;

      // 今月の候補
      let cand = withTimeOnDateJst(getNthWeekdayOfMonth(y, m, weekday, nth), timeHHMM);
      if (cand.getTime() <= baseJst.getTime()) {
        // interval ヶ月先の候補
        const next = addMonths(cur, interval);
        cand = withTimeOnDateJst(getNthWeekdayOfMonth(next.getFullYear(), next.getMonth(), weekday, nth), timeHHMM);
      }
      out = cand;

    } else {
      // 「◯日」指定（bymonthday / monthday / day / monthly.day）
      const rawDay =
        r.bymonthday ??
        r.monthday ??
        r.day ??
        (r.monthly && r.monthly.day);

      const dayNum = Math.max(1, Math.min(31, Number(rawDay) || cur.getDate()));
      let cand = withTimeOnDateJst(new Date(y, m, dayNum), timeHHMM);
      if (cand.getTime() <= baseJst.getTime()) {
        cand = withTimeOnDateJst(new Date(y, m + interval, dayNum), timeHHMM);
      }
      out = cand;
    }

  } else if (type === 'yearly') {
    const cur = new Date(today0);
    const y = cur.getFullYear();
    const mon = Math.max(1, Math.min(12, Number(r.month) || (cur.getMonth() + 1))) - 1;
    const day =
      Math.max(1, Math.min(31,
        Number(r.day ?? r.bymonthday ?? (r.monthly && r.monthly.day)) || cur.getDate()
      ));
    let cand = withTimeOnDateJst(new Date(y, mon, day), timeHHMM);
    if (cand.getTime() <= baseJst.getTime()) {
      cand = withTimeOnDateJst(new Date(y + interval, mon, day), timeHHMM);
    }
    out = cand;

  } else if (type === 'after_days') {
    const n = Math.max(1, Number(r.n) || 1);
    out = withTimeOnDateJst(addDays(today0, n), timeHHMM);

  } else if (type === 'after_hours') {
    const n = Math.max(1, Number(r.n) || 1);
    out = new Date(baseJst.getTime() + n * 60 * 60 * 1000);
  }

  // フォールバック（安全網）
  if (!out) {
    let fallback = withTimeOnDateJst(today0, timeHHMM);
    if (fallback.getTime() <= baseJst.getTime()) {
      fallback = withTimeOnDateJst(addDays(today0, 1), timeHHMM);
    }
    out = fallback;
  }

  dlog('computeNextDueAtJst out', { dueAt: j(out), type, interval, timeHHMM });
  return out;
}



/* ===== 1回/日だけ生成するメイン処理 ===== */
function jstDayRange(date = new Date()) {
  const tzOffMin = date.getTimezoneOffset();
  const jstNow = new Date(date.getTime() + (9 * 60 + tzOffMin) * 60000);
  const dayStart = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate());
  const dayEnd   = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate() + 1);
  return { dayStart, dayEnd };
}

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
    JOIN todo.repeat_rules rr
      ON rr.id = r.repeat_rule_id AND rr.user_id = r.user_id
    WHERE r.user_id = $1 AND r.kind = 'REPEAT'
  `, [userId]);

  dlog('generate rules fetched', { count: rows.rowCount });

  // ポリシー名の正規化（エイリアス吸収）
  const normalizePolicy = (p) => {
    const s = String(p || '').toLowerCase();
    if (['immediate', 'now', 'at_once', 'right_now'].includes(s)) return 'immediate';
    if (['before', 'advance', 'prior', 'due_minus'].includes(s))   return 'before';
    if (['same', 'on_due', 'due'].includes(s))                     return 'same';
    // 不明は immediate 扱いにしない：安全のため same に寄せるなら↓を 'same' に
    return 'immediate';
  };

  for (const r of rows.rows) {
    // 1) 期日の基準時刻（HH:mm）: plan_start_at の時刻を暗黙 time として使う
    const baseHHMM = r.plan_start_at
      ? String(new Date(r.plan_start_at).getHours()).padStart(2,'0') + ':' +
        String(new Date(r.plan_start_at).getMinutes()).padStart(2,'0')
      : '09:00';

    const rule = typeof r.rule === 'string' ? JSON.parse(r.rule) : (r.rule || {});
    if (!rule.time) rule.time = baseHHMM;

    dlog('rule begin', {
      rule_id: r.rule_id, title: r.title,
      baseHHMM, policy: r.gen_policy, adv: r.advance_days, rule
    });

    // 2) 次回期日算出（JST）
    const dueAt = computeNextDueAtJst(rule, now);
    dlog('due computed', { rule_id: r.rule_id, dueAt: j(dueAt), now: j(now) });
    if (!dueAt) continue;

    // 3) 生成タイミング判定
    const policy = normalizePolicy(r.gen_policy);
    const advRaw = Number.isFinite(r.advance_days) ? r.advance_days : 0;
    const adv = Math.max(0, advRaw); // マイナスは切り上げ

    let shouldGenerateNow = false;
    if (policy === 'immediate') {
      dlog('appear policy: immediate (always generate)', { rule_id: r.rule_id });
      shouldGenerateNow = true;
    } else if (policy === 'before') {
      const appearDate0 = startOfDayJst(new Date(dueAt.getTime() - adv * 24 * 60 * 60 * 1000));
      dlog('appear window (before)', { rule_id: r.rule_id, appearDate0: j(appearDate0), adv });
      shouldGenerateNow = now >= appearDate0;
    } else if (policy === 'same') {
      const appearDate0 = startOfDayJst(dueAt); // 期日当日の 00:00(JST)
      dlog('appear window (same/on_due)', { rule_id: r.rule_id, appearDate0: j(appearDate0) });
      shouldGenerateNow = now >= appearDate0;
    } else {
      // 将来の未知ポリシー用フォールバック（安全側で same）
      const appearDate0 = startOfDayJst(dueAt);
      dlog('appear window (fallback->same)', { rule_id: r.rule_id, appearDate0: j(appearDate0), raw: r.gen_policy });
      shouldGenerateNow = now >= appearDate0;
    }
    if (!shouldGenerateNow) continue;

    // 4) 同じ「期日の日」に既存 NORMAL があるか（=同一回の重複生成防止）
    const ymd = `${dueAt.getFullYear()}-${String(dueAt.getMonth()+1).padStart(2,'0')}-${String(dueAt.getDate()).padStart(2,'0')}`;
    const { start: dueStart, end: dueEnd } = jstBounds(ymd);
    dlog('exist check window', { rule_id: r.rule_id, dueStart, dueEnd });

    const exist = await dbQuery(`
      SELECT 1 FROM todo.items
       WHERE user_id=$1 AND kind='NORMAL'
         AND repeat_rule_id=$2
         AND due_at >= $3::timestamptz AND due_at < $4::timestamptz
       LIMIT 1
    `, [userId, r.rule_id, dueStart, dueEnd]);

    dlog('exist rowCount', { rule_id: r.rule_id, rowCount: exist.rowCount });
    if (exist.rowCount) continue;

    // 5) 予定の長さを維持
    const planStart = r.plan_start_at ? dueAt : null;
    let planEnd = null;
    if (r.plan_start_at && r.plan_end_at) {
      const durMs = new Date(r.plan_end_at) - new Date(r.plan_start_at);
      planEnd = new Date(dueAt.getTime() + Math.max(0, durMs));
    }

    // 6) 生成（ID受け取りはログ用途）
    const ins = await dbQuery(`
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
      RETURNING id
    `, [
      userId, r.title, r.priority,
      r.category, r.tags_text, r.unit, r.target_amount, r.remaining_amount,
      dueAt, planStart, planEnd,
      r.rule_id,
      !!r.default_today_flag, !!r.default_todo_flag
    ]);

    dlog('inserted NORMAL', { rule_id: r.rule_id, item_id: ins.rows?.[0]?.id, dueAt: j(dueAt) });
  }
}


/* ======================= Repeat extractor (fallback for UI fields) ======================= */

function pick(...names) {
  for (const n of names) {
    if (n in this && this[n] != null) return this[n];
  }
  return undefined;
}

function normInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : def;
}

function normalizeWeekdays(input) {
  if (input == null) return [];
  const map = new Map([
    ['0','sun'],['7','sun'],['sun','sun'],['日','sun'],
    ['1','mon'],['mon','mon'],['月','mon'],
    ['2','tue'],['tue','tue'],['火','tue'],
    ['3','wed'],['wed','wed'],['水','wed'],
    ['4','thu'],['thu','thu'],['木','thu'],
    ['5','fri'],['fri','fri'],['金','fri'],
    ['6','sat'],['sat','sat'],['土','sat'],
  ]);

  let arr = Array.isArray(input) ? input : String(input).split(',');
  return Array.from(new Set(
    arr.map(x => String(x).trim().toLowerCase())
       .map(x => map.get(x) ?? (map.get(String(Number(x))) ?? null))
       .filter(Boolean)
  ));
}

/**
 * UIの平文 -> 仕様化rule
 */
function extractRepeatSpecFromBody(body) {
  if (body && typeof body.repeat === 'object' && body.repeat) {
    if (typeof body.repeat.type === 'string') return body.repeat;
  }
  if (!body || typeof body !== 'object') return null;

  const get = pick.bind(body);

  let type = get('repeat_type','repeat_kind','recurrence','frequency','repeatMode','mode');
  if (typeof type === 'string') {
    type = type.trim().toLowerCase();
    if (['weekly','week','weeks'].includes(type)) type = 'weekly';
    else if (['daily','day','days'].includes(type)) type = 'daily';
    else if (['monthly','month','months'].includes(type)) type = 'monthly';
    else if (['yearly','year','years','annual','annually'].includes(type)) type = 'yearly';
    else if (['none','no','off'].includes(type)) type = 'none';
  }
  if (!type) return null;

  const every = normInt(get('repeat_every','interval','every','repeat_interval'), 1);
  const weekdays = normalizeWeekdays(get('weekdays','byweekday','repeat_weekdays','days'));

  let genPolicy = get('generate_policy','gen_policy','next_create_policy','next_create_timing');
  if (typeof genPolicy === 'string') {
    const s = genPolicy.trim().toLowerCase();
    if (['before','advance','prior','due_minus'].includes(s)) genPolicy = 'before';
    else if (['now','immediate','immediately','right_now','at_once'].includes(s)) genPolicy = 'immediate';
    else if (['same','on_due','due'].includes(s)) genPolicy = 'same';
    else genPolicy = 'immediate';
  } else {
    genPolicy = 'immediate';
  }
  const advanceDays = normInt(get('advance_days','lead_days','before_days'), 0);

  const start_date = get('repeat_start','repeat_start_date','start_date','r_start');
  const end_date   = get('repeat_end','repeat_end_date','end_date','r_end');
  const timezone = get('timezone','tz') || 'Asia/Tokyo';

  if (type === 'none') return { type: 'none' };

  const base = {
    type,
    every,
    timezone,
    window: { start_date: start_date ?? null, end_date: end_date ?? null },
    generate: { policy: genPolicy, advance_days: Math.max(0, advanceDays) },
  };

  if (type === 'weekly') return { ...base, weekdays: weekdays.length ? weekdays : ['mon'] };
  if (type === 'daily')  return base;
  if (type === 'monthly') {
    const bymonthday = get('bymonthday','monthday','day_of_month');
    return { ...base, bymonthday: normInt(bymonthday, null) };
  }
  if (type === 'yearly')  return base;

  return { type: 'none' };
}

/* ======================= Repeat Rule Helper ======================= */

async function upsertRepeatRuleFromItem(userId, payload) {
  const {
    repeat_rule_id,
    title,
    summary = null,
    rule,
    timezone = 'Asia/Tokyo',
    due_offset_days = 0,
    default_today_flag = false,
    default_todo_flag = false,
  } = payload || {};

  const ruleJson = typeof rule === 'string' ? rule : JSON.stringify(rule || {});

  if (repeat_rule_id) {
    const u = await dbQuery(
      `
      UPDATE todo.repeat_rules
         SET title=$2,
             summary=$3,
             rule=$4::jsonb,
             timezone=$5,
             due_offset_days=$6,
             default_today_flag=$7,
             default_todo_flag=$8,
             updated_at=NOW()
       WHERE id=$9 AND user_id=$1
       RETURNING id
      `,
      [
        userId, title, summary, ruleJson, timezone,
        due_offset_days, default_today_flag, default_todo_flag, repeat_rule_id,
      ]
    );
    if (!u.rowCount) throw new Error('repeat_rules: update failed or not found');
    return u.rows[0].id;
  }

  const ins = await dbQuery(
    `
    INSERT INTO todo.repeat_rules (
      user_id,
      title,
      summary,
      rule,
      timezone,
      due_offset_days,
      default_today_flag,
      default_todo_flag,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4::jsonb, $5, $6, $7, $8, NOW(), NOW()
    )
    RETURNING id
    `,
    [userId, title, summary, ruleJson, timezone, due_offset_days, default_today_flag, default_todo_flag]
  );
  return ins.rows[0].id;
}


/* ======================= Items CRUD ======================= */

router.get('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id' });
  const { rows } = await dbQuery(
    `SELECT * FROM todo.items WHERE user_id=$1 AND id=$2`,
    [userId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  rows[0].priority = denormalizePriority(rows[0].priority);
  res.json(rows[0]);
});

router.get('/items', async (req, res) => {
  let { bucket, status, scope, today, item_type, kind } = req.query;
  if (!bucket && scope) bucket = scope;

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id' });

  const params = [userId];
  const where = [`i.user_id=$1`];

  const rawKind = (item_type || kind || '').toString().toLowerCase();
  const kindMap = { normal: 'NORMAL', template: 'TEMPLATE', repeat_rule: 'REPEAT', repeat: 'REPEAT' };
  if (rawKind && kindMap[rawKind]) {
    params.push(kindMap[rawKind]);
    where.push(`i.kind=$${params.length}::todo.item_kind`);
  }

  if (today === '1' || today === 'true') {
    where.push(`(
      (
        i.today_flag=TRUE
        AND EXISTS (
          SELECT 1 FROM todo.daily_reports dr
           WHERE dr.id=i.daily_report_id
             AND dr.user_id=i.user_id
             AND dr.report_date=(now() AT TIME ZONE 'Asia/Tokyo')::date
        )
      )
      OR i.status='DOING'::todo.item_status
    )`);
  } else if (bucket === 'someday') {
    where.push(`i.today_flag=false`);
  }

  if (status) {
    params.push(status);
    where.push(`i.status=$${params.length}::todo.item_status`);
  }

  const q = `
    SELECT i.*,
      COALESCE((
        SELECT SUM(
          CASE WHEN s.end_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (s.end_at-s.start_at))
               ELSE EXTRACT(EPOCH FROM (now()-s.start_at)) END
        )::int
          FROM todo.sessions s
         WHERE s.user_id=i.user_id AND s.item_id=i.id
      ),0) AS run_seconds
    FROM todo.items i
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(i.plan_start_at,i.due_at,i.created_at), i.priority, i.id
  `;
  const { rows } = await dbQuery(q, params);
  res.json(rows.map(r => ({ ...r, priority: denormalizePriority(r.priority) })));
});

router.post('/items', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id' });

  const {
    title, description, priority,
    due_at, due_date, due_time,
    category, unit, target_amount, remaining_amount,
    pin_today, today_flag,
    kind, todo_flag,
    plan_start_at, plan_end_at, planned_minutes, sort_order, daily_report_id,
    favorite, note,
    repeat
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const tagsCsv = normalizeTagsCsv(req.body);
  const computedDueAt = buildDueAt({ due_at, due_date, due_time });

  const tf = normalizeBool(today_flag, null);
  const todayFlag = (tf !== null) ? tf : (pin_today === true ? true : true);
  const kindNorm = normalizeKind(kind);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insRes = await client.query(
      `INSERT INTO todo.items
         (user_id,title,description,status,today_flag,priority,due_at,category,unit,
          target_amount,remaining_amount,tags_text,
          plan_start_at,plan_end_at,planned_minutes,sort_order,daily_report_id,
          favorite,note,kind,todo_flag)
       VALUES
         ($1,$2,$3,'INBOX',$4,$5,$6,$7,$8,
          $9,$10,$11,
          $12,$13,$14,$15,$16,
          $17,$18,$19::todo.item_kind,$20)
       RETURNING *`,
      [userId, title, (description ?? null),
       todayFlag, normalizePriority(priority),
       (computedDueAt ?? null), (category ?? null), (unit ?? null),
       (target_amount ?? null), (remaining_amount ?? null),
       tagsCsv,
       (plan_start_at ?? null), (plan_end_at ?? null),
       (planned_minutes ?? null),
       (Number.isInteger(sort_order) ? sort_order : null),
       (Number.isInteger(daily_report_id) ? daily_report_id : null),
       (favorite === true), (note ?? null),
       kindNorm, (typeof todo_flag === 'boolean' ? todo_flag : true)]
    );
    let row = insRes.rows[0];

    const ruleId = await upsertRepeatRuleFromItem(userId, {
      repeat_rule_id: req.body?.repeat_rule_id ?? null,
      title,
      summary: req.body?.summary ?? null,
      rule: req.body?.repeat ?? req.body?.rule ?? extractRepeatSpecFromBody(req.body),
      timezone: req.body?.timezone ?? 'Asia/Tokyo',
      due_offset_days: req.body?.due_offset_days ?? 0,
      default_today_flag: !!req.body?.default_today_flag,
      default_todo_flag: !!req.body?.default_todo_flag,
    });

    await client.query(
      `
      UPDATE todo.items
        SET kind='REPEAT',
            repeat_rule_id=$2,
            updated_at=NOW()
      WHERE id=$1 AND user_id=$3
      `,
      [row.id, ruleId, userId]
    );

    await client.query('COMMIT');
    row.priority = denormalizePriority(row.priority);
    res.status(201).json(row);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'create failed' });
  } finally {
    client.release();
  }
});

router.patch('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id' });

  const computedDueAt = buildDueAt({
    due_at: req.body?.due_at, due_date: req.body?.due_date, due_time: req.body?.due_time,
  });

  // ここに列挙されていないフィールドは PATCH で変更しない
  const allowed = [
    'title','description','status','priority','due_at',
    'category','unit','target_amount','remaining_amount','tags_text','today_flag',
    'plan_start_at','plan_end_at','planned_minutes','sort_order','daily_report_id',
    'favorite','note','kind','todo_flag',
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // === 1) まず通常の項目更新（repeat_rule_idはここでは触らない） ===
    const sets = [], vals = [];
    for (const k of allowed) {
      if (k === 'due_at') continue;
      if (k in req.body) {
        if (k === 'status') {
          sets.push(`${k}=$${sets.length+1}::todo.item_status`); vals.push(req.body[k]);
        } else if (k === 'kind') {
          sets.push(`${k}=$${sets.length+1}::todo.item_kind`);
          vals.push(normalizeKind(req.body[k]));
        } else if (k === 'priority') {
          sets.push(`${k}=$${sets.length+1}`); vals.push(normalizePriority(req.body[k]));
        } else if (k === 'tags_text') {
          sets.push(`${k}=$${sets.length+1}`); vals.push(normalizeTagsCsv(req.body));
        } else if (k === 'today_flag') {
          sets.push(`${k}=$${sets.length+1}`); vals.push(normalizeBool(req.body[k], false));
        } else {
          sets.push(`${k}=$${sets.length+1}`); vals.push(req.body[k]);
        }
      }
    }
    if (computedDueAt !== undefined) {
      sets.push(`due_at=$${sets.length+1}`); vals.push(computedDueAt);
    }

    vals.push(userId, req.params.id);
    const q = `
      UPDATE todo.items
         SET ${sets.join(', ') || 'updated_at=now()'}, updated_at=now()
       WHERE user_id=$${vals.length-1} AND id=$${vals.length}
       RETURNING *`;
    const { rows } = sets.length
      ? await client.query(q, vals)
      : await client.query(`SELECT * FROM todo.items WHERE user_id=$1 AND id=$2`, [userId, req.params.id]);

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'not found' });
    }
    let row = rows[0];

    // この時点の kind と、リクエストで明示された kind
    const requestedKindPresent = Object.prototype.hasOwnProperty.call(req.body, 'kind');
    const requestedKind = requestedKindPresent ? normalizeKind(req.body.kind) : row.kind;

    // 入力から repeat spec を抽出（リクエストに repeat が無い場合は null のまま）
    const repeatInRequest = Object.prototype.hasOwnProperty.call(req.body, 'repeat');
    const repeatSpec = repeatInRequest ? extractRepeatSpecFromBody(req.body) : null;

    // === 2) repeat_rule のリンク/更新は「明示された時」だけ扱う（FIX） ===

    // 2-1) kind を明示的に REPEAT -> 非 REPEAT に変更した場合はリンクを外す
    if (requestedKindPresent && row.kind === 'REPEAT' && requestedKind !== 'REPEAT') {
      await client.query(
        `UPDATE todo.items SET repeat_rule_id=NULL WHERE id=$1 AND user_id=$2`,
        [row.id, userId]
      );
      // row を最新化
      const r2 = await client.query(`SELECT * FROM todo.items WHERE id=$1 AND user_id=$2`, [row.id, userId]);
      row = r2.rows[0] || row;
    }

    // 2-2) repeat フィールドが送られてきた場合だけ、ルールの upsert / 解除を行う
    if (repeatInRequest) {
      const effectiveKind = requestedKind; // ここではリクエスト優先

      if (repeatSpec && repeatSpec.type && repeatSpec.type !== 'none' && effectiveKind === 'REPEAT') {
        // REPEAT として明示＋有効なルール → upsert して紐づけ
        const ruleId = await upsertRepeatRuleFromItem(userId, {
          repeat_rule_id: row.repeat_rule_id ?? null,
          title: row.title,
          summary: row.summary ?? null,
          rule: repeatSpec,
          timezone: 'Asia/Tokyo',
          due_offset_days: 0,
          default_today_flag: !!row.today_flag,
          default_todo_flag: !!row.todo_flag,
        });
        if (ruleId && row.repeat_rule_id !== ruleId) {
          await client.query(`UPDATE todo.items SET repeat_rule_id=$1 WHERE id=$2 AND user_id=$3`, [ruleId, row.id, userId]);
          const r2 = await client.query(`SELECT * FROM todo.items WHERE id=$1 AND user_id=$2`, [row.id, userId]);
          row = r2.rows[0] || row;
        }
      } else if (!repeatSpec || (repeatSpec && repeatSpec.type === 'none')) {
        // ルール解除の明示（type:none） → 紐付きを外す
        await client.query(
          `UPDATE todo.items SET repeat_rule_id=NULL WHERE id=$1 AND user_id=$2`,
          [row.id, userId]
        );
        const r2 = await client.query(`SELECT * FROM todo.items WHERE id=$1 AND user_id=$2`, [row.id, userId]);
        row = r2.rows[0] || row;
      }
    }

    // ※ 上の 2-1, 2-2 以外（たとえば today_flag だけ更新など）は repeat_rule_id を触らない（FIX）

    await client.query('COMMIT');
    row.priority = denormalizePriority(row.priority);
    res.json(row);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'update failed' });
  } finally {
    client.release();
  }
});


router.delete('/items/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id' });
  const { rowCount } = await dbQuery(
    `DELETE FROM todo.items WHERE user_id=$1 AND id=$2`,
    [userId, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

/* ======================= Repeat Rules CRUD ======================= */

router.get('/repeat-rules', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error:'no user id' });
  const { rows } = await dbQuery(
    `SELECT * FROM todo.repeat_rules WHERE user_id=$1 ORDER BY id DESC`, [userId]
  );
  res.json(rows);
});

router.post('/repeat-rules', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error:'no user id' });
  const { title, summary, rule } = req.body || {};
  if (!title || !rule) return res.status(400).json({ error:'title,rule required' });
  const { rows } = await dbQuery(
    `INSERT INTO todo.repeat_rules (user_id,title,summary,"rule")
     VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
    [userId, title, summary ?? null, JSON.stringify(rule)]
  );
  res.status(201).json(rows[0]);
});

router.patch('/repeat-rules/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error:'no user id' });
  const { id } = req.params;
  const sets = [], vals = [];
  if (req.body.title   !== undefined) { sets.push(`title=$${sets.length+1}`);   vals.push(req.body.title); }
  if (req.body.summary !== undefined) { sets.push(`summary=$${sets.length+1}`); vals.push(req.body.summary); }
  if (req.body.rule    !== undefined) { sets.push(`"rule"=$${sets.length+1}::jsonb`); vals.push(JSON.stringify(req.body.rule)); }
  if (!sets.length) return res.json({ ok:true });
  vals.push(userId, id);
  const { rows } = await dbQuery(
    `UPDATE todo.repeat_rules SET ${sets.join(',')}, updated_at=now()
       WHERE user_id=$${vals.length-1} AND id=$${vals.length}
       RETURNING *`, vals
  );
  if (!rows[0]) return res.status(404).json({ error:'not found' });
  res.json(rows[0]);
});

router.delete('/repeat-rules/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error:'no user id' });
  const { id } = req.params;
  const { rowCount } = await dbQuery(
    `DELETE FROM todo.repeat_rules WHERE id=$1 AND user_id=$2`,
    [id, userId]
  );
  if (!rowCount) return res.status(404).json({ error:'not found' });
  res.json({ ok:true });
});

/* ======================= Items: start / pause / finish ======================= */

router.post('/items/:id/start', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const own = await client.query(
      `SELECT started_at FROM todo.items WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    if (!own.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not found' });
    }

    await client.query(
      `UPDATE todo.sessions SET end_at = now()
        WHERE user_id=$1 AND end_at IS NULL
          AND item_id IN (SELECT id FROM todo.items WHERE user_id=$1 AND status='DOING'::todo.item_status)`,
      [userId]
    );
    await client.query(
      `UPDATE todo.items SET status='PAUSED'::todo.item_status, updated_at=now()
        WHERE user_id=$1 AND status='DOING'::todo.item_status`,
      [userId]
    );

    await client.query(
      `UPDATE todo.items
          SET status='DOING'::todo.item_status,
              today_flag=TRUE,
              started_at = COALESCE(started_at, now()),
              updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );

    const open = await client.query(
      `SELECT id FROM todo.sessions WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
      [id, userId]
    );
    if (!open.rowCount) {
      await client.query(
        `INSERT INTO todo.sessions (item_id, user_id, start_at) VALUES ($1,$2,now())`,
        [id, userId]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK'); console.error(e);
    res.status(500).json({ error: 'start failed' });
  } finally {
    client.release();
  }
});

router.post('/items/:id/pause', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE todo.sessions SET end_at=now()
        WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
      [id, userId]
    );
    await client.query(
      `UPDATE todo.items SET status='PAUSED'::todo.item_status, updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK'); console.error(e);
    res.status(500).json({ error: 'pause failed' });
  } finally {
    client.release();
  }
});

router.post('/items/:id/finish', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE todo.sessions SET end_at=now()
        WHERE item_id=$1 AND user_id=$2 AND end_at IS NULL`,
      [id, userId]
    );
    await client.query(
      `UPDATE todo.items
          SET status='DONE'::todo.item_status,
              remaining_amount=0,
              completed_at = now(),
              updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK'); console.error(e);
    res.status(500).json({ error: 'finish failed' });
  } finally {
    client.release();
  }
});

/* ======================= Day (v1.5仕様ベース + v1.7連携) ======================= */

async function upsertDailyReportAndGetId(userId, dateStr) {
  if (dateStr) {
    const { rows } = await dbQuery(
      `
      WITH upsert AS (
        INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
        VALUES ($1, $2::date, now(), now(), now())
        ON CONFLICT (user_id, report_date) DO NOTHING
        RETURNING id
      )
      SELECT id FROM upsert
      UNION ALL
      SELECT id FROM todo.daily_reports WHERE user_id = $1 AND report_date = $2::date
      LIMIT 1
      `,
      [userId, dateStr]
    );
    return rows[0]?.id || null;
  } else {
    const { rows } = await dbQuery(
      `
      WITH jst AS ( SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS d ),
      upsert AS (
        INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
        SELECT $1, jst.d, now(), now(), now() FROM jst
        ON CONFLICT (user_id, report_date) DO NOTHING
        RETURNING id
      )
      SELECT id FROM upsert
      UNION ALL
      SELECT dr.id FROM todo.daily_reports dr, jst
       WHERE dr.user_id = $1 AND dr.report_date = jst.d
      LIMIT 1
      `,
      [userId]
    );
    return rows[0]?.id || null;
  }
}

async function handleGetDayStart(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const dateStr = resolveJstDate(req.query?.date);
  dlog('day/start enter', { userId, dateStr });

  try {
    const dailyReportId = await upsertDailyReportAndGetId(userId, dateStr);
    dlog('day/start upsert daily_report', { dailyReportId });
    dlog('day/start enter', { userId, dateStr });

    await generateItemsFromRepeatRules(userId);
    dlog('day/start after generate');

    const { start: dayStart, end: dayEnd } = jstBounds(dateStr || jstTodayYmd());

    await dbQuery(`
      UPDATE todo.items n
        SET daily_report_id = $1, today_flag = TRUE, updated_at = now()
        FROM todo.items r
        LEFT JOIN todo.repeat_rules rr
          ON rr.id = r.repeat_rule_id AND rr.user_id = r.user_id
      WHERE n.user_id=$2
        AND n.kind='NORMAL'::todo.item_kind
        AND n.repeat_rule_id = rr.id
        AND r.kind='REPEAT'::todo.item_kind
        AND COALESCE(rr.default_today_flag, FALSE) = TRUE
        AND n.daily_report_id IS NULL
        AND n.due_at >= $3::timestamptz AND n.due_at < $4::timestamptz
    `, [dailyReportId, userId, dayStart, dayEnd]);

    const { rows: items } = await dbQuery(
      `
      SELECT i.*
      FROM todo.items i
      LEFT JOIN todo.daily_reports dr ON dr.id = i.daily_report_id AND dr.id = $2
      WHERE i.user_id = $1
        AND i.kind = 'NORMAL'::todo.item_kind
        AND (
          dr.id IS NOT NULL
          OR (i.daily_report_id IS NULL AND i.status <> 'DONE'::todo.item_status)
        )
      ORDER BY COALESCE(i.plan_start_at, i.due_at, i.created_at), i.priority, i.id
      `,
      [userId, dailyReportId]
    );

    res.json({
      daily_report_id: dailyReportId,
      items: items.map(r => ({ ...r, priority: denormalizePriority(r.priority) })),
    });
  } catch (e) {
    console.error('GET /todo/day/start error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
}
router.get('/day/start', handleGetDayStart);

async function handlePostDayStartConfirm(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  const { daily_report_id, item_ids } = req.body || {};
  if (!Number.isInteger(daily_report_id) || !Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ error: 'daily_report_id and item_ids are required' });
  }

  try {
    await dbQuery(
      `UPDATE todo.items
          SET daily_report_id = $1, today_flag = TRUE, updated_at = now()
        WHERE user_id = $2 AND id = ANY($3::int[])`,
      [daily_report_id, userId, item_ids]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /todo/day/start/confirm error:', e);
    res.status(500).json({ error: 'confirm failed' });
  }
}
router.post('/day/start/confirm', handlePostDayStartConfirm);

async function handlePostDayClose(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const dateStr = resolveJstDate(req.body?.date);
  const inputs = Array.isArray(req.body?.items) ? req.body.items : [];
  async function pickDailyReportRow(client) {
    if (dateStr) {
      const r = await client.query(
        `SELECT dr.*, to_char(dr.report_date, 'YYYY-MM-DD') AS ymd
           FROM todo.daily_reports dr
          WHERE dr.user_id=$1 AND dr.report_date=$2::date
          LIMIT 1`,
        [userId, dateStr]
      );
      return r.rows[0] || null;
    } else {
      const r = await client.query(
        `WITH jst AS (SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date d)
         SELECT dr.*, to_char(dr.report_date, 'YYYY-MM-DD') AS ymd
           FROM todo.daily_reports dr, jst
          WHERE dr.user_id=$1 AND dr.report_date=jst.d
          LIMIT 1`,
        [userId]
      );
      return r.rows[0] || null;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dr = await pickDailyReportRow(client);
    if (!dr) {
      await client.query('ROLLBACK');
      return res.json({ ok: true, note: 'no daily_report for the date' });
    }

    const reportId = dr.id;
    const ymd = dr.ymd;
    const { start: dayStart, end: dayEnd } = jstBounds(ymd);

    const { rows: itemsRows } = await client.query(
      `SELECT *
         FROM todo.items
        WHERE user_id=$1 AND daily_report_id=$2
        ORDER BY COALESCE(plan_start_at, due_at, created_at), priority, id`,
      [userId, reportId]
    );
    const itemIdList = itemsRows.map(i => Number(i.id));

    const { rows: rawSessions } = await client.query(
      `
      WITH bounds AS (SELECT $2::timestamptz AS day_start, $3::timestamptz AS day_end)
      SELECT s.item_id,
             GREATEST(s.start_at, b.day_start) AS start_at,
             LEAST(COALESCE(s.end_at, now()), b.day_end) AS end_at
        FROM todo.sessions s
        CROSS JOIN bounds b
       WHERE s.user_id=$1
         AND s.item_id = ANY($4::int[])
         AND s.start_at < b.day_end
         AND COALESCE(s.end_at, now()) > b.day_start
       ORDER BY s.start_at
      `,
      [userId, dayStart, dayEnd, itemIdList]
    );

    const sessByItem = new Map();
    for (const r of rawSessions) {
      const key = Number(r.item_id);
      const seconds = Math.max(0, Math.floor((new Date(r.end_at) - new Date(r.start_at)) / 1000));
      const arr = sessByItem.get(key) || [];
      arr.push({ start_at: r.start_at, end_at: r.end_at, seconds });
      sessByItem.set(key, arr);
    }

    const inputMap = new Map();
    for (const x of inputs) if (x && Number.isInteger(x.id)) inputMap.set(Number(x.id), x);

    // --- スナップショット ---
    for (const it of itemsRows) {
      const itemIdNum = Number(it.id);
      const inp = inputMap.get(itemIdNum) || {};

      if (inp.remaining_amount !== undefined) {
        await client.query(
          `UPDATE todo.items
              SET remaining_amount=$3, updated_at=now()
            WHERE user_id=$1 AND id=$2`,
          [userId, itemIdNum, inp.remaining_amount === null ? null : Number(inp.remaining_amount)]
        );
      }

      const planned =
        (inp.planned_minutes != null) ? Number(inp.planned_minutes) :
        (it.planned_minutes != null) ? Number(it.planned_minutes) :
        (it.plan_start_at && it.plan_end_at)
          ? Math.max(0, Math.round((new Date(it.plan_end_at) - new Date(it.plan_start_at)) / 60000))
          : null;

      const sessionsArr = sessByItem.get(itemIdNum) || [];

      const sessionsArrWithPlan = sessionsArr.map(s => ({
        ...s,
        plan_start_at: it.plan_start_at || null,
        plan_end_at: it.plan_end_at || null,
        planned_minutes: (planned ?? null),
      }));

      const sessionsJson = JSON.stringify(sessionsArrWithPlan);

      const spent =
        (inp.spent_minutes != null) ? Number(inp.spent_minutes)
                                    : sessionsArr.reduce((a, s) => a + Math.round(s.seconds / 60), 0);

      const tagsArr = it.tags_text
        ? String(it.tags_text).split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const upd = await client.query(
        `
        UPDATE todo.daily_report_items
           SET title = $3,
               status = $4,
               planned_minutes = $5,
               spent_minutes = $6,
               remaining_amount = $7,
               remaining_unit = $8,
               tags = $9::text[],
               note = $10,
               sessions = $11::jsonb
         WHERE report_id = $1 AND item_id = $2
         RETURNING id
        `,
        [
          reportId, itemIdNum, it.title, String(it.status),
          planned, spent, it.remaining_amount, it.unit,
          tagsArr, (inp.note ?? it.note ?? null), sessionsJson
        ]
      );

      if (upd.rowCount === 0) {
        await client.query(
          `
          INSERT INTO todo.daily_report_items (
            report_id, item_id, title, status,
            planned_minutes, spent_minutes,
            remaining_amount, remaining_unit,
            tags, note, sessions, created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11::jsonb, now())
          `,
          [
            reportId, itemIdNum, it.title, String(it.status),
            planned, spent, it.remaining_amount, it.unit,
            tagsArr, (inp.note ?? it.note ?? null), sessionsJson
          ]
        );
      }
    }

    await client.query(
      `
      UPDATE todo.daily_report_items AS dri
         SET note = i.description
        FROM todo.items AS i
       WHERE dri.report_id = $1
         AND i.user_id    = $2
         AND dri.item_id  = i.id
         AND (dri.note IS NULL OR dri.note = '')
      `,
      [reportId, userId]
    );

    await client.query(
      `
      UPDATE todo.daily_reports
         SET period_end_at = now(),
             updated_at = now()
       WHERE id = $1
      `,
      [reportId]
    );

    await client.query(
      `
      DELETE FROM todo.sessions
       WHERE user_id = $1
         AND item_id = ANY($2::int[])
      `,
      [userId, itemIdList]
    );

    await client.query(
      `
      UPDATE todo.items
         SET daily_report_id = NULL,
             today_flag = FALSE,
             updated_at = now()
       WHERE user_id = $1
         AND daily_report_id = $2
         AND status <> 'DONE'::todo.item_status
      `,
      [userId, reportId]
    );

    await client.query(
      `
      DELETE FROM todo.items
       WHERE user_id = $1
         AND daily_report_id = $2
         AND status = 'DONE'::todo.item_status
      `,
      [userId, reportId]
    );

    await client.query('COMMIT');
    res.json({ ok: true, daily_report_id: reportId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'close failed' });
  } finally {
    client.release();
  }
}
router.post('/day/close', handlePostDayClose);

/* ===== 互換エイリアス ===== */
router.get ('/start',  (req, res) => handleGetDayStart(req, res));
router.post('/commit', (req, res) => handlePostDayStartConfirm(req, res));
router.post('/close',  (req, res) => handlePostDayClose(req, res));

/* ======================= Reports ======================= */

router.get('/reports/daily', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });
  const { from, to } = req.query;

  const params = [userId];
  let extra = '';
  if (from) { params.push(from); extra += ` AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date >= $${params.length}`; }
  if (to)   { params.push(to);   extra += ` AND (s.start_at AT TIME ZONE 'Asia/Tokyo')::date <= $${params.length}`; }

  const q = `
    SELECT (s.start_at AT TIME ZONE 'Asia/Tokyo')::date AS jst_date,
           ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.end_at,now())-s.start_at)))/3600.0,2) AS hours
      FROM todo.sessions s
     WHERE s.user_id=$1 AND s.end_at IS NOT NULL
       ${extra}
     GROUP BY jst_date
     ORDER BY jst_date DESC
  `;
  const { rows } = await dbQuery(q, params);
  res.json(rows);
});

router.get('/reports/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!userId || !id) return res.status(400).json({ error: 'bad request' });

    const { rows } = await dbQuery(
      `SELECT id, report_date, period_start_at, period_end_at, created_at, updated_at
         FROM todo.daily_reports
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /todo/reports/:id error:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

router.patch('/reports/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const reportId = Number(req.params.id);

    const period_start_at = req.body?.period_start_at ?? req.body?.start_at ?? null;
    const period_end_at   = req.body?.period_end_at   ?? req.body?.end_at   ?? null;

    if (!reportId || !userId) {
      return res.status(400).json({ error: 'bad request' });
    }
    if (period_start_at == null && period_end_at == null) {
      return res.status(400).json({ error: 'nothing to update', body: req.body });
    }

    const sets = [];
    const vals = [userId, reportId];
    if (period_start_at != null) {
      sets.push(`period_start_at = $${vals.length + 1}`);
      vals.push(new Date(period_start_at));
    }
    if (period_end_at != null) {
      sets.push(`period_end_at = $${vals.length + 1}`);
      vals.push(new Date(period_end_at));
    }

    const sql = `
      UPDATE todo.daily_reports
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING id, report_date, period_start_at, period_end_at, created_at, updated_at
    `;
    const { rows } = await dbQuery(sql, vals);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /todo/reports/:id error:', e, 'body=', req.body);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/daily-reports/today', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'no user id in token' });

  try {
    const { rows } = await dbQuery(
      `
      WITH jst AS (
        SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS d
      ),
      upsert AS (
        INSERT INTO todo.daily_reports (user_id, report_date, period_start_at, created_at, updated_at)
        SELECT $1, jst.d, now(), now(), now() FROM jst
        ON CONFLICT (user_id, report_date) DO NOTHING
        RETURNING *
      )
      SELECT * FROM upsert
      UNION ALL
      SELECT dr.* FROM todo.daily_reports dr, jst
       WHERE dr.user_id = $1 AND dr.report_date = jst.d
      LIMIT 1
      `,
      [userId]
    );
    if (!rows[0]) return res.status(500).json({ error: 'cannot upsert daily_report' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /todo/daily-reports/today error:', e);
    res.status(500).json({ error: 'internal-error' });
  }
});

try {
  router.use(require('./reports'));
} catch (_) {
  // 任意：無ければスキップ
}

module.exports = router;

