// sensor-server/apps/todo/frontend/src/lib/apiRepeatRules.js

import { fetchJson } from "@/auth";

const BASE = "/todo/repeat-rules";

export async function listRepeatRules({ activeOnly = false } = {}) {
  const q = activeOnly ? "?active_only=true" : "";
  return await fetchJson(`${BASE}${q}`);
}

export async function getRepeatRule(id) {
  return await fetchJson(`${BASE}/${id}`);
}

export async function createRepeatRule(payload) {
  // payload 例:
  // { title, summary, rule:{type:"weekly",interval:1,byweekday:[1,3],time:"09:00"},
  //   timezone:"Asia/Tokyo", due_offset_days:0, default_today_flag:true,
  //   default_todo_flag:false, active:true, start_date:"2025-09-01", end_date:null }
  return await fetchJson(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRepeatRule(id, patch) {
  return await fetchJson(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteRepeatRule(id) {
  return await fetchJson(`${BASE}/${id}`, { method: "DELETE" });
}
