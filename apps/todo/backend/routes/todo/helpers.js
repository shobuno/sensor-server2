// sensor-server/apps/todo/backend/routes/todo/helpers.js
const { pool, query: dbQuery } = require('../../../../../backend/config/db');

const isDbg = () => process.env.TODO_DEBUG === '1';
const dlog  = (...a) => { if (isDbg()) console.log('[todo]', new Date().toISOString(), ...a); };
const jst = (d) => d instanceof Date ? new Date(d.getTime() + 9*60*60000) : d;
const j = (d) => (d instanceof Date ? jst(d).toISOString().replace('Z','+09:00') : d);

function getUserId(req) { return req?.user?.id || req?.user?.id_uuid; }

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
function normalizeKind(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'NORMAL';
  const upper = s.toUpperCase();
  if (['NORMAL','TEMPLATE','REPEAT'].includes(upper)) return upper;
  const lower = s.toLowerCase();
  if (lower === 'repeat_rule') return 'REPEAT';
  return upper;
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

function nowJst() {
  const now = new Date();
  const offMin = new Date().getTimezoneOffset();
  return new Date(now.getTime() + (9 * 60 + offMin) * 60000);
}
function startOfDayJst(d = nowJst()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDayJst(d = nowJst())   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function withTimeOnDateJst(baseDate, hhmm) {
  const d = new Date(baseDate);
  const [h, m] = (hhmm || "09:00").split(":").map((x) => parseInt(x, 10) || 0);
  d.setHours(h, m, 0, 0);
  return d;
}
function lastDayOfMonthJst(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function jstTodayYmd() {
  const offMin = new Date().getTimezoneOffset();
  const j = new Date(Date.now() + (9*60 + offMin)*60000);
  const y = j.getFullYear(), m = String(j.getMonth()+1).padStart(2,'0'), d = String(j.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function jstBounds(ymd = jstTodayYmd()) {
  const addDays = (ymd, n) => {
    const [y,m,d] = ymd.split('-').map(Number);
    const base = new Date(Date.UTC(y, m-1, d, 15, 0, 0)); // UTC15 = JST00
    base.setUTCDate(base.getUTCDate() + n);
    const yy=base.getUTCFullYear(), mm=String(base.getUTCMonth()+1).padStart(2,'0'), dd=String(base.getUTCDate()).padStart(2,'0');
    return `${yy}-${mm}-${dd}`;
  };
  return { start: `${ymd}T00:00:00+09:00`, end: `${addDays(ymd,1)}T00:00:00+09:00` };
}

function pick(...names){ for (const n of names){ if (n in this && this[n]!=null) return this[n]; } return undefined; }
function normInt(v, def=null){ const n=Number(v); return Number.isFinite(n)?Math.floor(n):def; }
function normalizeWeekdays(input){
  if (input == null) return [];
  const map = new Map([['0','sun'],['7','sun'],['sun','sun'],['日','sun'],['1','mon'],['mon','mon'],['月','mon'],['2','tue'],['tue','tue'],['火','tue'],['3','wed'],['wed','wed'],['水','wed'],['4','thu'],['thu','thu'],['木','thu'],['5','fri'],['fri','fri'],['金','fri'],['6','sat'],['sat','sat'],['土','sat']]);
  let arr = Array.isArray(input) ? input : String(input).split(',');
  return Array.from(new Set(arr.map(x => String(x).trim().toLowerCase())
    .map(x => map.get(x) ?? (map.get(String(Number(x))) ?? null)).filter(Boolean)));
}

function extractRepeatSpecFromBody(body) {
  if (body && typeof body.repeat === 'object' && body.repeat) {
    if (typeof body.repeat.type === 'string') return body.repeat;
  }
  if (!body || typeof body !== 'object') return null;
  const get = pick.bind(body);
  let type = get('repeat_type','repeat_kind','recurrence','frequency','repeatMode','mode');
  if (typeof type === 'string') {
    const s = type.trim().toLowerCase();
    if (['weekly','week','weeks'].includes(s)) type = 'weekly';
    else if (['daily','day','days'].includes(s)) type = 'daily';
    else if (['monthly','month','months'].includes(s)) type = 'monthly';
    else if (['yearly','year','years','annual','annually'].includes(s)) type = 'yearly';
    else if (['none','no','off'].includes(s)) type = 'none';
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
  } else genPolicy = 'immediate';
  const advanceDays = normInt(get('advance_days','lead_days','before_days'), 0);
  const start_date = get('repeat_start','repeat_start_date','start_date','r_start');
  const end_date   = get('repeat_end','repeat_end_date','end_date','r_end');
  const timezone = get('timezone','tz') || 'Asia/Tokyo';
  if (type === 'none') return { type: 'none' };
  const base = { type, every, timezone, window: { start_date: start_date ?? null, end_date: end_date ?? null }, generate: { policy: genPolicy, advance_days: Math.max(0, advanceDays) } };
  if (type === 'weekly') return { ...base, weekdays: weekdays.length ? weekdays : ['mon'] };
  if (type === 'daily')  return base;
  if (type === 'monthly'){ const bymonthday = pick.bind(body)('bymonthday','monthday','day_of_month'); return { ...base, bymonthday: normInt(bymonthday, null) }; }
  if (type === 'yearly') return base;
  return { type: 'none' };
}

module.exports = {
  pool, dbQuery,
  isDbg, dlog, jst, j,
  getUserId,
  normalizePriority, denormalizePriority, normalizeBool, normalizeKind,
  normalizeTagsCsv, buildDueAt, resolveJstDate,
  nowJst, startOfDayJst, endOfDayJst, withTimeOnDateJst, lastDayOfMonthJst,
  jstTodayYmd, jstBounds,
  pick, normInt, normalizeWeekdays,
  extractRepeatSpecFromBody,
};
